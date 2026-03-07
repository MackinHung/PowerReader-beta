/**
 * Health & Monitoring Handlers
 *
 * T01 owns route registration (router.js).
 * T07 provides monitoring logic via monitoring/ modules.
 *
 * Maintainer: T01 (route skeleton) + T07 (monitoring logic)
 * Last Updated: 2026-03-07 — T07 integrated probes, metrics, usage, alerts
 */

import { CLOUDFLARE } from '../../../shared/config.js';
import { nowISO } from '../../../shared/utils.js';
import { runAllProbes } from '../monitoring/probes.js';
import { getFullMetrics, getDailyCounter } from '../monitoring/metrics.js';
import { getActiveAlerts } from '../monitoring/alerts.js';

/**
 * GET /api/v1/health — Basic health check (no auth)
 */
export async function healthCheck(request, env, ctx, { url }) {
  return jsonResponse(200, {
    success: true,
    data: {
      status: 'ok',
      timestamp: nowISO(),
      version: env.API_VERSION || 'v1',
      environment: env.ENVIRONMENT || 'unknown'
    },
    error: null
  });
}

/**
 * GET /api/v1/health/ready — Deep readiness check
 * Uses T07 probes module for D1/R2/Vectorize/KV/Workers AI connectivity.
 */
export async function readinessCheck(request, env, ctx, { url }) {
  const includeAI = url.searchParams.get('includeAI') === 'true';

  const { checks, allOk } = await runAllProbes(env, { includeAI });

  return jsonResponse(allOk ? 200 : 503, {
    success: allOk,
    data: {
      status: allOk ? 'ready' : 'degraded',
      timestamp: nowISO(),
      checks
    },
    error: allOk ? null : {
      type: 'service_unavailable',
      message: 'One or more dependencies are down'
    }
  });
}

/**
 * GET /api/v1/metrics — Full metrics export (Service Token)
 * Uses T07 metrics aggregation module for computed statistics.
 */
export async function getMetrics(request, env, ctx, { url }) {
  const [metrics, activeAlerts] = await Promise.all([
    getFullMetrics(env),
    getActiveAlerts(env)
  ]);

  return jsonResponse(200, {
    success: true,
    data: {
      ...metrics,
      active_alerts: activeAlerts.length,
      alerts: activeAlerts.map(a => ({
        name: a.alert_name,
        severity: a.severity,
        message: a.message,
        triggered_at: a.triggered_at
      })),
      timestamp: nowISO()
    },
    error: null
  });
}

/**
 * GET /api/v1/monitoring/usage — Free-tier usage tracking (Service Token)
 * Combines KV budget data with D1-tracked daily counters.
 */
export async function getUsage(request, env, ctx, { url }) {
  const today = nowISO().slice(0, 10);

  // Run all queries in parallel
  const [
    kvBudgetRaw,
    d1Info,
    workersAiNeurons,
    vectorizeQueries,
    kvWritesFromD1,
    workersRequests
  ] = await Promise.all([
    env.KV.get(`config:kv_budget:${today}`, { type: 'json' }).catch(() => null),
    env.DB.prepare(
      "SELECT page_count * page_size AS size_bytes FROM pragma_page_count(), pragma_page_size()"
    ).first().catch(() => null),
    getDailyCounter(env, 'workers_ai_neurons', today),
    getDailyCounter(env, 'vectorize_query_dims', today),
    getDailyCounter(env, 'kv_writes', today),
    getDailyCounter(env, 'workers_requests', today)
  ]);

  // KV budget from KV config (legacy) or D1 counter
  const kvBudget = kvBudgetRaw || {};
  let kvWritesFromKV = 0;
  for (const [key, val] of Object.entries(kvBudget)) {
    if (key !== 'last_updated' && typeof val === 'number') {
      kvWritesFromKV += val;
    }
  }
  const totalKvWrites = Math.max(kvWritesFromKV, kvWritesFromD1);

  // D1 storage estimate
  const d1SizeGb = d1Info ? (d1Info.size_bytes / (1024 ** 3)) : 0;

  // Helper: compute usage percentage
  const pct = (used, limit) => parseFloat(((used / limit) * 100).toFixed(1));

  return jsonResponse(200, {
    success: true,
    data: {
      workers_requests: {
        used: workersRequests,
        limit: CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT,
        pct: pct(workersRequests, CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT)
      },
      workers_ai_neurons: {
        used: workersAiNeurons,
        limit: CLOUDFLARE.WORKERS_AI_DAILY_LIMIT,
        pct: pct(workersAiNeurons, CLOUDFLARE.WORKERS_AI_DAILY_LIMIT)
      },
      vectorize_queries: {
        used: vectorizeQueries,
        limit: CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT,
        pct: pct(vectorizeQueries, CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT)
      },
      r2_storage_gb: {
        used: 0,  // R2 size requires list+sum, tracked by T07 collector
        limit: CLOUDFLARE.R2_MAX_STORAGE_GB,
        pct: 0
      },
      d1_storage_gb: {
        used: parseFloat(d1SizeGb.toFixed(3)),
        limit: CLOUDFLARE.D1_MAX_STORAGE_GB,
        pct: pct(d1SizeGb, CLOUDFLARE.D1_MAX_STORAGE_GB)
      },
      kv_writes_today: {
        used: totalKvWrites,
        limit: CLOUDFLARE.KV_DAILY_WRITE_LIMIT,
        pct: pct(totalKvWrites, CLOUDFLARE.KV_DAILY_WRITE_LIMIT)
      }
    },
    error: null
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
