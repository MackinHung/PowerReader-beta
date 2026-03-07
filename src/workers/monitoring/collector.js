/**
 * Metrics Collector Middleware (T07)
 *
 * Lightweight per-request metrics collection with async D1 flush.
 * Respects Workers CPU budget (10ms free tier) by deferring writes.
 *
 * Navigation:
 * - Upstream: T07/MONITORING_DASHBOARD.md
 * - Downstream: src/workers/index.js (integration point)
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

// --- Helpers ---

/**
 * Get today's date as ISO 8601 date string (YYYY-MM-DD) in UTC.
 * @returns {string}
 */
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get the current hour truncated to ISO 8601 format (e.g. '2026-03-07T14:00:00').
 * @returns {string}
 */
function currentHourString() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString().replace('.000Z', '').replace('Z', '');
}

/**
 * Compute the p95 value from a sorted array of numbers.
 * @param {number[]} sorted - Pre-sorted ascending array
 * @returns {number|null}
 */
function computeP95(sorted) {
  if (sorted.length === 0) return null;
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

// --- Factory ---

/**
 * Create a lightweight metrics collector for a single request lifecycle.
 *
 * Workers are stateless on the free tier, so each request gets a fresh
 * collector. All heavy work (D1 writes) is deferred via ctx.waitUntil().
 *
 * @returns {MetricsCollector}
 *
 * @example
 * const collector = createMetricsCollector();
 * collector.recordLatency('kv_read_latency_ms', 18);
 * collector.recordCacheHit(true);
 * collector.recordRequest();
 * collector.incrementCounter('workers_ai_neurons', 1.6);
 * ctx.waitUntil(collector.flush(env));
 */
export function createMetricsCollector() {
  // In-memory batch buffers — only written to during request handling.
  // These are plain arrays/objects; the collector never mutates external state.
  const latencySamples = [];
  const counters = {};
  let cacheHits = 0;
  let cacheMisses = 0;

  return {
    /**
     * Record a latency measurement.
     * Pushes to an in-memory array — O(1) amortized, no I/O.
     *
     * @param {string} metricName - e.g. 'kv_read_latency_ms', 'd1_query_latency_ms'
     * @param {number} valueMs - Latency in milliseconds
     */
    recordLatency(metricName, valueMs) {
      latencySamples.push({
        metric_name: metricName,
        value: valueMs,
        recorded_at: new Date().toISOString(),
      });
    },

    /**
     * Track a cache hit or miss.
     *
     * @param {boolean} hit - true for cache hit, false for miss
     */
    recordCacheHit(hit) {
      if (hit) {
        cacheHits += 1;
      } else {
        cacheMisses += 1;
      }
    },

    /**
     * Increment the daily workers_requests counter by 1.
     */
    recordRequest() {
      const key = 'workers_requests';
      counters[key] = (counters[key] || 0) + 1;
    },

    /**
     * Increment a named daily counter by the given amount.
     *
     * @param {string} counterName - e.g. 'workers_ai_neurons', 'vectorize_query_dims'
     * @param {number} amount - Value to add (can be fractional)
     */
    incrementCounter(counterName, amount) {
      counters[counterName] = (counters[counterName] || 0) + amount;
    },

    /**
     * Flush all buffered metrics to D1.
     *
     * Designed to run inside ctx.waitUntil() so it executes after the
     * response has been sent to the client. Uses D1 batch API to minimize
     * round-trips.
     *
     * @param {object} env - Workers env bindings (must include env.DB)
     * @returns {Promise<void>}
     */
    async flush(env) {
      const statements = buildFlushStatements(
        env,
        latencySamples,
        counters,
        cacheHits,
        cacheMisses,
      );

      if (statements.length === 0) {
        return;
      }

      try {
        await env.DB.batch(statements);
      } catch (err) {
        // Log but never throw — flush failures must not crash the worker.
        console.error('[MetricsCollector] flush failed:', err.message);
      }

      // Clear buffers after successful (or failed) flush
      latencySamples.length = 0;
      cacheHits = 0;
      cacheMisses = 0;
      Object.keys(counters).forEach((k) => delete counters[k]);
    },
  };
}

// --- Statement Builders ---

/**
 * Build the array of D1 prepared statements for a flush operation.
 *
 * @param {object} env - Workers env bindings
 * @param {Array<{metric_name: string, value: number, recorded_at: string}>} samples
 * @param {Record<string, number>} counterMap
 * @param {number} hits
 * @param {number} misses
 * @returns {D1PreparedStatement[]}
 */
function buildFlushStatements(env, samples, counterMap, hits, misses) {
  const statements = [];
  const date = todayDateString();

  // 1. INSERT raw latency samples into metrics_raw
  for (const sample of samples) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO metrics_raw (metric_name, value, recorded_at) VALUES (?, ?, ?)',
      ).bind(sample.metric_name, sample.value, sample.recorded_at),
    );
  }

  // 2. UPSERT cache hit/miss into daily_counters
  if (hits > 0) {
    statements.push(buildCounterUpsert(env, date, 'cdn_cache_hit', hits));
  }
  if (misses > 0) {
    statements.push(buildCounterUpsert(env, date, 'cdn_cache_miss', misses));
  }

  // 3. UPSERT all other daily counters
  for (const [name, value] of Object.entries(counterMap)) {
    if (value !== 0) {
      statements.push(buildCounterUpsert(env, date, name, value));
    }
  }

  return statements;
}

