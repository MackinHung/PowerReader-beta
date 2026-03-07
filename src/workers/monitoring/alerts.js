/**
 * Alert Rules Engine (T07)
 *
 * Evaluates monitoring metrics against thresholds and manages
 * alert lifecycle: trigger -> suppress (1h) -> resolve.
 *
 * Navigation:
 * - Upstream: T07/MONITORING_DASHBOARD.md, shared/config.js MONITORING
 * - Downstream: Dashboard notifications, webhook integrations
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

import { MONITORING, CLOUDFLARE } from '../../../shared/config.js';

// --- Alert Rule Definitions ---

/**
 * Each rule defines: name, severity, check function, message builder, threshold.
 * check(m) returns true when the alert condition is TRIGGERED.
 */
/**
 * Alert rule field name reference (must match getFullMetrics output):
 *   kv_read_latency_ms: {avg, p95, p99}
 *   cdn_cache_hit_rate: number (0-1)
 *   crawler: {success_rate, total_crawled, pushed, failed}
 *   analysis: {pass_rate, passed, total, failed}
 *   workers_requests_today, kv_writes_today, d1_reads_today: number
 *   vectorize_queries_today, workers_ai_neurons_today: number
 *   r2_storage_gb: number
 */
export const ALERT_RULES = Object.freeze([
  {
    name: 'system_unavailable',
    severity: 'P0',
    check: (m) => m.health_status != null && m.health_status !== 200,
    message: (m) => `Health endpoint returned status ${m.health_status ?? 'unknown'} (expected 200)`,
    threshold: 200,
  },
  {
    name: 'kv_latency_high',
    severity: 'P1',
    check: (m) => (m.kv_read_latency_ms?.avg ?? 0) > MONITORING.ALERT_KV_LATENCY_MS,
    message: (m) => `KV read latency ${m.kv_read_latency_ms?.avg}ms exceeds ${MONITORING.ALERT_KV_LATENCY_MS}ms threshold`,
    threshold: MONITORING.ALERT_KV_LATENCY_MS,
  },
  {
    name: 'cdn_hit_rate_low',
    severity: 'P1',
    check: (m) => (m.cdn_cache_hit_rate ?? 1) < MONITORING.ALERT_CDN_HIT_RATE_THRESHOLD,
    message: (m) => `CDN cache hit rate ${((m.cdn_cache_hit_rate ?? 0) * 100).toFixed(1)}% below ${MONITORING.ALERT_CDN_HIT_RATE_THRESHOLD * 100}% threshold`,
    threshold: MONITORING.ALERT_CDN_HIT_RATE_THRESHOLD,
  },
  {
    name: 'crawler_failure_high',
    severity: 'P1',
    check: (m) => {
      const rate = m.crawler?.success_rate ?? 1;
      return (1 - rate) > MONITORING.ALERT_CRAWLER_FAILURE_THRESHOLD;
    },
    message: (m) => {
      const failRate = 1 - (m.crawler?.success_rate ?? 1);
      return `Crawler failure rate ${(failRate * 100).toFixed(1)}% exceeds ${MONITORING.ALERT_CRAWLER_FAILURE_THRESHOLD * 100}% threshold`;
    },
    threshold: MONITORING.ALERT_CRAWLER_FAILURE_THRESHOLD,
  },
  {
    name: 'd1_reads_near_limit',
    severity: 'P1',
    check: (m) => (m.d1_reads_today ?? 0) > CLOUDFLARE.D1_DAILY_READ_LIMIT * MONITORING.ALERT_D1_STORAGE_PCT,
    message: (m) => `D1 daily reads ${m.d1_reads_today} approaching limit (${CLOUDFLARE.D1_DAILY_READ_LIMIT}/day)`,
    threshold: CLOUDFLARE.D1_DAILY_READ_LIMIT * MONITORING.ALERT_D1_STORAGE_PCT,
  },
  {
    name: 'workers_ai_near_limit',
    severity: 'P1',
    check: (m) => (m.workers_ai_neurons_today ?? 0) > CLOUDFLARE.WORKERS_AI_DAILY_LIMIT * MONITORING.ALERT_WORKERS_AI_NEURONS_PCT,
    message: (m) => `Workers AI neurons ${m.workers_ai_neurons_today} approaching daily limit (${CLOUDFLARE.WORKERS_AI_DAILY_LIMIT}/day)`,
    threshold: CLOUDFLARE.WORKERS_AI_DAILY_LIMIT * MONITORING.ALERT_WORKERS_AI_NEURONS_PCT,
  },
  {
    name: 'analysis_pass_rate_low',
    severity: 'P2',
    check: (m) => (m.analysis?.pass_rate ?? 1) < (1 - MONITORING.ALERT_ANALYSIS_FAILURE_THRESHOLD),
    message: (m) => `Analysis pass rate ${((m.analysis?.pass_rate ?? 0) * 100).toFixed(1)}% below 60% threshold`,
    threshold: 1 - MONITORING.ALERT_ANALYSIS_FAILURE_THRESHOLD,
  },
  {
    name: 'kv_writes_near_limit',
    severity: 'P2',
    check: (m) => (m.kv_writes_today ?? 0) > CLOUDFLARE.KV_DAILY_WRITE_LIMIT * MONITORING.ALERT_KV_WRITES_PCT,
    message: (m) => `KV daily writes ${m.kv_writes_today} approaching limit (${CLOUDFLARE.KV_DAILY_WRITE_LIMIT}/day)`,
    threshold: CLOUDFLARE.KV_DAILY_WRITE_LIMIT * MONITORING.ALERT_KV_WRITES_PCT,
  },
  {
    name: 'vectorize_near_limit',
    severity: 'P2',
    check: (m) => (m.vectorize_queries_today ?? 0) > CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT * MONITORING.ALERT_VECTORIZE_QUERIES_PCT,
    message: (m) => `Vectorize query dimensions ${m.vectorize_queries_today} approaching monthly limit (${CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT}/month)`,
    threshold: CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT * MONITORING.ALERT_VECTORIZE_QUERIES_PCT,
  },
  {
    name: 'r2_storage_near_limit',
    severity: 'P3',
    check: (m) => (m.r2_storage_gb ?? 0) > CLOUDFLARE.R2_MAX_STORAGE_GB * MONITORING.ALERT_R2_STORAGE_PCT,
    message: (m) => `R2 storage ${m.r2_storage_gb?.toFixed(2)}GB approaching ${CLOUDFLARE.R2_MAX_STORAGE_GB}GB limit`,
    threshold: CLOUDFLARE.R2_MAX_STORAGE_GB * MONITORING.ALERT_R2_STORAGE_PCT,
  },
  {
    name: 'workers_requests_high',
    severity: 'P3',
    check: (m) => (m.workers_requests_today ?? 0) > CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT * MONITORING.ALERT_WORKERS_REQUESTS_PCT,
    message: (m) => `Workers daily requests ${m.workers_requests_today} approaching ${CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT}/day limit`,
    threshold: CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT * MONITORING.ALERT_WORKERS_REQUESTS_PCT,
  },
]);

