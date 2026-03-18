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
import { googleAuth, googleOAuthCallback, getMe, deleteMe, exportMe, getContributions } from './handlers/auth.js';
import { getPoints } from './handlers/points.js';
import { submitReward, recordFailure, getRewardsSummary } from './handlers/rewards.js';
import { healthCheck, readinessCheck, getMetrics, getUsage } from './handlers/health.js';
import { getBlindspotEvents, triggerBlindspotScan } from './handlers/blindspot.js';
import { getSources, getSource } from './handlers/sources.js';
import { submitArticleFeedback, getArticleFeedbackStats } from './handlers/feedback.js';
import { reportArticle, reportAnalysis } from './handlers/reports.js';
import { submitAnalysisFeedback, getAnalysisFeedbackStats } from './handlers/analysis-feedback.js';
import { searchArticles } from './handlers/search.js';
import { getEvents, getEventDetail } from './handlers/events.js';
import { getClusters, getClusterDetail } from './handlers/clusters.js';

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
  ['GET',    '/api/v1/auth/google',          googleAuth,          { auth: 'none', rateLimit: true,  cache: 'no-store' }],
  ['GET',    '/api/v1/auth/google/callback', googleOAuthCallback, { auth: 'none', rateLimit: true,  cache: 'no-store' }],
  ['GET',    '/api/v1/user/me',        getMe,      { auth: 'jwt',  rateLimit: true,  cache: 'private, no-cache' }],
  ['DELETE', '/api/v1/user/me',        deleteMe,   { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],
  ['GET',    '/api/v1/user/me/export',         exportMe,         { auth: 'jwt',  rateLimit: true,  cache: 'private, no-cache' }],
  ['GET',    '/api/v1/user/me/contributions', getContributions, { auth: 'jwt',  rateLimit: true,  cache: 'private, no-cache' }],

  // Points API (T05)
  ['GET', '/api/v1/user/me/points', getPoints, { auth: 'jwt', rateLimit: true, cache: 'private, no-cache' }],

  // Rewards API (T05 integration — internal endpoints)
  ['POST', '/api/v1/rewards/submit',  submitReward,      { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['POST', '/api/v1/rewards/failure', recordFailure,     { auth: 'service', rateLimit: false, cache: 'no-store' }],
  ['GET',  '/api/v1/rewards/me',      getRewardsSummary, { auth: 'service', rateLimit: false, cache: 'no-store' }],

  // Article Feedback API (v2.1 — community interaction)
  ['POST', '/api/v1/articles/:article_id/feedback',       submitArticleFeedback,    { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],
  ['GET',  '/api/v1/articles/:article_id/feedback/stats', getArticleFeedbackStats,  { auth: 'none', rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Article & Analysis Reports API (v2.1 — content moderation)
  ['POST', '/api/v1/articles/:article_id/report',         reportArticle,            { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],
  ['POST', '/api/v1/analyses/:analysis_id/report',        reportAnalysis,           { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],

  // Analysis Feedback API (v2.1 — analysis quality signals)
  ['POST', '/api/v1/analyses/:analysis_id/feedback',       submitAnalysisFeedback,   { auth: 'jwt',  rateLimit: true,  cache: 'no-store' }],
  ['GET',  '/api/v1/analyses/:analysis_id/feedback/stats', getAnalysisFeedbackStats, { auth: 'none', rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Search API (v2.1 — text search)
  ['GET', '/api/v1/search', searchArticles, { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Clusters API (v2.2 — pre-computed event clusters for homepage visualization)
  ['GET', '/api/v1/clusters',              getClusters,      { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],
  ['GET', '/api/v1/clusters/:cluster_id',  getClusterDetail, { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Events API (v2.1 — cluster aggregation)
  ['GET', '/api/v1/events',              getEvents,      { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],
  ['GET', '/api/v1/events/:cluster_id',  getEventDetail, { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

  // Blindspot API (v2.0 — camp imbalance detection)
  ['GET',  '/api/v1/blindspot/events', getBlindspotEvents,    { auth: 'none',    rateLimit: true,  cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],
  ['POST', '/api/v1/blindspot/scan',   triggerBlindspotScan,  { auth: 'service', rateLimit: false, cache: 'no-store' }],

  // Source Transparency API (v2.0 — dynamic media tendency)
  ['GET', '/api/v1/sources',          getSources, { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],
  ['GET', '/api/v1/sources/:source',  getSource,  { auth: 'none', rateLimit: true, cache: `public, max-age=${CLOUDFLARE.CDN_NEWS_LIST_TTL}` }],

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
