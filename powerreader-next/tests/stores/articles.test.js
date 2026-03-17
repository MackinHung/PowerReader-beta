/**
 * Unit tests for articles.svelte.js (Articles Store)
 *
 * Tests cover: getArticlesStore, fetchArticles, loadMore,
 *              searchArticles, getArticle, refreshArticles,
 *              setSortBy, clearSearch
 *
 * Strategy: Mock '$lib/core/api.js' and test the store interface.
 * Svelte 5 runes ($state) are expected to compile/work in vitest
 * with the svelte compiler installed; otherwise test via getters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock api.js ──

const mockApi = {
  fetchArticles: vi.fn().mockResolvedValue({
    success: true,
    data: {
      articles: [
        { article_id: 'a1', article_hash: 'h1', title: 'Article 1' },
        { article_id: 'a2', article_hash: 'h2', title: 'Article 2' },
      ],
      pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
    },
  }),
  searchArticles: vi.fn().mockResolvedValue({
    success: true,
    data: {
      articles: [{ article_id: 's1', title: 'Search Result' }],
    },
  }),
};

vi.mock('$lib/core/api.js', () => mockApi);

// ── Dynamic module import ──

let articlesModule;
let store;

async function loadModule() {
  return await import('../../src/lib/stores/articles.svelte.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();

  mockApi.fetchArticles.mockResolvedValue({
    success: true,
    data: {
      articles: [
        { article_id: 'a1', article_hash: 'h1', title: 'Article 1' },
        { article_id: 'a2', article_hash: 'h2', title: 'Article 2' },
      ],
      pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
    },
  });
  mockApi.searchArticles.mockResolvedValue({
    success: true,
    data: {
      articles: [{ article_id: 's1', title: 'Search Result' }],
    },
  });

  vi.mock('$lib/core/api.js', () => mockApi);

  articlesModule = await loadModule();
  store = articlesModule.getArticlesStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. getArticlesStore — structure
// ══════════════════════════════════════════════

describe('getArticlesStore', () => {
  it('returns an object with expected getters', () => {
    expect(store).toBeDefined();
    expect(Array.isArray(store.articles)).toBe(true);
    expect(typeof store.loading).toBe('boolean');
    expect(typeof store.hasMore).toBe('boolean');
  });

  it('returns an object with expected methods', () => {
    expect(typeof store.fetchArticles).toBe('function');
    expect(typeof store.loadMore).toBe('function');
    expect(typeof store.searchArticles).toBe('function');
    expect(typeof store.getArticle).toBe('function');
    expect(typeof store.refreshArticles).toBe('function');
    expect(typeof store.setSortBy).toBe('function');
    expect(typeof store.clearSearch).toBe('function');
  });
});

// ══════════════════════════════════════════════
// 2. fetchArticles
// ══════════════════════════════════════════════

describe('fetchArticles', () => {
  it('sets articles array on success', async () => {
    await store.fetchArticles();

    expect(store.articles).toHaveLength(2);
    expect(store.articles[0].article_id).toBe('a1');
  });

  it('page 1 replaces articles (different category)', async () => {
    // First fetch: 'all'
    await store.fetchArticles('all', 1);
    expect(store.articles).toHaveLength(2);

    // Fetch different category — no cache hit
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'new1', title: 'New' }] },
    });

    await store.fetchArticles('politics', 1);
    expect(store.articles).toHaveLength(1);
    expect(store.articles[0].article_id).toBe('new1');
  });

  it('page 2+ appends articles', async () => {
    await store.fetchArticles('all', 1);
    expect(store.articles).toHaveLength(2);

    // Page 2 should append
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'a3', title: 'Article 3' }] },
    });

    await store.fetchArticles('all', 2);
    expect(store.articles).toHaveLength(3);
    expect(store.articles[2].article_id).toBe('a3');
  });

  it('passes category filter when not "all"', async () => {
    await store.fetchArticles('politics', 1);

    expect(mockApi.fetchArticles).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'politics' }),
    );
  });

  it('passes undefined category when filter is "all"', async () => {
    await store.fetchArticles('all', 1);

    expect(mockApi.fetchArticles).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined }),
    );
  });

  it('sets error on API failure', async () => {
    mockApi.fetchArticles.mockResolvedValue({
      success: false,
      error: { type: 'fetch_failed' },
    });

    await store.fetchArticles();

    expect(store.error).toBe('fetch_failed');
  });

  it('sets hasMore=false when fewer than 20 results', async () => {
    // Default mock returns 2 articles (< 20)
    await store.fetchArticles();

    expect(store.hasMore).toBe(false);
  });

  it('sets hasMore=true when 20+ results', async () => {
    const twentyArticles = Array.from({ length: 20 }, (_, i) => ({ article_id: `a${i}`, title: `Art ${i}` }));
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: twentyArticles },
    });

    await store.fetchArticles();

    expect(store.hasMore).toBe(true);
  });
});

// ══════════════════════════════════════════════
// 3. loadMore
// ══════════════════════════════════════════════

describe('loadMore', () => {
  it('increments page and fetches next page', async () => {
    // Enable hasMore by returning 20 articles
    const twentyArticles = Array.from({ length: 20 }, (_, i) => ({ article_id: `a${i}`, title: `Art ${i}` }));
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: twentyArticles },
    });

    await store.fetchArticles('all', 1);
    mockApi.fetchArticles.mockClear();

    // Now loadMore should fetch page 2
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'more1' }] },
    });

    await store.loadMore();

    expect(mockApi.fetchArticles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });
});

// ══════════════════════════════════════════════
// 4. searchArticles
// ══════════════════════════════════════════════

describe('searchArticles', () => {
  it('calls api.searchArticles with query', async () => {
    await store.searchArticles('election');

    expect(mockApi.searchArticles).toHaveBeenCalledWith('election');
    expect(store.articles[0].article_id).toBe('s1');
  });

  it('falls back to fetchArticles on empty query', async () => {
    await store.searchArticles('');

    expect(mockApi.searchArticles).not.toHaveBeenCalled();
    expect(mockApi.fetchArticles).toHaveBeenCalled();
  });

  it('falls back to fetchArticles on whitespace-only query', async () => {
    await store.searchArticles('   ');

    expect(mockApi.searchArticles).not.toHaveBeenCalled();
    expect(mockApi.fetchArticles).toHaveBeenCalled();
  });

  it('sets error on search failure', async () => {
    mockApi.searchArticles.mockResolvedValue({
      success: false,
      error: { type: 'search_failed' },
    });

    await store.searchArticles('badquery');

    expect(store.error).toBe('search_failed');
  });

  it('sets hasMore=false after search', async () => {
    await store.searchArticles('test');

    expect(store.hasMore).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 5. getArticle
// ══════════════════════════════════════════════

describe('getArticle', () => {
  it('finds by article_id', async () => {
    await store.fetchArticles();

    const found = store.getArticle('a1');
    expect(found).toBeDefined();
    expect(found.title).toBe('Article 1');
  });

  it('finds by article_hash', async () => {
    await store.fetchArticles();

    const found = store.getArticle('h2');
    expect(found).toBeDefined();
    expect(found.title).toBe('Article 2');
  });

  it('returns undefined when not found', async () => {
    await store.fetchArticles();

    const found = store.getArticle('nonexistent');
    expect(found).toBeUndefined();
  });
});

// ══════════════════════════════════════════════
// 6. refreshArticles
// ══════════════════════════════════════════════

describe('refreshArticles', () => {
  it('re-fetches page 1 with current filter', async () => {
    await store.fetchArticles('politics', 1);
    mockApi.fetchArticles.mockClear();

    await store.refreshArticles();

    expect(mockApi.fetchArticles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, category: 'politics' }),
    );
  });
});

// ══════════════════════════════════════════════
// 7. setSortBy
// ══════════════════════════════════════════════

describe('setSortBy', () => {
  it('changes sort and re-fetches page 1', async () => {
    await store.fetchArticles();
    mockApi.fetchArticles.mockClear();

    await store.setSortBy('title');

    expect(store.currentSort).toBe('title');
    expect(mockApi.fetchArticles).toHaveBeenCalledWith(
      expect.objectContaining({ sort_by: 'title', page: 1 }),
    );
  });
});

// ══════════════════════════════════════════════
// 8. clearSearch
// ══════════════════════════════════════════════

describe('clearSearch', () => {
  it('resets searchQuery and fetches page 1', async () => {
    await store.searchArticles('something');
    expect(store.searchQuery).toBe('something');

    mockApi.fetchArticles.mockClear();
    await store.clearSearch();

    expect(store.searchQuery).toBe('');
    expect(mockApi.fetchArticles).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 9. In-memory category cache
// ══════════════════════════════════════════════

describe('in-memory category cache', () => {
  it('returns cached results on page 1 re-tap (no API call)', async () => {
    await store.fetchArticles('all', 1);
    expect(store.articles).toHaveLength(2);

    mockApi.fetchArticles.mockClear();

    // Second call to same filter+page → cache hit
    await store.fetchArticles('all', 1);
    expect(mockApi.fetchArticles).not.toHaveBeenCalled();
    expect(store.articles).toHaveLength(2);
    expect(store.articles[0].article_id).toBe('a1');
  });

  it('does not cache page 2+ results', async () => {
    const twentyArticles = Array.from({ length: 20 }, (_, i) => ({
      article_id: `a${i}`, title: `Art ${i}`,
    }));
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: twentyArticles },
    });

    await store.fetchArticles('all', 1);
    mockApi.fetchArticles.mockClear();

    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'more1' }] },
    });

    // Page 2 should always call API
    await store.fetchArticles('all', 2);
    expect(mockApi.fetchArticles).toHaveBeenCalled();
  });

  it('separate caches per category', async () => {
    // Fetch 'all'
    await store.fetchArticles('all', 1);
    expect(store.articles).toHaveLength(2);

    // Fetch 'politics' with different data
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'p1', title: 'Politics' }] },
    });
    await store.fetchArticles('politics', 1);
    expect(store.articles).toHaveLength(1);

    mockApi.fetchArticles.mockClear();

    // Switch back to 'all' → cache hit with original data
    await store.fetchArticles('all', 1);
    expect(mockApi.fetchArticles).not.toHaveBeenCalled();
    expect(store.articles).toHaveLength(2);
    expect(store.articles[0].article_id).toBe('a1');
  });

  it('refreshArticles bypasses and repopulates cache', async () => {
    await store.fetchArticles('all', 1);
    expect(store.articles).toHaveLength(2);

    // Change mock data
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'refreshed', title: 'Refreshed' }] },
    });

    // refreshArticles clears cache → forces API call
    await store.refreshArticles();
    expect(store.articles).toHaveLength(1);
    expect(store.articles[0].article_id).toBe('refreshed');
  });

  it('setSortBy invalidates all category caches', async () => {
    // Cache two categories
    await store.fetchArticles('all', 1);
    mockApi.fetchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'p1', title: 'Politics' }] },
    });
    await store.fetchArticles('politics', 1);
    mockApi.fetchArticles.mockClear();

    // setSortBy clears ALL caches + re-fetches currentFilter ('politics')
    await store.setSortBy('title');
    expect(mockApi.fetchArticles).toHaveBeenCalledTimes(1);

    mockApi.fetchArticles.mockClear();

    // 'all' cache was invalidated and NOT re-fetched by setSortBy → needs API
    await store.fetchArticles('all', 1);
    expect(mockApi.fetchArticles).toHaveBeenCalled();
  });

  it('does not set loading=true on cache hit', async () => {
    await store.fetchArticles('all', 1);

    // Re-tap: should not show loading
    await store.fetchArticles('all', 1);
    expect(store.loading).toBe(false);
  });
});
