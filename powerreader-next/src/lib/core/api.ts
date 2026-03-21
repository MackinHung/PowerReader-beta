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
import type {
  ApiResponse,
  FetchArticlesParams,
  FetchEventsParams,
  FetchBlindspotEventsParams,
  FetchClustersParams,
  FetchContributionsParams,
  FetchKnowledgeListParams,
  SearchArticlesParams,
  SearchKnowledgeParams,
  FeedbackType,
  SubmitAnalysisPayload,
  PaginationMeta
} from '$lib/types/api.js';
import type {
  Article,
  BlindspotEvent,
  EventCluster,
  UserProfile,
  UserPoints,
  Contribution,
  KnowledgeEntry,
  AnalysisResult,
  SourceProfile
} from '$lib/types/models.js';

export const API_BASE = 'https://powerreader-api.watermelom5404.workers.dev/api/v1';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedRecord<T = unknown> {
  cache_key: string;
  data: T;
  cached_at: string;
}

interface CachedArticle extends Article {
  article_hash: string;
  cached_at: string;
}

// =============================================
// Internal: Fetch wrapper
// =============================================

/**
 * Generic fetch with unified error handling.
 * Returns { success, data, error } — never throws.
 */
async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
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
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { success: false, data: null, error: { type: 'timeout' } };
    }
    return { success: false, data: null, error: { type: 'network' } };
  }
}

// =============================================
// Internal: IndexedDB cache helpers
// =============================================

async function cacheArticle(article: Article): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readwrite');
    tx.objectStore('articles').put({
      ...article,
      article_hash: article.article_id,
      cached_at: new Date().toISOString()
    });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Cache article failed:', e);
  }
}

/**
 * Batch-cache multiple articles in a single IDB transaction.
 * ~3x faster than serial cacheArticle() calls for 20 articles.
 */
async function batchCacheArticles(articlesList: Article[]): Promise<void> {
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
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Batch cache articles failed:', e);
  }
}

async function cacheResponse(cacheKey: string, data: unknown): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readwrite');
    tx.objectStore('cached_results').put({
      cache_key: cacheKey,
      data,
      cached_at: new Date().toISOString()
    });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.error('[API] Cache response failed:', e);
  }
}

async function getCachedResponse<T = unknown>(cacheKey: string): Promise<T | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readonly');
    const req = tx.objectStore('cached_results').get(cacheKey);
    const result = await new Promise<CachedRecord<T> | undefined>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return result ? result.data : null;
  } catch (e) {
    return null;
  }
}

async function getCachedArticle(articleId: string): Promise<CachedArticle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').get(articleId);
    const result = await new Promise<CachedArticle | undefined>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    return result || null;
  } catch (e) {
    return null;
  }
}

