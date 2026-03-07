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

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreFlight(request);
    }

    // Generate request ID if not provided
    const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();

    // T07 metrics collector (per-request instrumentation)
    const collector = createMetricsCollector();
    collector.recordRequest();

    // Main handler with global error catching
    const handler = withErrorHandling(async (req, env, ctx) => {
      const response = await handleRequest(req, env, ctx);

      // Add CORS + request ID headers
      const origin = req.headers.get('Origin') || '';
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders(origin))) {
        headers.set(key, value);
      }
      headers.set('X-Request-ID', requestId);

      return new Response(response.body, {
        status: response.status,
        headers
      });
    });

    const response = await handler(request, env, ctx);

    // Flush metrics after response (non-blocking)
    ctx.waitUntil(collector.flush(env));

    return response;
  },

  // Cron trigger: hourly metrics aggregation + alert evaluation (T07) + session cleanup
  async scheduled(event, env, ctx) {
    // Await aggregation before reading metrics so alerts evaluate fresh data
    await aggregateHourly(env);
    const metrics = await getFullMetrics(env);
    ctx.waitUntil(evaluateAlerts(env, metrics));

    // Cleanup expired sessions (non-blocking)
    ctx.waitUntil(
      env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at < datetime('now')"
      ).run().catch(() => {})
    );

    // Reset daily analysis counts at midnight UTC (cron runs hourly)
    const hour = new Date(event.scheduledTime).getUTCHours();
    if (hour === 0) {
      ctx.waitUntil(
        env.DB.prepare(
          'UPDATE users SET daily_analysis_count = 0 WHERE daily_analysis_count > 0'
        ).run().catch(() => {})
      );
    }
  }
};
