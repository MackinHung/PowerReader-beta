/**
 * PowerReader API - Route Definitions
 *
 * Maps URL patterns to handler functions.
 * All routes follow T01/API_ROUTES.md (SSOT).
 *
 * Maintainer: T01 (System Architecture Team)
 * Last Updated: 2026-03-07
 */

import { createErrorResponse } from '../../shared/errors.js';
import { CLOUDFLARE } from '../../shared/config.js';
import { checkRateLimit } from './middleware/rate-limit.js';
import { verifyJwt, verifyServiceToken } from './middleware/auth.js';

// Handler imports
import { getArticles, getArticle, createArticle, createArticleBatch, getArticleCluster } from './handlers/articles.js';
import { createAnalysis, getAnalyses } from './handlers/analysis.js';
import { getArticleKnowledge, upsertKnowledge, batchUpsertKnowledge, searchKnowledge, listKnowledge } from './handlers/knowledge.js';
import { googleAuth, getMe, deleteMe, exportMe } from './handlers/auth.js';
import { getPoints } from './handlers/points.js';
import { submitReward, recordFailure, getRewardsSummary } from './handlers/rewards.js';
import { healthCheck, readinessCheck, getMetrics, getUsage } from './handlers/health.js';

/**
 * Route table: [method, pattern, handler, options]
 * Options:
 *   auth: 'none' | 'jwt' | 'service' | 'admin'
 *   rateLimit: boolean
 *   cache: Cache-Control header value (from config.js TTLs)
 *     - Public GETs: CDN_NEWS_LIST_TTL (5s), CDN_ARTICLE_TTL (1h), CDN_STATIC_TTL (10d)
 *     - Private GETs (user data): 'private, no-cache'
 *     - Mutations (POST/DELETE): 'no-store'
 *     - Health: 'no-store'
 */
const ROUTES = [
  // Articles API (T02 writes, T04 reads)
  ['GET',  '/api/v1/articles',                     getArticles,        { auth: 'none',    rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],
  ['GET',  '/api/v1/articles/:article_id',         getArticle,         { auth: 'none',    rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_ARTICLE_TTL}` }],
  ['POST', '/api/v1/articles',                     createArticle,      { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['POST', '/api/v1/articles/batch',               createArticleBatch, { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['GET',  '/api/v1/articles/:article_id/cluster', getArticleCluster,  { auth: 'none',    rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Analysis API (T03 writes)
  ['POST', '/api/v1/articles/:article_id/analysis',  createAnalysis, { auth: 'jwt',     rateLimit: true,  cache: 'no-store' }],
  ['GET',  '/api/v1/articles/:article_id/analyses',  getAnalyses,    { auth: 'none',    rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Knowledge API (T03 maintains)
  ['GET',  '/api/v1/articles/:article_id/knowledge', getArticleKnowledge,  { auth: 'none',  rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_ARTICLE_TTL}` }],
  ['POST', '/api/v1/knowledge/upsert',               upsertKnowledge,     { auth: 'admin', rateLimit: false, cache: 'no-store' }],
  ['POST', '/api/v1/knowledge/batch',                 batchUpsertKnowledge,{ auth: 'admin', rateLimit: false, cache: 'no-store' }],
  ['GET',  '/api/v1/knowledge/search',                searchKnowledge,     { auth: 'admin', rateLimit: true,  cache: 'no-store' }],
  ['GET',  '/api/v1/knowledge/list',                  listKnowledge,       { auth: 'admin', rateLimit: true,  cache: 'no-store' }],

  // User API
  ['POST',   '/api/v1/auth/google',    googleAuth, { auth: 'none', rateLimit: true,  cache: 'no-store' }],
  ['GET',    '/api/v1/user/me',        getMe,      { auth: 'jwt',  rateLimit: true,  cache: 'private, no-cache' }],
  ['DELETE', '/api/v1/user/me',        deleteMe,   { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],
  ['GET',    '/api/v1/user/me/export', exportMe,   { auth: 'jwt',  rateLimit: true,  cache: 'private, no-cache' }],

  // Points API (T05)
  ['GET', '/api/v1/user/me/points', getPoints, { auth: 'jwt', rateLimit: true, cache: 'private, no-cache' }],

  // Rewards API (T05 integration — internal endpoints)
  ['POST', '/api/v1/rewards/submit',  submitReward,      { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['POST', '/api/v1/rewards/failure', recordFailure,     { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['GET',  '/api/v1/rewards/me',      getRewardsSummary, { auth: 'service', rateLimit: false, cache: 'no-store' }],

  // Health & Monitoring API (T07 provides monitoring logic)
  ['GET', '/api/v1/health',           healthCheck,     { auth: 'none',    rateLimit: false, cache: 'no-store' }],
  ['GET', '/api/v1/health/ready',     readinessCheck,  { auth: 'none',    rateLimit: false, cache: 'no-store' }],
  ['GET', '/api/v1/metrics',          getMetrics,      { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['GET', '/api/v1/monitoring/usage', getUsage,        { auth: 'service', rateLimit: false, cache: 'no-store' }],
];

/**
 * Match request URL against route patterns.
 * Supports :param path parameters.
 *
 * IMPORTANT: Static routes (e.g. /articles/batch) are checked before
 * parameterized routes (e.g. /articles/:article_id) because they appear
 * first in the ROUTES array. Order matters!
 */
function matchRoute(method, pathname) {
  for (const [routeMethod, pattern, handler, options] of ROUTES) {
    if (method !== routeMethod) continue;

    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, options, params };
  }
  return null;
}

/**
 * Handle an incoming request: match route → middleware → handler.
 */
export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  const route = matchRoute(request.method, pathname);

  if (!route) {
    const { status, body } = createErrorResponse('not_found');
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { handler, options, params } = route;

  // Rate limiting (uses Cache API — fail-open, no KV budget impact)
  if (options.rateLimit) {
    const rateLimitResult = await checkRateLimit(request, env);
    if (!rateLimitResult.allowed) {
      const { status, body } = createErrorResponse('rate_limit_exceeded', null, {
        retry_after: rateLimitResult.retryAfter
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Authentication
  let user = null;
  if (options.auth === 'jwt') {
    const authResult = await verifyJwt(request, env);
    if (!authResult.valid) {
      const { status, body } = createErrorResponse('unauthorized');
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    user = authResult.user;
  } else if (options.auth === 'service') {
    const authResult = verifyServiceToken(request, env);
    if (!authResult.valid) {
      const { status, body } = createErrorResponse('unauthorized');
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else if (options.auth === 'admin') {
    const authResult = verifyServiceToken(request, env);
    if (!authResult.valid || !authResult.isAdmin) {
      const { status, body } = createErrorResponse('unauthorized');
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const response = await handler(request, env, ctx, { params, user, url });

  // Apply CDN cache headers from route config
  if (options.cache) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', options.cache);
    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  return response;
}