// --- Core Functions ---

/**
 * Evaluate all alert rules against current metrics.
 * Creates new alerts for triggered conditions, resolves cleared ones.
 *
 * @param {object} env - Workers env with DB (D1) binding
 * @param {object} metrics - Current system metrics snapshot
 * @returns {Promise<Array<{name: string, severity: string, message: string}>>} Newly triggered alerts
 */
export async function evaluateAlerts(env, metrics) {
  const now = new Date().toISOString();
  const newAlerts = [];

  const existingAlerts = await fetchAlertsByStatus(env, ['active', 'suppressed']);
  const alertMap = buildAlertMap(existingAlerts);

  for (const rule of ALERT_RULES) {
    const triggered = rule.check(metrics);
    const existing = alertMap.get(rule.name);

    if (triggered) {
      const alert = await handleTriggered(env, rule, existing, metrics, now);
      if (alert !== null) {
        newAlerts.push(alert);
      }
    } else if (existing && existing.status === 'active') {
      await markResolved(env, rule.name, now);
    }
  }

  return newAlerts;
}

/**
 * Handle a triggered alert rule.
 * Returns the new alert record if created, null if suppressed or already active.
 */
async function handleTriggered(env, rule, existing, metrics, now) {
  if (existing && existing.status === 'active') {
    return null;
  }

  if (existing && existing.status === 'suppressed') {
    const suppressedUntil = new Date(existing.suppressed_until);
    if (suppressedUntil > new Date(now)) {
      return null;
    }
  }

  const alertRecord = {
    name: rule.name,
    severity: rule.severity,
    message: rule.message(metrics),
    metric_value: extractMetricValue(metrics, rule.name),
    threshold: rule.threshold,
  };

  await insertAlert(env, alertRecord, now);

  return alertRecord;
}

/**
 * Extract the relevant metric value for a given alert rule name.
 */
