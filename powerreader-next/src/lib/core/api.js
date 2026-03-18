/**
 * PowerReader - API Client
 *
 * Centralized API module with offline-first strategy.
 * All API routes defined in T01_SYSTEM_ARCHITECTURE/API_ROUTES.md (SSOT).
 *
 * Strategy:
 *   Online  → Fetch from API → Cache to IndexedDB
 *   Offline → Load from IndexedDB cache
 */

import { openDB } from './db.js';

export const API_BASE = 'https://powerreader-api.watermelom5404.workers.dev/api/v1';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// =============================================
// Internal: Fetch wrapper
// =============================================

/**
 * Generic fetch with unified error handling.
 * Returns { success, data, error } — never throws.
 */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...options
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      return {
        success: false,
        data: null,
        error: { ...(json.error || { type: 'api_error' }), status: response.status }
      };
    }

    return json;
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { success: false, data: null, error: { type: 'timeout' } };
    }
    return { success: false, data: null, error: { type: 'network' } };
  }
}

// =============================================
// Internal: IndexedDB cache helpers
// =============================================

async function cacheArticle(article) {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readwrite');
    tx.objectStore('articles').put({
      ...article,
      article_hash: article.article_id,
      cached_at: new Date().toISOString()
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Cache article failed:', e);
  }
}

/**
 * Batch-cache multiple articles in a single IDB transaction.
 * ~3x faster than serial cacheArticle() calls for 20 articles.
 */
async function batchCacheArticles(articlesList) {
  if (!articlesList.length) return;
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readwrite');
    const store = tx.objectStore('articles');
    const now = new Date().toISOString();
    for (const article of articlesList) {
      store.put({
        ...article,
        article_hash: article.article_id,
        cached_at: now
      });
    }
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Batch cache articles failed:', e);
  }
}

async function cacheResponse(cacheKey, data) {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readwrite');
    tx.objectStore('cached_results').put({
      cache_key: cacheKey,
      data,
      cached_at: new Date().toISOString()
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Cache response failed:', e);
  }
}

async function getCachedResponse(cacheKey) {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readonly');
    const req = tx.objectStore('cached_results').get(cacheKey);
    const result = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return result ? result.data : null;
  } catch (e) {
    return null;
  }
}

async function getCachedArticle(articleId) {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').get(articleId);
    const result = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return result || null;
  } catch (e) {
    return null;
  }
}

async function getAllCachedArticles() {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').getAll();
    const result = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return result || [];
  } catch (e) {
    return [];
  }
}

/**
 * Return cached response only if it's within CACHE_TTL_MS.
 * Returns null if missing or stale — caller should fetch from API.
 */
async function getFreshCachedResponse(cacheKey) {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readonly');
    const req = tx.objectStore('cached_results').get(cacheKey);
    const record = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    if (!record) return null;
    const age = Date.now() - new Date(record.cached_at).getTime();
    return age < CACHE_TTL_MS ? record.data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Return cached article only if it's within CACHE_TTL_MS.
 */
async function getFreshCachedArticle(articleId) {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').get(articleId);
    const record = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    if (!record) return null;
    const age = Date.now() - new Date(record.cached_at).getTime();
    return age < CACHE_TTL_MS ? record : null;
  } catch (e) {
    return null;
  }
}

// =============================================
// Public API
// =============================================

/**
 * GET /api/v1/articles — paginated article list.
 */
export async function fetchArticles({
  page = 1,
  limit = 20,
  sort_by = 'published_at',
  sort_order = 'desc',
  source,
  category
} = {}) {
  const cacheKey = `articles:${page}:${limit}:${sort_by}:${sort_order}:${source || ''}:${category || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };

    const articles = await getAllCachedArticles();
    return {
      success: true,
      data: { articles, pagination: { page: 1, limit: articles.length, total: articles.length, total_pages: 1 } },
      error: null
    };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page, limit, sort_by, sort_order });
  if (source) params.set('source', source);
  if (category) params.set('category', category);

  const result = await apiFetch(`/articles?${params}`);

  if (result.success && result.data) {
    // Non-blocking cache writes — don't delay API response
    cacheResponse(cacheKey, result.data).catch(() => {});
    batchCacheArticles(result.data.articles || []).catch(() => {});
  }

  return result;
}

/**
 * GET /api/v1/articles/:article_id — single article detail.
 */
export async function fetchArticle(articleId) {
  if (!navigator.onLine) {
    const cached = await getCachedArticle(articleId);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'article_not_cached' } };
  }

  const fresh = await getFreshCachedArticle(articleId);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/articles/${encodeURIComponent(articleId)}`);
  if (result.success && result.data) {
    await cacheArticle(result.data);
  }
  return result;
}

/**
 * GET /api/v1/articles/:article_id/cluster — similarity cluster.
 */