async function getAllCachedArticles(): Promise<CachedArticle[]> {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').getAll();
    const result = await new Promise<CachedArticle[]>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
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
async function getFreshCachedResponse<T = unknown>(cacheKey: string): Promise<T | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('cached_results', 'readonly');
    const req = tx.objectStore('cached_results').get(cacheKey);
    const record = await new Promise<CachedRecord<T> | undefined>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
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
async function getFreshCachedArticle(articleId: string): Promise<CachedArticle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('articles', 'readonly');
    const req = tx.objectStore('articles').get(articleId);
    const record = await new Promise<CachedArticle | undefined>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
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

interface ArticlesData {
  articles: Article[];
  pagination: PaginationMeta;
}

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
}: FetchArticlesParams = {}): Promise<ApiResponse<ArticlesData>> {
  const cacheKey = `articles:${page}:${limit}:${sort_by}:${sort_order}:${source || ''}:${category || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<ArticlesData>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };

    const articles = await getAllCachedArticles();
    return {
      success: true,
      data: { articles, pagination: { page: 1, limit: articles.length, total: articles.length, total_pages: 1 } },
      error: null
    };
  }

  const fresh = await getFreshCachedResponse<ArticlesData>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page: String(page), limit: String(limit), sort_by, sort_order });
  if (source) params.set('source', source);
  if (category) params.set('category', category);

  const result = await apiFetch<ArticlesData>(`/articles?${params}`);

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
export async function fetchArticle(articleId: string): Promise<ApiResponse<Article>> {
  if (!navigator.onLine) {
    const cached = await getCachedArticle(articleId);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'article_not_cached' } };
  }

  const fresh = await getFreshCachedArticle(articleId);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<Article>(`/articles/${encodeURIComponent(articleId)}`);
  if (result.success && result.data) {
    await cacheArticle(result.data);
  }
  return result;
}

/**
 * GET /api/v1/articles/:article_id/cluster — similarity cluster.
 */
export async function fetchArticleCluster(articleId: string): Promise<ApiResponse<{ articles: Article[] }>> {
  const cacheKey = `cluster:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ articles: Article[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ articles: Article[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<{ articles: Article[] }>(`/articles/${encodeURIComponent(articleId)}/cluster`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/articles/:article_id/knowledge — RAG knowledge entries.
 */
export async function fetchArticleKnowledge(articleId: string): Promise<ApiResponse<{ knowledge_entries: KnowledgeEntry[] }>> {
  const cacheKey = `knowledge:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ knowledge_entries: KnowledgeEntry[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ knowledge_entries: KnowledgeEntry[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<{ knowledge_entries: KnowledgeEntry[] }>(`/articles/${encodeURIComponent(articleId)}/knowledge`);
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
export async function fetchUserMe(token: string): Promise<ApiResponse<UserProfile>> {
  return apiFetch<UserProfile>('/user/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/user/me/points — user points and vote rights.
 */
export async function fetchUserPoints(token: string): Promise<ApiResponse<UserPoints>> {
  return apiFetch<UserPoints>('/user/me/points', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/user/me/contributions — contribution history.
 */
export async function fetchUserContributions(token: string, { page = 1, limit = 20, days }: FetchContributionsParams = {}): Promise<ApiResponse<{ contributions: Contribution[]; pagination: PaginationMeta; daily_counts?: Array<{ date: string; value: number }> }>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (days) params.set('days', String(days));

  return apiFetch<{ contributions: Contribution[]; pagination: PaginationMeta; daily_counts?: Array<{ date: string; value: number }> }>(`/user/me/contributions?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/articles/:article_id/analyses — all analysis results.
 */
export async function fetchArticleAnalyses(articleId: string): Promise<ApiResponse<{ analyses: AnalysisResult[] }>> {
  const cacheKey = `analyses:${articleId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ analyses: AnalysisResult[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ analyses: AnalysisResult[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<{ analyses: AnalysisResult[] }>(`/articles/${encodeURIComponent(articleId)}/analyses`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * POST /api/v1/articles/:article_id/analysis — Submit analysis result.
 */
export async function submitAnalysisResult(articleId: string, payload: SubmitAnalysisPayload, token: string): Promise<ApiResponse<unknown>> {
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
export async function fetchBlindspotEvents({ page = 1, limit = 20, type }: FetchBlindspotEventsParams = {}): Promise<ApiResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>> {
  const cacheKey = `blindspot:${page}:${limit}:${type || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type) params.set('type', type);

  const result = await apiFetch<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(`/blindspot/events?${params}`);
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
export async function fetchSources(): Promise<ApiResponse<{ sources: SourceProfile[] }>> {
  const cacheKey = 'sources:all';

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ sources: SourceProfile[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ sources: SourceProfile[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<{ sources: SourceProfile[] }>('/sources');
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/sources/:source — detailed source transparency.
 */
export async function fetchSource(source: string): Promise<ApiResponse<SourceProfile>> {
  const cacheKey = `source:${source}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<SourceProfile>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<SourceProfile>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<SourceProfile>(`/sources/${encodeURIComponent(source)}`);
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
export async function submitArticleFeedback(articleId: string, type: FeedbackType, token: string): Promise<ApiResponse<unknown>> {
  return apiFetch(`/articles/${encodeURIComponent(articleId)}/feedback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type })
  });
}

/**
 * GET /api/v1/articles/:article_id/feedback/stats — aggregated feedback.
 */
export async function fetchArticleFeedbackStats(articleId: string): Promise<ApiResponse<{ likes: number; dislikes: number }>> {
  return apiFetch<{ likes: number; dislikes: number }>(`/articles/${encodeURIComponent(articleId)}/feedback/stats`);
}

// =============================================
// Analysis Feedback API (v2.1)
// =============================================

/**
 * POST /api/v1/analyses/:analysis_id/feedback — submit like/dislike.
 */
export async function submitAnalysisFeedback(analysisId: string, type: FeedbackType, token: string): Promise<ApiResponse<unknown>> {
  return apiFetch(`/analyses/${encodeURIComponent(analysisId)}/feedback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type })
  });
}

/**
 * GET /api/v1/analyses/:analysis_id/feedback/stats — aggregated feedback.
 */
export async function fetchAnalysisFeedbackStats(analysisId: string): Promise<ApiResponse<{ likes: number; dislikes: number }>> {
  return apiFetch<{ likes: number; dislikes: number }>(`/analyses/${encodeURIComponent(analysisId)}/feedback/stats`);
}

// =============================================
// Reports API (v2.1 — content moderation)
// =============================================

/**
 * POST /api/v1/articles/:article_id/report — report article.
 */
export async function reportArticle(articleId: string, reason: string, description: string | undefined, token: string): Promise<ApiResponse<unknown>> {
  const body: { reason: string; description?: string } = { reason };
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
export async function reportAnalysis(analysisId: string, reason: string, description: string | undefined, token: string): Promise<ApiResponse<unknown>> {
  const body: { reason: string; description?: string } = { reason };
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
export async function searchArticles(query: string, { page = 1, limit = 20 }: SearchArticlesParams = {}): Promise<ApiResponse<{ articles: Article[]; pagination: PaginationMeta }>> {
  const cacheKey = `search:${query}:${page}:${limit}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ articles: Article[]; pagination: PaginationMeta }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ articles: Article[]; pagination: PaginationMeta }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ q: query, page: String(page), limit: String(limit) });
  const result = await apiFetch<{ articles: Article[]; pagination: PaginationMeta }>(`/search?${params}`);
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
export async function fetchEvents({ page = 1, limit = 20, type }: FetchEventsParams = {}): Promise<ApiResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>> {
  const cacheKey = `events:${page}:${limit}:${type || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type) params.set('type', type);

  const result = await apiFetch<{ items: BlindspotEvent[]; pagination: PaginationMeta }>(`/events?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/events/:cluster_id — event detail with articles.
 */
export async function fetchEventDetail(clusterId: string): Promise<ApiResponse<EventCluster & { articles: Article[] }>> {
  const cacheKey = `event:${clusterId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<EventCluster & { articles: Article[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<EventCluster & { articles: Article[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<EventCluster & { articles: Article[] }>(`/events/${encodeURIComponent(clusterId)}`);
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
export async function fetchClusters({ page = 1, limit = 20, category }: FetchClustersParams = {}): Promise<ApiResponse<{ clusters: EventCluster[]; unclustered_article_ids: string[]; pagination: PaginationMeta }>> {
  const cacheKey = `clusters:${page}:${limit}:${category || ''}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<{ clusters: EventCluster[]; unclustered_article_ids: string[]; pagination: PaginationMeta }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<{ clusters: EventCluster[]; unclustered_article_ids: string[]; pagination: PaginationMeta }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (category && category !== 'all') params.set('category', category);

  const result = await apiFetch<{ clusters: EventCluster[]; unclustered_article_ids: string[]; pagination: PaginationMeta }>(`/clusters?${params}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

/**
 * GET /api/v1/clusters/:cluster_id — cluster detail with articles.
 */
export async function fetchClusterDetail(clusterId: string): Promise<ApiResponse<EventCluster & { articles: Article[] }>> {
  const cacheKey = `cluster-detail:${clusterId}`;

  if (!navigator.onLine) {
    const cached = await getCachedResponse<EventCluster & { articles: Article[] }>(cacheKey);
    if (cached) return { success: true, data: cached, error: null };
    return { success: false, data: null, error: { type: 'offline' } };
  }

  const fresh = await getFreshCachedResponse<EventCluster & { articles: Article[] }>(cacheKey);
  if (fresh) return { success: true, data: fresh, error: null };

  const result = await apiFetch<EventCluster & { articles: Article[] }>(`/clusters/${encodeURIComponent(clusterId)}`);
  if (result.success && result.data) {
    await cacheResponse(cacheKey, result.data);
  }
  return result;
}

// =============================================
// Admin Knowledge API (for dev page)
// =============================================

/**
 * GET /api/v1/knowledge/list — List knowledge entries (admin).
 */
export async function fetchKnowledgeList(adminKey: string, { page = 1, limit = 50, type, party }: FetchKnowledgeListParams = {}): Promise<ApiResponse<{ entries: KnowledgeEntry[]; pagination: PaginationMeta }>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type) params.set('type', type);
  if (party) params.set('party', party);

  return apiFetch<{ entries: KnowledgeEntry[]; pagination: PaginationMeta }>(`/knowledge/list?${params}`, {
    headers: { 'Authorization': `Bearer ${adminKey}` }
  });
}

/**
 * POST /api/v1/knowledge/upsert — Add/update a knowledge entry (admin).
 */
export async function upsertKnowledgeEntry(adminKey: string, entry: Omit<KnowledgeEntry, 'score'>): Promise<ApiResponse<KnowledgeEntry>> {
  return apiFetch<KnowledgeEntry>('/knowledge/upsert', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminKey}` },
    body: JSON.stringify(entry)
  });
}

/**
 * DELETE /api/v1/knowledge/:id — Delete a knowledge entry (admin).
 */
export async function deleteKnowledgeEntry(adminKey: string, id: string): Promise<ApiResponse<unknown>> {
  return apiFetch(`/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminKey}` }
  });
}

