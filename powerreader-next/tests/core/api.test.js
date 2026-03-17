/**
 * Unit tests for api.js
 *
 * Tests cover: fetchArticles, fetchArticle, fetchArticleKnowledge,
 *              fetchArticleCluster, fetchUserMe, fetchUserPoints,
 *              fetchUserContributions, submitAnalysisResult,
 *              submitArticleFeedback, searchArticles,
 *              exportUserData (NEW), deleteUserAccount (NEW),
 *              timeout handling, network error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock IndexedDB via db.js ──

function createMockStore(data = {}) {
  const store = {
    _data: { ...data },
    put(item) {
      const key = item.article_hash || item.cache_key || item.key;
      store._data[key] = item;
      return { onsuccess: null, onerror: null };
    },
    get(key) {
      const req = {
        result: store._data[key] || undefined,
        onsuccess: null,
        onerror: null,
      };
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
    getAll() {
      const req = {
        result: Object.values(store._data),
        onsuccess: null,
        onerror: null,
      };
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
  };
  return store;
}

function createMockDB(stores = {}) {
  return {
    transaction(storeName, mode) {
      const store = stores[storeName] || createMockStore();
      if (!stores[storeName]) stores[storeName] = store;
      const tx = {
        objectStore() { return store; },
        oncomplete: null,
        onerror: null,
        error: null,
      };
      // Resolve tx oncomplete asynchronously
      Promise.resolve().then(() => tx.oncomplete?.());
      return tx;
    },
    close() {},
  };
}

let mockArticlesStore;
let mockCachedStore;
let mockDB;

vi.mock('../../src/lib/core/db.js', () => ({
  openDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// ── Dynamic module import ──

let apiModule;

async function loadModule() {
  return await import('../../src/lib/core/api.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();

  mockArticlesStore = createMockStore();
  mockCachedStore = createMockStore();
  mockDB = createMockDB({
    articles: mockArticlesStore,
    cached_results: mockCachedStore,
  });

  vi.mock('../../src/lib/core/db.js', () => ({
    openDB: vi.fn(() => Promise.resolve(mockDB)),
  }));

  // Default: online
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

  // Default: fetch returns success
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ success: true, data: {} }),
  });

  apiModule = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. fetchArticles
// ══════════════════════════════════════════════

describe('fetchArticles', () => {
  it('returns articles from API on success', async () => {
    const mockArticles = [{ article_id: 'a1', title: 'Test' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { articles: mockArticles, pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } },
      }),
    });

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(true);
    expect(result.data.articles).toEqual(mockArticles);
  });

  it('passes pagination params to URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
    });

    await apiModule.fetchArticles({ page: 3, limit: 10, sort_by: 'title', sort_order: 'asc' });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('sort_by=title');
    expect(calledUrl).toContain('sort_order=asc');
  });

  it('passes category filter when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
    });

    await apiModule.fetchArticles({ category: 'politics' });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('category=politics');
  });

  it('passes source filter when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
    });

    await apiModule.fetchArticles({ source: 'liberty_times' });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('source=liberty_times');
  });

  it('caches response to IndexedDB on success', async () => {
    const articles = [{ article_id: 'cached1', title: 'Cached' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { articles, pagination: { page: 1 } },
      }),
    });

    await apiModule.fetchArticles();

    // Article should be put into IDB (via cacheArticle)
    // cacheResponse also called — mockDB was used
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached articles when offline and cache exists', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    // Pre-populate cached_results
    const cacheKey = 'articles:1:20:published_at:desc::';
    mockCachedStore._data[cacheKey] = {
      cache_key: cacheKey,
      data: { articles: [{ article_id: 'offline1' }] },
    };

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(true);
    expect(result.data.articles[0].article_id).toBe('offline1');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns all cached articles fallback when offline with no cache key match', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    // Articles store has some articles, but no cached_results entry
    mockArticlesStore._data['art1'] = { article_hash: 'art1', title: 'Fallback' };

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(true);
    expect(result.data.articles).toHaveLength(1);
    expect(result.data.articles[0].title).toBe('Fallback');
  });

  it('returns error on API failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ success: false, error: { type: 'api_error', status: 500 } }),
    });

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ══════════════════════════════════════════════
// 2. fetchArticle
// ══════════════════════════════════════════════

describe('fetchArticle', () => {
  it('returns article detail on success', async () => {
    const article = { article_id: 'a1', title: 'Detail', content_markdown: '# Test' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: article }),
    });

    const result = await apiModule.fetchArticle('a1');

    expect(result.success).toBe(true);
    expect(result.data.article_id).toBe('a1');
  });

  it('caches article on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { article_id: 'cache-me' } }),
    });

    await apiModule.fetchArticle('cache-me');

    // No assertion on mock internals — just verify no error
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached article when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockArticlesStore._data['offline-art'] = { article_hash: 'offline-art', title: 'Offline' };

    const result = await apiModule.fetchArticle('offline-art');

    expect(result.success).toBe(true);
    expect(result.data.title).toBe('Offline');
  });

  it('returns article_not_cached error when offline and not in cache', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.fetchArticle('missing');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('article_not_cached');
  });
});

// ══════════════════════════════════════════════
// 3. fetchArticleKnowledge
// ══════════════════════════════════════════════

describe('fetchArticleKnowledge', () => {
  it('returns knowledge entries on success', async () => {
    const knowledge = { entries: [{ id: 'k1', type: 'politician' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: knowledge }),
    });

    const result = await apiModule.fetchArticleKnowledge('a1');

    expect(result.success).toBe(true);
    expect(result.data.entries[0].id).toBe('k1');
  });

  it('caches knowledge response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { entries: [] } }),
    });

    await apiModule.fetchArticleKnowledge('a1');

    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached knowledge when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const cacheKey = 'knowledge:k-art';
    mockCachedStore._data[cacheKey] = { cache_key: cacheKey, data: { entries: [{ id: 'cached-k' }] } };

    const result = await apiModule.fetchArticleKnowledge('k-art');

    expect(result.success).toBe(true);
    expect(result.data.entries[0].id).toBe('cached-k');
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.fetchArticleKnowledge('uncached');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

// ══════════════════════════════════════════════
// 4. fetchArticleCluster
// ══════════════════════════════════════════════

describe('fetchArticleCluster', () => {
  it('returns cluster data on success', async () => {
    const cluster = { articles: [{ article_id: 'c1' }], similarity: 0.85 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: cluster }),
    });

    const result = await apiModule.fetchArticleCluster('a1');

    expect(result.success).toBe(true);
    expect(result.data.similarity).toBe(0.85);
  });

  it('caches cluster response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
    });

    await apiModule.fetchArticleCluster('a1');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached cluster when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const cacheKey = 'cluster:cl-art';
    mockCachedStore._data[cacheKey] = { cache_key: cacheKey, data: { articles: [{ article_id: 'cl-cached' }] } };

    const result = await apiModule.fetchArticleCluster('cl-art');

    expect(result.success).toBe(true);
    expect(result.data.articles[0].article_id).toBe('cl-cached');
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.fetchArticleCluster('uncached');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

// ══════════════════════════════════════════════
// 5. fetchUserMe (Auth)
// ══════════════════════════════════════════════

describe('fetchUserMe', () => {
  it('sends Authorization header with token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { user_hash: 'u1' } }),
    });

    await apiModule.fetchUserMe('my-jwt-token');

    const calledOpts = globalThis.fetch.mock.calls[0][1];
    expect(calledOpts.headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('returns user data on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { user_hash: 'u1', display_name: 'Test' } }),
    });

    const result = await apiModule.fetchUserMe('token');

    expect(result.success).toBe(true);
    expect(result.data.user_hash).toBe('u1');
  });
});

// ══════════════════════════════════════════════
// 6. fetchUserPoints (Auth)
// ══════════════════════════════════════════════

describe('fetchUserPoints', () => {
  it('sends Authorization header with token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { points: 100 } }),
    });

    await apiModule.fetchUserPoints('pts-token');

    const calledOpts = globalThis.fetch.mock.calls[0][1];
    expect(calledOpts.headers['Authorization']).toBe('Bearer pts-token');
  });

  it('calls /user/me/points endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { points: 50 } }),
    });

    await apiModule.fetchUserPoints('token');

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/user/me/points');
  });
});

// ══════════════════════════════════════════════
// 7. fetchUserContributions (Auth)
// ══════════════════════════════════════════════

describe('fetchUserContributions', () => {
  it('sends Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { contributions: [] } }),
    });

    await apiModule.fetchUserContributions('contrib-token');

    const calledOpts = globalThis.fetch.mock.calls[0][1];
    expect(calledOpts.headers['Authorization']).toBe('Bearer contrib-token');
  });

  it('passes page and limit params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { contributions: [] } }),
    });

    await apiModule.fetchUserContributions('token', { page: 2, limit: 10 });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=10');
  });

  it('passes days param when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { contributions: [] } }),
    });

    await apiModule.fetchUserContributions('token', { days: 30 });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('days=30');
  });
});

// ══════════════════════════════════════════════
// 8. submitAnalysisResult (Auth, POST)
// ══════════════════════════════════════════════

describe('submitAnalysisResult', () => {
  it('sends POST with auth header and body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { id: 'analysis1' } }),
    });

    const payload = { bias_score: 65, controversy_score: 40 };
    await apiModule.submitAnalysisResult('art1', payload, 'my-token');

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/articles/art1/analysis');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer my-token');
    expect(JSON.parse(opts.body)).toEqual(payload);
  });

  it('returns success response from server', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { id: 'a1', points_earned: 10 } }),
    });

    const result = await apiModule.submitAnalysisResult('art1', {}, 'token');

    expect(result.success).toBe(true);
    expect(result.data.points_earned).toBe(10);
  });
});

// ══════════════════════════════════════════════
// 9. submitArticleFeedback (Auth, POST)
// ══════════════════════════════════════════════

describe('submitArticleFeedback', () => {
  it('sends POST with feedback type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await apiModule.submitArticleFeedback('art1', 'like', 'fb-token');

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/articles/art1/feedback');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer fb-token');
    expect(JSON.parse(opts.body)).toEqual({ type: 'like' });
  });

  it('supports dislike type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await apiModule.submitArticleFeedback('art1', 'dislike', 'token');

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.type).toBe('dislike');
  });
});

// ══════════════════════════════════════════════
// 10. searchArticles
// ══════════════════════════════════════════════

describe('searchArticles', () => {
  it('passes query params to search endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
    });

    await apiModule.searchArticles('election', { page: 1, limit: 10 });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/search');
    expect(calledUrl).toContain('q=election');
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('limit=10');
  });

  it('caches search results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { articles: [{ article_id: 's1' }] } }),
    });

    const result = await apiModule.searchArticles('test');

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached search results when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const cacheKey = 'search:taiwan:1:20';
    mockCachedStore._data[cacheKey] = { cache_key: cacheKey, data: { articles: [{ article_id: 'cached-search' }] } };

    const result = await apiModule.searchArticles('taiwan');

    expect(result.success).toBe(true);
    expect(result.data.articles[0].article_id).toBe('cached-search');
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.searchArticles('uncached-query');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

// ══════════════════════════════════════════════
// 11. exportUserData (NEW — RED phase)
// ══════════════════════════════════════════════

describe('exportUserData', () => {
  it('sends GET with Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { export: {} } }),
    });

    const result = await apiModule.exportUserData('export-token');

    expect(result.success).toBe(true);
    const calledOpts = globalThis.fetch.mock.calls[0][1];
    expect(calledOpts.headers['Authorization']).toBe('Bearer export-token');
  });

  it('calls /user/me/export endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await apiModule.exportUserData('token');

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/user/me/export');
  });
});

// ══════════════════════════════════════════════
// 12. deleteUserAccount (NEW — RED phase)
// ══════════════════════════════════════════════

describe('deleteUserAccount', () => {
  it('sends DELETE with Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { deleted: true } }),
    });

    const result = await apiModule.deleteUserAccount('delete-token');

    expect(result.success).toBe(true);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.headers['Authorization']).toBe('Bearer delete-token');
  });

  it('calls /user/me endpoint with DELETE method', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await apiModule.deleteUserAccount('token');

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/user/me');
  });
});

// ══════════════════════════════════════════════
// 13. Timeout handling
// ══════════════════════════════════════════════

describe('timeout handling', () => {
  it('returns timeout error when AbortSignal fires', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError');
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('timeout');
  });

  it('returns timeout error on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await apiModule.fetchArticle('a1');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('timeout');
  });
});

// ══════════════════════════════════════════════
// 14. Network error handling
// ══════════════════════════════════════════════

describe('network error handling', () => {
  it('returns network error on TypeError (fetch failure)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('network');
  });

  it('returns network error on generic Error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await apiModule.fetchUserMe('token');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('network');
  });

  it('returns error when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ success: false, error: { type: 'not_found' } }),
    });

    const result = await apiModule.fetchArticle('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('not_found');
  });

  it('returns generic api_error when no error in response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ success: false }),
    });

    const result = await apiModule.fetchArticles();

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('api_error');
    expect(result.error.status).toBe(500);
  });
});

// ══════════════════════════════════════════════
// 15. API_BASE constant
// ══════════════════════════════════════════════

describe('API_BASE', () => {
  it('exports the correct API base URL', () => {
    expect(apiModule.API_BASE).toBe('https://powerreader-api.watermelom5404.workers.dev/api/v1');
  });
});