function extractMetricValue(metrics, alertName) {
  const mapping = {
    system_unavailable: metrics.health_status,
    kv_latency_high: metrics.kv_read_latency_ms?.avg,
    cdn_hit_rate_low: metrics.cdn_cache_hit_rate,
    crawler_failure_high: 1 - (metrics.crawler?.success_rate ?? 1),
    d1_reads_near_limit: metrics.d1_reads_today,
    workers_ai_near_limit: metrics.workers_ai_neurons_today,
    analysis_pass_rate_low: metrics.analysis?.pass_rate,
    kv_writes_near_limit: metrics.kv_writes_today,
    vectorize_near_limit: metrics.vectorize_queries_today,
    r2_storage_near_limit: metrics.r2_storage_gb,
    workers_requests_high: metrics.workers_requests_today,
  };

  return mapping[alertName] ?? null;
}

/**
 * Build a Map of alert_name -> alert record for fast lookup.
 */
function buildAlertMap(alerts) {
  const map = new Map();
  for (const alert of alerts) {
    map.set(alert.alert_name, alert);
  }
  return map;
}

// --- D1 Data Access ---

/**
 * Fetch alerts filtered by status values.
 * @param {object} env - Workers env with DB binding
 * @param {string[]} statuses - Array of status values to include
 * @returns {Promise<Array>}
 */
async function fetchAlertsByStatus(env, statuses) {
  const placeholders = statuses.map(() => '?').join(', ');
  const stmt = env.DB.prepare(
    `SELECT id, alert_name, severity, message, metric_value, threshold_value,
            status, triggered_at, resolved_at, suppressed_until
     FROM alerts
     WHERE status IN (${placeholders})`
  );
  const result = await stmt.bind(...statuses).all();
  return result.results ?? [];
}

/**
 * Insert a new active alert into D1.
 */
async function insertAlert(env, alertRecord, now) {
  await env.DB.prepare(
    `INSERT INTO alerts (alert_name, severity, message, metric_value, threshold_value, status, triggered_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).bind(
    alertRecord.name,
    alertRecord.severity,
    alertRecord.message,
    alertRecord.metric_value,
    alertRecord.threshold,
    now
  ).run();
}

/**
 * Mark an active alert as resolved.
 */
async function markResolved(env, alertName, now) {
  await env.DB.prepare(
    `UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE alert_name = ? AND status = 'active'`
  ).bind(now, alertName).run();
}

// --- Public API Functions ---

/**
 * Suppress an active alert for a given duration.
 * The same alert_name will not re-trigger until suppressed_until expires.
 *
 * @param {object} env - Workers env with DB binding
 * @param {string} alertName - The alert name to suppress
 * @param {number} durationMinutes - Suppression duration (default 60 minutes)
 * @returns {Promise<boolean>} true if an alert was suppressed, false if none found
 */
export async function suppressAlert(env, alertName, durationMinutes = 60) {
  const suppressedUntil = new Date(
    Date.now() + durationMinutes * 60 * 1000
  ).toISOString();

  const result = await env.DB.prepare(
    `UPDATE alerts
     SET status = 'suppressed', suppressed_until = ?
     WHERE alert_name = ? AND status = 'active'`
  ).bind(suppressedUntil, alertName).run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get all currently active alerts.
 *
 * @param {object} env - Workers env with DB binding
 * @returns {Promise<Array>} Active alert records
 */
export async function getActiveAlerts(env) {
  const result = await env.DB.prepare(
    `SELECT id, alert_name, severity, message, metric_value, threshold_value,
            status, triggered_at, resolved_at, suppressed_until
     FROM alerts
     WHERE status = 'active'
     ORDER BY triggered_at DESC`
  ).all();

  return result.results ?? [];
}

/**
 * Get alert history within a given time window.
 *
 * @param {object} env - Workers env with DB binding
 * @param {number} hoursBack - How many hours of history to retrieve (default 24)
 * @returns {Promise<Array>} Alert records within the time window
 */
export async function getAlertHistory(env, hoursBack = 24) {
  const since = new Date(
    Date.now() - hoursBack * 60 * 60 * 1000
  ).toISOString();

  const result = await env.DB.prepare(
    `SELECT id, alert_name, severity, message, metric_value, threshold_value,
            status, triggered_at, resolved_at, suppressed_until
     FROM alerts
     WHERE triggered_at >= ?
     ORDER BY triggered_at DESC`
  ).bind(since).all();

  return result.results ?? [];
}

/**
 * Manually resolve an alert by name.
 *
 * @param {object} env - Workers env with DB binding
 * @param {string} alertName - The alert name to resolve
 * @returns {Promise<boolean>} true if an alert was resolved, false if none found
 */
export async function resolveAlert(env, alertName) {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = ?
     WHERE alert_name = ? AND status = 'active'`
  ).bind(now, alertName).run();

  return (result.meta?.changes ?? 0) > 0;
}