export async function fetchArticleCluster(articleId) {
  const cacheKey = `cluster:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/articles/${encodeURIComponent(articleId)}/cluster`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/articles/:article_id/knowledge — RAG knowledge entries.
 */
export async function fetchArticleKnowledge(articleId) {
  const cacheKey = `knowledge:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/articles/${encodeURIComponent(articleId)}/knowledge`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// User API (Auth required)
// =============================================

/**
 * GET /api/v1/user/me — current user info.
 */
export async function fetchUserMe(token) {
  return apiFetch('/user/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/user/me/points — user points and vote rights.
 */
export async function fetchUserPoints(token) {
  return apiFetch('/user/me/points', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/user/me/contributions — contribution history.
 * @param {string} token
 * @param {Object} [opts] - { page, limit, days }
 */
export async function fetchUserContributions(token, { page = 1, limit = 20, days } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (days) params.set('days', days);

  return apiFetch(`/user/me/contributions?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/articles/:article_id/analyses — all analysis results.
 */
export async function fetchArticleAnalyses(articleId) {
  const cacheKey = `analyses:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/articles/${encodeURIComponent(articleId)}/analyses`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * POST /api/v1/articles/:article_id/analysis — Submit analysis result.
 */
export async function submitAnalysisResult(articleId, payload, token) {
  return apiFetch(`/articles/${encodeURIComponent(articleId)}/analysis`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

// =============================================
// Blindspot API (v2.0)
// =============================================

/**
 * GET /api/v1/blindspot/events — paginated blindspot events.
 */
export async function fetchBlindspotEvents({ page = 1, limit = 20, type } = {}) {
  const cacheKey = `blindspot:${page}:${limit}:${type || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page, limit });
  if (type) params.set('type', type);

  const result = await apiFetch(`/blindspot/events?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// Source Transparency API (v2.0)
// =============================================

/**
 * GET /api/v1/sources — all source tendency profiles.
 */
export async function fetchSources() {
  const cacheKey = 'sources:all';

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch('/sources');
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/sources/:source — detailed source transparency.
 */
export async function fetchSource(source) {
  const cacheKey = `source:${source}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/sources/${encodeURIComponent(source)}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// Article Feedback API (v2.1)
// =============================================

/**
 * POST /api/v1/articles/:article_id/feedback — submit like/dislike.
 */
export async function submitArticleFeedback(articleId, type, token) {
  return apiFetch(`/articles/${encodeURIComponent(articleId)}/feedback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type })
  });
}

/**
 * GET /api/v1/articles/:article_id/feedback/stats — aggregated feedback.
 */
export async function fetchArticleFeedbackStats(articleId) {
  return apiFetch(`/articles/${encodeURIComponent(articleId)}/feedback/stats`);
}

// =============================================
// Analysis Feedback API (v2.1)
// =============================================

/**
 * POST /api/v1/analyses/:analysis_id/feedback — submit like/dislike.
 */
export async function submitAnalysisFeedback(analysisId, type, token) {
  return apiFetch(`/analyses/${encodeURIComponent(analysisId)}/feedback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type })
  });
}

/**
 * GET /api/v1/analyses/:analysis_id/feedback/stats — aggregated feedback.
 */
export async function fetchAnalysisFeedbackStats(analysisId) {
  return apiFetch(`/analyses/${encodeURIComponent(analysisId)}/feedback/stats`);
}

// =============================================
// Reports API (v2.1 — content moderation)
// =============================================

/**
 * POST /api/v1/articles/:article_id/report — report article.
 */
export async function reportArticle(articleId, reason, description, token) {
  const body = { reason };
  if (description) body.description = description;
  return apiFetch(`/articles/${encodeURIComponent(articleId)}/report`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

/**
 * POST /api/v1/analyses/:analysis_id/report — report analysis.
 */
export async function reportAnalysis(analysisId, reason, description, token) {
  const body = { reason };
  if (description) body.description = description;
  return apiFetch(`/analyses/${encodeURIComponent(analysisId)}/report`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

// =============================================
// Search API (v2.1 — text search)
// =============================================

/**
 * GET /api/v1/search?q=keyword — article text search.
 */
export async function searchArticles(query, { page = 1, limit = 20 } = {}) {
  const cacheKey = `search:${query}:${page}:${limit}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ q: query, page, limit });
  const result = await apiFetch(`/search?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// Events API (v2.1 — cluster aggregation)
// =============================================

/**
 * GET /api/v1/events — paginated event clusters.
 */
export async function fetchEvents({ page = 1, limit = 20, type } = {}) {
  const cacheKey = `events:${page}:${limit}:${type || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page, limit });
  if (type) params.set('type', type);

  const result = await apiFetch(`/events?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/events/:cluster_id — event detail with articles.
 */
export async function fetchEventDetail(clusterId) {
  const cacheKey = `event:${clusterId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/events/${encodeURIComponent(clusterId)}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// Clusters API (v2.2 — pre-computed event clusters)
// =============================================

/**
 * GET /api/v1/clusters — paginated pre-computed clusters.
 */
export async function fetchClusters({ page = 1, limit = 20, category } = {}) {
  const cacheKey = `clusters:${page}:${limit}:${category || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page, limit });
  if (category && category !== 'all') params.set('category', category);

  const result = await apiFetch(`/clusters?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/clusters/:cluster_id — cluster detail with articles.
 */
export async function fetchClusterDetail(clusterId) {
  const cacheKey = `cluster-detail:${clusterId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch(`/clusters/${encodeURIComponent(clusterId)}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// PDPA Compliance API
// =============================================

/**
 * GET /api/v1/user/me/export — export all user data (PDPA compliance).
 */
export async function exportUserData(token) {
  return apiFetch('/user/me/export', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * DELETE /api/v1/user/me — delete user account (PDPA compliance).
 */
export async function deleteUserAccount(token) {
  return apiFetch('/user/me', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}
