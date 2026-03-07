/**
 * Metrics Aggregation Module (T07)
 *
 * Reads D1 metrics tables and computes aggregated statistics
 * for the /api/v1/metrics endpoint and monitoring dashboard.
 *
 * Navigation:
 * - Upstream: T07/MONITORING_DASHBOARD.md, migrations/0002_metrics.sql
 * - Downstream: src/workers/handlers/health.js
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

import { CLOUDFLARE, MONITORING } from '../../../shared/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date in ISO 8601 format (YYYY-MM-DD). */
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute a cutoff timestamp N hours in the past.
 * @param {number} hoursBack
 * @returns {string} ISO 8601 datetime truncated to the hour
 */
function hourCutoff(hoursBack) {
  const d = new Date(Date.now() - hoursBack * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 19);
}

/**
 * Safely extract a numeric value from a D1 row, falling back to a default.
 * @param {object|null} row
 * @param {string} column
 * @param {number} fallback
 * @returns {number}
 */
function safeNumber(row, column, fallback = 0) {
  if (!row || row[column] == null) return fallback;
  const n = Number(row[column]);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// 1. getLatencyStats
// ---------------------------------------------------------------------------

/**
 * Query metrics_hourly for the last N hours and compute weighted avg / p95.
 *
 * Weighted average: SUM(avg_value * count) / SUM(count)
 * P95: MAX(p95_value) across buckets (conservative upper bound)
 *
 * @param {object} env - Workers env bindings (env.DB = D1)
 * @param {string} metricName - e.g. 'kv_read_latency_ms'
 * @param {number} [hoursBack=24]
 * @returns {Promise<{avg: number, p95: number, p99: number}>}
 */
export async function getLatencyStats(env, metricName, hoursBack = 24) {
  const cutoff = hourCutoff(hoursBack);

  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(avg_value * count), 0)  AS weighted_sum,
       COALESCE(SUM(count), 0)              AS total_count,
       COALESCE(MAX(p95_value), 0)          AS max_p95,
       COALESCE(MAX(max_value), 0)          AS max_val
     FROM metrics_hourly
     WHERE metric_name = ? AND hour >= ?`
  ).bind(metricName, cutoff).first();

  const totalCount = safeNumber(row, 'total_count');
  const weightedAvg = totalCount > 0
    ? Math.round(safeNumber(row, 'weighted_sum') / totalCount)
    : 0;
  const p95 = Math.round(safeNumber(row, 'max_p95'));
  // p99 is approximated as the maximum observed value across all hours
  const p99 = Math.round(safeNumber(row, 'max_val'));

  return { avg: weightedAvg, p95, p99 };
}

// ---------------------------------------------------------------------------
// 2. getDailyCounter
// ---------------------------------------------------------------------------

/**
 * Read a single counter from the daily_counters table.
 *
 * @param {object} env
 * @param {string} counterName - e.g. 'workers_requests', 'kv_writes'
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {Promise<number>}
 */
export async function getDailyCounter(env, counterName, date) {
  const targetDate = date || todayDate();

  const row = await env.DB.prepare(
    `SELECT value FROM daily_counters
     WHERE date = ? AND counter_name = ?`
  ).bind(targetDate, counterName).first();

  return safeNumber(row, 'value');
}

// ---------------------------------------------------------------------------
// 3. getCrawlerStats
// ---------------------------------------------------------------------------

/**
 * Query crawler_runs for a given date and compute success rate.
 * success_rate = pushed / (pushed + failed)
 *
 * @param {object} env
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {Promise<{success_rate: number, total_crawled: number, pushed: number, failed: number}>}
 */
export async function getCrawlerStats(env, date) {
  const targetDate = date || todayDate();

  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(total_crawled), 0)  AS total_crawled,
       COALESCE(SUM(pushed_count), 0)   AS pushed,
       COALESCE(SUM(failed_count), 0)   AS failed
     FROM crawler_runs
     WHERE run_at >= ? AND run_at < ?`
  ).bind(targetDate, targetDate + 'T23:59:59').first();

  const pushed = safeNumber(row, 'pushed');
  const failed = safeNumber(row, 'failed');
  const denominator = pushed + failed;
  const successRate = denominator > 0
    ? Math.round((pushed / denominator) * 100) / 100
    : 0;

  return {
    success_rate: successRate,
    total_crawled: safeNumber(row, 'total_crawled'),
    pushed,
    failed,
  };
}