/**
 * Build a single UPSERT statement for a daily counter.
 *
 * @param {object} env - Workers env bindings
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} counterName
 * @param {number} value
 * @returns {D1PreparedStatement}
 */
function buildCounterUpsert(env, date, counterName, value) {
  return env.DB.prepare(
    `INSERT INTO daily_counters (date, counter_name, value)
     VALUES (?, ?, ?)
     ON CONFLICT(date, counter_name) DO UPDATE SET value = value + excluded.value`,
  ).bind(date, counterName, value);
}

// --- Cron Aggregation ---

/**
 * Aggregate raw metric samples into hourly rollups.
 *
 * Called by a Cron Trigger (30s CPU budget, NOT per-request).
 * Reads metrics_raw for the last hour, computes stats, and writes to
 * metrics_hourly. Then cleans up raw samples older than 2 hours.
 *
 * @param {object} env - Workers env bindings (must include env.DB)
 * @returns {Promise<{aggregated: number, deleted: number}>}
 */
export async function aggregateHourly(env) {
  const hour = currentHourString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  // 1. Read raw samples from the last hour
  const rawRows = await env.DB.prepare(
    `SELECT metric_name, value
     FROM metrics_raw
     WHERE recorded_at >= ? AND recorded_at < ?
     ORDER BY metric_name, value ASC`,
  )
    .bind(oneHourAgo, new Date().toISOString())
    .all();

  const samples = rawRows.results || [];

  if (samples.length === 0) {
    // Still clean up stale rows even if no new samples
    const deleteResult = await deleteStaleRawSamples(env, twoHoursAgo);
    return { aggregated: 0, deleted: deleteResult };
  }

  // 2. Group by metric_name
  const grouped = groupByMetricName(samples);

  // 3. Compute aggregates and build upsert statements
  const statements = buildAggregationStatements(env, grouped, hour);

  // 4. Execute aggregation upserts
  if (statements.length > 0) {
    try {
      await env.DB.batch(statements);
    } catch (err) {
      console.error('[MetricsCollector] aggregateHourly batch failed:', err.message);
      throw err;
    }
  }

  // 5. Delete processed raw samples older than 2 hours
  const deleted = await deleteStaleRawSamples(env, twoHoursAgo);

  return { aggregated: statements.length, deleted };
}

/**
 * Group an array of {metric_name, value} rows by metric_name.
 * Values within each group are assumed to be pre-sorted ascending.
 *
 * @param {Array<{metric_name: string, value: number}>} rows
 * @returns {Record<string, number[]>}
 */
function groupByMetricName(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.metric_name]) {
      grouped[row.metric_name] = [];
    }
    grouped[row.metric_name].push(row.value);
  }
  return grouped;
}

/**
 * Build UPSERT statements for hourly aggregation.
 *
 * @param {object} env
 * @param {Record<string, number[]>} grouped - metric_name -> sorted values
 * @param {string} hour - ISO 8601 hour string
 * @returns {D1PreparedStatement[]}
 */
function buildAggregationStatements(env, grouped, hour) {
  const statements = [];

  for (const [metricName, values] of Object.entries(grouped)) {
    const stats = computeStats(values);

    statements.push(
      env.DB.prepare(
        `INSERT INTO metrics_hourly (metric_name, hour, count, sum_value, min_value, max_value, avg_value, p95_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(metric_name, hour) DO UPDATE SET
           count = count + excluded.count,
           sum_value = sum_value + excluded.sum_value,
           min_value = MIN(min_value, excluded.min_value),
           max_value = MAX(max_value, excluded.max_value),
           avg_value = (sum_value + excluded.sum_value) / (count + excluded.count),
           p95_value = excluded.p95_value`,
      ).bind(
        metricName,
        hour,
        stats.count,
        stats.sum,
        stats.min,
        stats.max,
        stats.avg,
        stats.p95,
      ),
    );
  }

  return statements;
}

/**
 * Compute descriptive statistics from a sorted array of values.
 *
 * @param {number[]} values - Pre-sorted ascending
 * @returns {{count: number, sum: number, min: number, max: number, avg: number, p95: number|null}}
 */
function computeStats(values) {
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const min = values[0];
  const max = values[count - 1];
  const avg = count > 0 ? sum / count : 0;
  const p95 = computeP95(values);

  return { count, sum, min, max, avg, p95 };
}

/**
 * Delete raw metric samples older than the given cutoff.
 *
 * @param {object} env
 * @param {string} cutoff - ISO 8601 datetime string
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteStaleRawSamples(env, cutoff) {
  try {
    const result = await env.DB.prepare(
      'DELETE FROM metrics_raw WHERE recorded_at < ?',
    )
      .bind(cutoff)
      .run();

    return result.meta?.changes || 0;
  } catch (err) {
    console.error('[MetricsCollector] deleteStaleRawSamples failed:', err.message);
    return 0;
  }
}
