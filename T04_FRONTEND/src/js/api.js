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
        error: json.error || { type: 'api_error', status: response.status }
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

  const params = new URLSearchParams({ page, limit, sort_by, sort_order });
  if (source) params.set('source', source);
  if (category) params.set('category', category);

  const result = await apiFetch(`/articles?${params}`);

  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
    for (const article of result.data.articles || []) {
      await cacheArticle(article);
    }
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

  const result = await apiFetch(`/sources/${encodeURIComponent(source)}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}