// ---------------------------------------------------------------------------
// 4. getAnalysisStats
// ---------------------------------------------------------------------------

/**
 * Query the analyses table for a given date and compute pass rate.
 * pass_rate = count(quality_gate_result = 'passed') / total
 *
 * @param {object} env
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {Promise<{pass_rate: number, passed: number, total: number}>}
 */
export async function getAnalysisStats(env, date) {
  const targetDate = date || todayDate();

  const row = await env.DB.prepare(
    `SELECT
       COUNT(*)                                           AS total,
       SUM(CASE WHEN quality_gate_result = 'passed' THEN 1 ELSE 0 END) AS passed
     FROM analyses
     WHERE created_at >= ? AND created_at < ?`
  ).bind(targetDate, targetDate + 'T23:59:59').first();

  const total = safeNumber(row, 'total');
  const passed = safeNumber(row, 'passed');
  const passRate = total > 0
    ? Math.round((passed / total) * 100) / 100
    : 0;

  return { pass_rate: passRate, passed, total };
}

// ---------------------------------------------------------------------------
// 5. getLatencyTrend
// ---------------------------------------------------------------------------

/**
 * Return an array of { hour, avg, p95 } for trend chart rendering.
 *
 * @param {object} env
 * @param {string} metricName
 * @param {number} [hoursBack=24]
 * @returns {Promise<Array<{hour: string, avg: number, p95: number}>>}
 */
export async function getLatencyTrend(env, metricName, hoursBack = 24) {
  const cutoff = hourCutoff(hoursBack);

  const { results } = await env.DB.prepare(
    `SELECT hour, avg_value, p95_value
     FROM metrics_hourly
     WHERE metric_name = ? AND hour >= ?
     ORDER BY hour ASC`
  ).bind(metricName, cutoff).all();

  if (!results || results.length === 0) {
    return [];
  }

  return results.map((r) => ({
    hour: r.hour,
    avg: Math.round(safeNumber(r, 'avg_value')),
    p95: Math.round(safeNumber(r, 'p95_value')),
  }));
}

// ---------------------------------------------------------------------------
// 6. getCdnCacheHitRate
// ---------------------------------------------------------------------------

/**
 * Compute CDN cache hit rate from metrics_hourly over the last N hours.
 * The 'cdn_cache_hit' metric stores count = total requests, sum_value = hit count.
 *
 * @param {object} env
 * @param {number} [hoursBack=24]
 * @returns {Promise<number>} hit rate between 0 and 1
 */
async function getCdnCacheHitRate(env, hoursBack = 24) {
  const cutoff = hourCutoff(hoursBack);

  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(sum_value), 0) AS hits,
       COALESCE(SUM(count), 0)     AS total
     FROM metrics_hourly
     WHERE metric_name = 'cdn_cache_hit' AND hour >= ?`
  ).bind(cutoff).first();

  const total = safeNumber(row, 'total');
  const hits = safeNumber(row, 'hits');
  return total > 0
    ? Math.round((hits / total) * 100) / 100
    : 0;
}

// ---------------------------------------------------------------------------
// 7. getModelInferenceAvg
// ---------------------------------------------------------------------------

/**
 * Get average model inference time from metrics_hourly.
 *
 * @param {object} env
 * @param {number} [hoursBack=24]
 * @returns {Promise<number>} average seconds, rounded to 1 decimal
 */
async function getModelInferenceAvg(env, hoursBack = 24) {
  const cutoff = hourCutoff(hoursBack);

  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(avg_value * count), 0) AS weighted_sum,
       COALESCE(SUM(count), 0)             AS total_count
     FROM metrics_hourly
     WHERE metric_name = 'model_inference_ms' AND hour >= ?`
  ).bind(cutoff).first();

  const totalCount = safeNumber(row, 'total_count');
  if (totalCount === 0) return 0;

  const avgMs = safeNumber(row, 'weighted_sum') / totalCount;
  // Convert ms to seconds, round to 1 decimal
  return Math.round((avgMs / 1000) * 10) / 10;
}

