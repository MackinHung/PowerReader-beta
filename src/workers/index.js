/**
 * PowerReader API - Cloudflare Workers Entry Point
 *
 * ES Modules format. Routes in router.js, handlers in handlers/.
 * Middleware chain: CORS → Rate Limit → Auth → Validation → Handler
 *
 * Bindings (from wrangler.toml):
 *   DB             → D1 database (primary storage)
 *   ARTICLES       → R2 bucket (full text)
 *   KNOWLEDGE_INDEX → Vectorize index (knowledge vectors)
 *   KV             → KV namespace (cache + config + rate limits)
 *   AI             → Workers AI (bge-m3 embedding)
 *
 * Navigation:
 * - Upstream: wrangler.toml, shared/ (config, enums, validators)
 * - Downstream: T04 PWA, LINE Bot, Browser Extension
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 */

import { handleRequest } from './router.js';
import { withErrorHandling } from '../../shared/errors.js';
import { corsHeaders, handleCorsPreFlight } from './middleware/cors.js';
import { createMetricsCollector, aggregateHourly } from './monitoring/collector.js';
import { evaluateAlerts } from './monitoring/alerts.js';
import { getFullMetrics } from './monitoring/metrics.js';
import { scanBlindspots, updateSourceTendency, buildAllClusters, computeClusters } from './handlers/cron-blindspot.js';

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreFlight(request);
    }

    // Generate request ID if not provided
    const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();

    const origin = request.headers.get('Origin') || '';

    // T07 metrics collector (per-request instrumentation)
    const collector = createMetricsCollector();
    collector.recordRequest();

    // Main handler with global error catching
    const handler = withErrorHandling(async (req, env, ctx) => {
      return await handleRequest(req, env, ctx);
    });

    const response = await handler(request, env, ctx);

    // Always add CORS + request ID headers (including on error responses)
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      headers.set(key, value);
    }
    headers.set('X-Request-ID', requestId);

    // Flush metrics after response (non-blocking)
    ctx.waitUntil(collector.flush(env));

    return new Response(response.body, {
      status: response.status,
      headers
    });
  },

  // Cron trigger: hourly metrics aggregation + alert evaluation (T07) + session cleanup
  async scheduled(event, env, ctx) {
    // Metrics aggregation (non-blocking — must not block cluster/blindspot jobs)
    try {
      await aggregateHourly(env);
      const metrics = await getFullMetrics(env);
      ctx.waitUntil(evaluateAlerts(env, metrics));
    } catch { /* metrics_raw table may not exist yet */ }

    // Cleanup expired sessions (non-blocking)
    ctx.waitUntil(
      env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at < datetime('now')"
      ).run().catch(() => {})
    );

    // Compute clusters once, share result between blindspot + event cluster jobs
    // (avoids O(n²) clustering twice — halves CPU usage)
    ctx.waitUntil((async () => {
      const clusters = await computeClusters(env);
      if (!clusters) return;
      await Promise.all([
        scanBlindspots(env, clusters).catch(() => {}),
        buildAllClusters(env, clusters).catch(() => {}),
      ]);
    })().catch(() => {}));

    // Reset daily analysis counts at midnight Taiwan time (UTC+8 = UTC 16:00)
    const hour = new Date(event.scheduledTime).getUTCHours();
    if (hour === 16) {
      ctx.waitUntil(
        env.DB.prepare(
          'UPDATE users SET daily_analysis_count = 0 WHERE daily_analysis_count > 0'
        ).run().catch(() => {})
      );

      // Source tendency: recalculate 30-day rolling average daily at midnight
      ctx.waitUntil(updateSourceTendency(env).catch(() => {}));
    }
  }
};
