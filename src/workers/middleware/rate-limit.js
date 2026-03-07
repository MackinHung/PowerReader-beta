/**
 * Rate Limiting Middleware for Cloudflare Workers
 *
 * Uses Workers Cache API instead of KV to avoid consuming KV write budget.
 * OceanRAG lesson: never use in-memory counters (reset on restart).
 * Cache API is per-colo (not global), which is acceptable for rate limiting
 * — defense in depth, not absolute enforcement.
 *
 * Limits defined in shared/config.js SECURITY section.
 *
 * Navigation:
 * - Upstream: shared/config.js (SECURITY.API_RATE_LIMIT_PER_MINUTE)
 * - Downstream: router.js (called for routes with rateLimit: true)
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 */

import { SECURITY } from '../../../shared/config.js';

/**
 * Check if a request is within rate limits.
 * Uses Workers Cache API for counters (free, no KV write budget impact).
 *
 * @param {Request} request
 * @param {object} env - Workers env (not used for cache, but kept for interface)
 * @returns {Promise<{ allowed: boolean, retryAfter: number|null }>}
 */
export async function checkRateLimit(request, env) {
  const identifier = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Math.floor(Date.now() / 1000);
  const windowMinute = Math.floor(now / 60);

  // Use Cache API — free, per-colo, auto-expires via Cache-Control
  const cache = caches.default;
  const cacheUrl = `https://powerreader-ratelimit.internal/${identifier}/${windowMinute}`;
  const cacheKey = new Request(cacheUrl);

  try {
    const cached = await cache.match(cacheKey);
    let count = 0;

    if (cached) {
      const data = await cached.json();
      count = data.count || 0;
    }

    if (count >= SECURITY.API_RATE_LIMIT_PER_MINUTE) {
      const retryAfter = 60 - (now % 60);
      return { allowed: false, retryAfter };
    }

    // Increment counter — Cache API write is free (no KV budget impact)
    const updated = new Response(JSON.stringify({ count: count + 1 }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=120'  // 2 minutes, covers current + next window
      }
    });
    await cache.put(cacheKey, updated);

    return { allowed: true, retryAfter: null };
  } catch {
    // If Cache API fails, allow the request (fail-open for availability)
    return { allowed: true, retryAfter: null };
  }
}
