/**
 * Extended tests for api.js — Uncovered endpoints
 *
 * Covers: fetchArticleAnalyses, fetchBlindspotEvents, fetchSources, fetchSource,
 *         fetchArticleFeedbackStats, fetchAnalysisFeedbackStats,
 *         submitAnalysisFeedback, reportArticle, reportAnalysis,
 *         fetchEvents, fetchEventDetail, fetchKnowledgeList,
 *         upsertKnowledgeEntry, deleteKnowledgeEntry, searchKnowledgeEntries,
 *         reportKnowledgeEntry, TTL cache freshness
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

let api;

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

  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ success: true, data: {} }),
  });

  api = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// fetchArticleAnalyses
// ══════════════════════════════════════════════

describe('fetchArticleAnalyses', () => {
  it('returns analyses on success', async () => {
    const analyses = [{ analysis_id: 'an1', bias_score: 60 }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { analyses } }),
    });

    const result = await api.fetchArticleAnalyses('a1');
    expect(result.success).toBe(true);
    expect(result.data.analyses[0].analysis_id).toBe('an1');
  });

  it('returns cached analyses when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['analyses:a1'] = {
      cache_key: 'analyses:a1',
      data: { analyses: [{ analysis_id: 'cached-an' }] },
    };

    const result = await api.fetchArticleAnalyses('a1');
    expect(result.success).toBe(true);
    expect(result.data.analyses[0].analysis_id).toBe('cached-an');
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const result = await api.fetchArticleAnalyses('a1');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

// ══════════════════════════════════════════════
// fetchBlindspotEvents
// ══════════════════════════════════════════════

describe('fetchBlindspotEvents', () => {
  it('returns blindspot events on success', async () => {
    const items = [{ event_id: 'bs1', title: 'Blindspot' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { items, pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } },
      }),
    });

    const result = await api.fetchBlindspotEvents();
    expect(result.success).toBe(true);
    expect(result.data.items[0].event_id).toBe('bs1');
  });

  it('passes type filter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
    });

    await api.fetchBlindspotEvents({ type: 'political' });
    expect(globalThis.fetch.mock.calls[0][0]).toContain('type=political');
  });

  it('returns cached when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['blindspot:1:20:'] = {
      cache_key: 'blindspot:1:20:',
      data: { items: [{ event_id: 'cached-bs' }] },
    };

    const result = await api.fetchBlindspotEvents();
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════
// fetchSources / fetchSource
// ══════════════════════════════════════════════

describe('fetchSources', () => {
  it('returns all source profiles', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { sources: [{ source: 'cna', tendency: 0 }] },
      }),
    });

    const result = await api.fetchSources();
    expect(result.success).toBe(true);
    expect(result.data.sources[0].source).toBe('cna');
  });

  it('returns cached when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['sources:all'] = {
      cache_key: 'sources:all',
      data: { sources: [{ source: 'cached-src' }] },
    };

    const result = await api.fetchSources();
    expect(result.success).toBe(true);
    expect(result.data.sources[0].source).toBe('cached-src');
  });
});

describe('fetchSource', () => {
  it('returns single source profile', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { source: 'liberty_times', tendency: -20, article_count: 500 },
      }),
    });

    const result = await api.fetchSource('liberty_times');
    expect(result.success).toBe(true);
    expect(result.data.source).toBe('liberty_times');
  });

  it('encodes source name in URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.fetchSource('liberty times');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/sources/liberty%20times');
  });

  it('returns cached when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['source:cna'] = {
      cache_key: 'source:cna',
      data: { source: 'cna', tendency: 5 },
    };

    const result = await api.fetchSource('cna');
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════
// Feedback Stats
// ══════════════════════════════════════════════

describe('fetchArticleFeedbackStats', () => {
  it('returns feedback stats', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { likes: 10, dislikes: 2 },
      }),
    });

    const result = await api.fetchArticleFeedbackStats('a1');
    expect(result.success).toBe(true);
    expect(result.data.likes).toBe(10);
  });

  it('calls correct endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { likes: 0, dislikes: 0 } }),
    });

    await api.fetchArticleFeedbackStats('art-123');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/articles/art-123/feedback/stats');
  });
});

describe('fetchAnalysisFeedbackStats', () => {
  it('returns analysis feedback stats', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { likes: 5, dislikes: 1 },
      }),
    });

    const result = await api.fetchAnalysisFeedbackStats('an1');
    expect(result.success).toBe(true);
    expect(result.data.likes).toBe(5);
  });

  it('calls correct endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.fetchAnalysisFeedbackStats('an-123');
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/analyses/an-123/feedback/stats');
  });
});

// ══════════════════════════════════════════════
// submitAnalysisFeedback
// ══════════════════════════════════════════════

describe('submitAnalysisFeedback', () => {
  it('sends POST with feedback type and auth', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.submitAnalysisFeedback('an1', 'like', 'tok');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/analyses/an1/feedback');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer tok');
    expect(JSON.parse(opts.body).type).toBe('like');
  });
});

// ══════════════════════════════════════════════
// reportArticle / reportAnalysis
// ══════════════════════════════════════════════

describe('reportArticle', () => {
  it('sends POST with reason and optional description', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.reportArticle('a1', 'fake_news', 'Contains misinformation', 'tok');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/articles/a1/report');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.reason).toBe('fake_news');
    expect(body.description).toBe('Contains misinformation');
  });

  it('omits description when undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.reportArticle('a1', 'spam', undefined, 'tok');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.description).toBeUndefined();
  });
});

describe('reportAnalysis', () => {
  it('sends POST to analysis report endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.reportAnalysis('an1', 'inaccurate', 'Wrong score', 'tok');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/analyses/an1/report');
    expect(opts.method).toBe('POST');
  });
});

// ══════════════════════════════════════════════
// fetchEvents / fetchEventDetail
// ══════════════════════════════════════════════

describe('fetchEvents', () => {
  it('returns events on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { items: [{ event_id: 'e1' }], pagination: { page: 1 } },
      }),
    });

    const result = await api.fetchEvents();
    expect(result.success).toBe(true);
    expect(result.data.items[0].event_id).toBe('e1');
  });

  it('passes type filter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
    });

    await api.fetchEvents({ type: 'economy' });
    expect(globalThis.fetch.mock.calls[0][0]).toContain('type=economy');
  });

  it('returns cached when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['events:1:20:'] = {
      cache_key: 'events:1:20:',
      data: { items: [{ event_id: 'cached-ev' }] },
    };

    const result = await api.fetchEvents();
    expect(result.success).toBe(true);
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const result = await api.fetchEvents();
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

describe('fetchEventDetail', () => {
  it('returns event detail with articles', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { cluster_id: 'c1', articles: [{ article_id: 'a1' }] },
      }),
    });

    const result = await api.fetchEventDetail('c1');
    expect(result.success).toBe(true);
    expect(result.data.cluster_id).toBe('c1');
  });

  it('returns cached when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mockCachedStore._data['event:c1'] = {
      cache_key: 'event:c1',
      data: { cluster_id: 'c1', articles: [] },
    };

    const result = await api.fetchEventDetail('c1');
    expect(result.success).toBe(true);
  });

  it('returns offline error when not cached', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const result = await api.fetchEventDetail('c1');
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });
});

// ══════════════════════════════════════════════
// Knowledge Admin API
// ══════════════════════════════════════════════

describe('fetchKnowledgeList', () => {
  it('returns knowledge entries with pagination', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { entries: [{ id: 'k1', type: 'politician' }], pagination: { page: 1 } },
      }),
    });

    const result = await api.fetchKnowledgeList('admin-key');
    expect(result.success).toBe(true);
    expect(result.data.entries[0].id).toBe('k1');
  });

  it('passes type and party filters', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { entries: [] } }),
    });

    await api.fetchKnowledgeList('key', { type: 'politician', party: 'DPP' });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('type=politician');
    expect(url).toContain('party=DPP');
  });

  it('sends admin key as Authorization', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { entries: [] } }),
    });

    await api.fetchKnowledgeList('secret-admin-key');
    expect(globalThis.fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer secret-admin-key');
  });
});

describe('upsertKnowledgeEntry', () => {
  it('sends POST with entry data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { id: 'k1' } }),
    });

    const entry = { id: 'k1', type: 'politician', name: 'Test', content: 'Info' };
    const result = await api.upsertKnowledgeEntry('key', entry);
    expect(result.success).toBe(true);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/knowledge/upsert');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).name).toBe('Test');
  });
});

describe('deleteKnowledgeEntry', () => {
  it('sends DELETE with admin key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    });

    await api.deleteKnowledgeEntry('key', 'k1');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/knowledge/k1');
    expect(opts.method).toBe('DELETE');
  });
});

describe('searchKnowledgeEntries', () => {
  it('returns search results', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { entries: [{ id: 'k2', name: 'Match' }] },
      }),
    });

    const result = await api.searchKnowledgeEntries('key', 'politician');
    expect(result.success).toBe(true);
    expect(result.data.entries[0].name).toBe('Match');
  });

  it('passes topK and type params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ success: true, data: { entries: [] } }),
    });

    await api.searchKnowledgeEntries('key', 'query', { topK: 5, type: 'issue' });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('topK=5');
    expect(url).toContain('type=issue');
  });
});

// ══════════════════════════════════════════════
// reportKnowledgeEntry
// ══════════════════════════════════════════════

describe('reportKnowledgeEntry', () => {
  it('sends POST with reason and returns report_count', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { report_count: 3 },
      }),
    });

    const result = await api.reportKnowledgeEntry('k1', 'inaccurate data', 'tok');
    expect(result.success).toBe(true);
    expect(result.data.report_count).toBe(3);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/knowledge/k1/report');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).reason).toBe('inaccurate data');
  });
});

// ══════════════════════════════════════════════
// TTL Cache Freshness (getFreshCachedResponse)
// ══════════════════════════════════════════════

describe('TTL cache freshness', () => {
  it('uses fresh cache when TTL not expired (skips API call)', async () => {
    // Pre-populate with a fresh cache entry (just cached)
    const cacheKey = 'analyses:fresh-art';
    mockCachedStore._data[cacheKey] = {
      cache_key: cacheKey,
      data: { analyses: [{ analysis_id: 'fresh' }] },
      cached_at: new Date().toISOString(), // just now = fresh
    };

    const result = await api.fetchArticleAnalyses('fresh-art');
    expect(result.success).toBe(true);
    expect(result.data.analyses[0].analysis_id).toBe('fresh');
    // Should NOT have called fetch (used cache)
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips stale cache and calls API when TTL expired', async () => {
    // Pre-populate with a stale cache entry (13 hours ago)
    const cacheKey = 'analyses:stale-art';
    const staleDate = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    mockCachedStore._data[cacheKey] = {
      cache_key: cacheKey,
      data: { analyses: [{ analysis_id: 'stale' }] },
      cached_at: staleDate,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { analyses: [{ analysis_id: 'api-fresh' }] },
      }),
    });

    const result = await api.fetchArticleAnalyses('stale-art');
    expect(result.success).toBe(true);
    expect(result.data.analyses[0].analysis_id).toBe('api-fresh');
    // Should have called fetch (cache was stale)
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