/**
 * GET /api/v1/knowledge/search — Search knowledge entries (admin).
 */
export async function searchKnowledgeEntries(adminKey: string, query: string, { topK = 10, type }: SearchKnowledgeParams = {}): Promise<ApiResponse<{ entries: KnowledgeEntry[] }>> {
  const params = new URLSearchParams({ q: query, topK: String(topK) });
  if (type) params.set('type', type);

  return apiFetch<{ entries: KnowledgeEntry[] }>(`/knowledge/search?${params}`, {
    headers: { 'Authorization': `Bearer ${adminKey}` }
  });
}

// =============================================
// PDPA Compliance API
// =============================================

/**
 * GET /api/v1/user/me/export — export all user data (PDPA compliance).
 */
export async function exportUserData(token: string): Promise<ApiResponse<unknown>> {
  return apiFetch('/user/me/export', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * DELETE /api/v1/user/me — delete user account (PDPA compliance).
 */
export async function deleteUserAccount(token: string): Promise<ApiResponse<unknown>> {
  return apiFetch('/user/me', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

// =============================================
// Knowledge Report API (error reporting)
// =============================================

/**
 * POST /api/v1/knowledge/:id/report — report a knowledge entry error.
 */
export async function reportKnowledgeEntry(id: string, reason: string, token: string): Promise<ApiResponse<{ report_count: number }>> {
  return apiFetch<{ report_count: number }>(`/knowledge/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reason })
  });
}

// =============================================
// Knowledge GitHub API (edit/review workflow)
// =============================================

interface ProposeEditPayload {
  entry_id: string;
  batch_file: string;
  changes: Record<string, unknown>;
  reason: string;
  content_hash: string;
}

interface ProposeEditResult {
  pr_number: number;
  pr_url: string;
}

interface KnowledgePR {
  number: number;
  title: string;
  user: string;
  created_at: string;
  labels: string[];
}

interface PRDetail {
  pr: {
    number: number;
    title: string;
    body: string;
    state: string;
    created_at: string;
    user: string;
    head_branch: string;
    mergeable: boolean | null;
  };
  diff: { removed: string[]; added: string[] } | null;
  changed_files: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }[];
}

/**
 * POST /api/v1/knowledge/github/propose — propose a knowledge edit via PR.
 */
export async function proposeKnowledgeEdit(token: string, payload: ProposeEditPayload): Promise<ApiResponse<ProposeEditResult>> {
  return apiFetch<ProposeEditResult>('/knowledge/github/propose', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

/**
 * GET /api/v1/knowledge/github/prs — list open knowledge edit PRs.
 */
export async function fetchKnowledgePRs(token: string): Promise<ApiResponse<{ prs: KnowledgePR[] }>> {
  return apiFetch<{ prs: KnowledgePR[] }>('/knowledge/github/prs', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * GET /api/v1/knowledge/github/prs/:number — PR detail with diff.
 */
export async function fetchKnowledgePRDetail(token: string, prNumber: number): Promise<ApiResponse<PRDetail>> {
  return apiFetch<PRDetail>(`/knowledge/github/prs/${prNumber}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * POST /api/v1/knowledge/github/prs/:number/merge — merge a PR (admin).
 */
export async function mergeKnowledgePR(token: string, prNumber: number): Promise<ApiResponse<{ merged: boolean }>> {
  return apiFetch<{ merged: boolean }>(`/knowledge/github/prs/${prNumber}/merge`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * POST /api/v1/knowledge/github/prs/:number/close — close a PR (admin).
 */
export async function closeKnowledgePR(token: string, prNumber: number, reason?: string): Promise<ApiResponse<{ closed: boolean }>> {
  return apiFetch<{ closed: boolean }>(`/knowledge/github/prs/${prNumber}/close`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reason: reason || '' })
  });
}