// ---------------------------------------------------------------------------
// 8. getFullMetrics (main entry point)
// ---------------------------------------------------------------------------

/**
 * Main function called by health.js to produce the full metrics payload
 * matching the MONITORING_DASHBOARD.md spec.
 *
 * Runs all sub-queries in parallel for minimal latency.
 *
 * @param {object} env - Workers env bindings
 * @returns {Promise<object>} Metrics object for /api/v1/metrics
 */
export async function getFullMetrics(env) {
  const today = todayDate();

  const [
    kvLatency,
    d1Latency,
    cdnHitRate,
    crawlerStats,
    analysisStats,
    workersRequests,
    kvWrites,
    d1Reads,
    vectorizeQueries,
    workersAiNeurons,
    activeUsers,
    modelInferenceAvg,
    kvLatencyTrend,
    cdnHitRateTrend,
  ] = await Promise.all([
    getLatencyStats(env, 'kv_read_latency_ms'),
    getLatencyStats(env, 'd1_query_latency_ms'),
    getCdnCacheHitRate(env),
    getCrawlerStats(env, today),
    getAnalysisStats(env, today),
    getDailyCounter(env, 'workers_requests', today),
    getDailyCounter(env, 'kv_writes', today),
    getDailyCounter(env, 'd1_reads', today),
    getDailyCounter(env, 'vectorize_query_dims', today),
    getDailyCounter(env, 'workers_ai_neurons', today),
    getDailyCounter(env, 'active_users', today),
    getModelInferenceAvg(env),
    getLatencyTrend(env, 'kv_read_latency_ms'),
    getLatencyTrend(env, 'cdn_cache_hit'),
  ]);

  // R2 storage is not available via D1; fall back to daily_counters if tracked
  const r2StorageRaw = await getDailyCounter(env, 'r2_storage_bytes', today);
  const r2StorageGb = r2StorageRaw > 0
    ? Math.round((r2StorageRaw / (1024 ** 3)) * 10) / 10
    : 0;

  return {
    period: today,
    kv_read_latency_ms: kvLatency,
    d1_query_latency_ms: d1Latency,
    cdn_cache_hit_rate: cdnHitRate,
    model_inference_avg_sec: modelInferenceAvg,
    // Crawler details (for dashboard panels)
    crawler: {
      success_rate: crawlerStats.success_rate,
      total_crawled: crawlerStats.total_crawled,
      pushed: crawlerStats.pushed,
      failed: crawlerStats.failed,
    },
    // Analysis details (for dashboard panels)
    analysis: {
      pass_rate: analysisStats.pass_rate,
      passed: analysisStats.passed,
      total: analysisStats.total,
      failed: analysisStats.total - analysisStats.passed,
    },
    // Daily resource counters
    workers_requests_today: workersRequests,
    kv_writes_today: kvWrites,
    d1_reads_today: d1Reads,
    vectorize_queries_today: vectorizeQueries,
    workers_ai_neurons_today: workersAiNeurons,
    r2_storage_gb: r2StorageGb,
    active_users_today: activeUsers,
    // Trend data (24h hourly arrays for charts)
    kv_latency_history: kvLatencyTrend,
    cdn_hit_rate_history: cdnHitRateTrend.map((p) => ({
      hour: p.hour,
      value: Math.round(p.avg * 100),
    })),
  };
}
