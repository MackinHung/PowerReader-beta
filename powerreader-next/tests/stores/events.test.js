/**
 * Unit tests for events.svelte.js (Events Store)
 *
 * Tests cover: getEventsStore, fetchEvents, loadMore,
 *              expandEvent, collapseEvent, getExpandedArticles,
 *              refreshEvents
 *
 * Strategy: Mock '$lib/core/api.js' and test the store interface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock api.js ──

const mockApi = {
  fetchEvents: vi.fn().mockResolvedValue({
    success: true,
    data: {
      items: [
        { cluster_id: 'c1', title: 'Event 1', article_count: 3, source_count: 2 },
        { cluster_id: 'c2', title: 'Event 2', article_count: 5, source_count: 3 },
      ],
    },
  }),
  searchArticles: vi.fn().mockResolvedValue({
    success: true,
    data: {
      articles: [
        { article_id: 'a1', article_hash: 'h1', title: 'Related Article 1' },
        { article_id: 'a2', article_hash: 'h2', title: 'Related Article 2' },
      ],
    },
  }),
};

vi.mock('$lib/core/api.js', () => mockApi);

// ── Dynamic module import ──

let eventsModule;
let store;

async function loadModule() {
  return await import('../../src/lib/stores/events.svelte.js');
}

// ── Setup / Teardown ──

beforeEach(async () => {
  vi.resetModules();

  mockApi.fetchEvents.mockResolvedValue({
    success: true,
    data: {
      items: [
        { cluster_id: 'c1', title: 'Event 1', article_count: 3, source_count: 2 },
        { cluster_id: 'c2', title: 'Event 2', article_count: 5, source_count: 3 },
      ],
    },
  });
  mockApi.searchArticles.mockResolvedValue({
    success: true,
    data: {
      articles: [
        { article_id: 'a1', article_hash: 'h1', title: 'Related Article 1' },
        { article_id: 'a2', article_hash: 'h2', title: 'Related Article 2' },
      ],
    },
  });

  vi.mock('$lib/core/api.js', () => mockApi);

  eventsModule = await loadModule();
  store = eventsModule.getEventsStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. getEventsStore — structure
// ══════════════════════════════════════════════

describe('getEventsStore', () => {
  it('returns an object with expected getters', () => {
    expect(store).toBeDefined();
    expect(Array.isArray(store.events)).toBe(true);
    expect(typeof store.loading).toBe('boolean');
    expect(typeof store.hasMore).toBe('boolean');
    expect(store.error).toBeNull();
    expect(store.expandingId).toBeNull();
  });

  it('returns an object with expected methods', () => {
    expect(typeof store.fetchEvents).toBe('function');
    expect(typeof store.loadMore).toBe('function');
    expect(typeof store.expandEvent).toBe('function');
    expect(typeof store.collapseEvent).toBe('function');
    expect(typeof store.getExpandedArticles).toBe('function');
    expect(typeof store.refreshEvents).toBe('function');
  });
});

// ══════════════════════════════════════════════
// 2. fetchEvents
// ══════════════════════════════════════════════

describe('fetchEvents', () => {
  it('sets events array on success', async () => {
    await store.fetchEvents();

    expect(store.events).toHaveLength(2);
    expect(store.events[0].cluster_id).toBe('c1');
  });

  it('page 1 replaces events', async () => {
    await store.fetchEvents(1);
    expect(store.events).toHaveLength(2);

    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: [{ cluster_id: 'c3', title: 'New Event' }] },
    });

    await store.fetchEvents(1);
    expect(store.events).toHaveLength(1);
    expect(store.events[0].cluster_id).toBe('c3');
  });

  it('page 2+ appends events', async () => {
    await store.fetchEvents(1);
    expect(store.events).toHaveLength(2);

    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: [{ cluster_id: 'c3', title: 'Event 3' }] },
    });

    await store.fetchEvents(2);
    expect(store.events).toHaveLength(3);
    expect(store.events[2].cluster_id).toBe('c3');
  });

  it('sets error on API failure', async () => {
    mockApi.fetchEvents.mockResolvedValue({
      success: false,
      error: { type: 'fetch_failed' },
    });

    await store.fetchEvents();
    expect(store.error).toBe('fetch_failed');
  });

  it('sets hasMore=false when fewer than 20 results', async () => {
    await store.fetchEvents();
    expect(store.hasMore).toBe(false);
  });

  it('sets hasMore=true when 20+ results', async () => {
    const twentyEvents = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `c${i}`, title: `Event ${i}`,
    }));
    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: twentyEvents },
    });

    await store.fetchEvents();
    expect(store.hasMore).toBe(true);
  });

  it('handles data.events fallback', async () => {
    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: {
        events: [{ cluster_id: 'e1', title: 'Fallback Event' }],
      },
    });

    await store.fetchEvents();
    expect(store.events).toHaveLength(1);
    expect(store.events[0].cluster_id).toBe('e1');
  });

  it('handles exception during fetch', async () => {
    mockApi.fetchEvents.mockRejectedValue(new Error('Network error'));

    await store.fetchEvents();
    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 3. loadMore
// ══════════════════════════════════════════════

describe('loadMore', () => {
  it('increments page and fetches next page', async () => {
    const twentyEvents = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `c${i}`, title: `Event ${i}`,
    }));
    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: twentyEvents },
    });

    await store.fetchEvents(1);
    mockApi.fetchEvents.mockClear();

    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: [{ cluster_id: 'more1' }] },
    });

    await store.loadMore();
    expect(mockApi.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('does not fetch when hasMore is false', async () => {
    await store.fetchEvents(1);
    expect(store.hasMore).toBe(false);

    mockApi.fetchEvents.mockClear();
    await store.loadMore();
    expect(mockApi.fetchEvents).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// 4. expandEvent
// ══════════════════════════════════════════════

describe('expandEvent', () => {
  it('truncates title to 15 chars for search', async () => {
    const longTitle = '這是一個非常長的事件標題用來測試截斷功能是否正常運作';
    await store.expandEvent('c1', longTitle);

    expect(mockApi.searchArticles).toHaveBeenCalledWith(longTitle.slice(0, 15));
  });

  it('stores articles in expandedArticles', async () => {
    await store.expandEvent('c1', 'Event Title');

    const articles = store.getExpandedArticles('c1');
    expect(articles).toHaveLength(2);
    expect(articles[0].article_id).toBe('a1');
  });

  it('does not re-fetch if already expanded with results (cache hit)', async () => {
    await store.expandEvent('c1', 'Event Title');
    mockApi.searchArticles.mockClear();

    await store.expandEvent('c1', 'Event Title');
    expect(mockApi.searchArticles).not.toHaveBeenCalled();
  });

  it('retries when previous expand found no results', async () => {
    // First attempt: no results
    mockApi.searchArticles.mockResolvedValue({
      success: true,
      data: { articles: [] },
    });
    await store.expandEvent('c1', 'No Results');
    expect(store.getExpandedArticles('c1')).toBeUndefined();

    // Second attempt: results available now
    mockApi.searchArticles.mockResolvedValue({
      success: true,
      data: { articles: [{ article_id: 'a1', title: 'Found' }] },
    });
    await store.expandEvent('c1', 'No Results');
    expect(store.getExpandedArticles('c1')).toHaveLength(1);
  });

  it('falls back to 8-char query when 15-char returns empty', async () => {
    const title = '美國駐以色列領事官邸遭伊朗飛彈碎片擊中';
    mockApi.searchArticles
      .mockResolvedValueOnce({ success: true, data: { articles: [] } })  // 15-char: empty
      .mockResolvedValueOnce({ success: true, data: { articles: [{ article_id: 'fb1' }] } });  // 8-char: found

    await store.expandEvent('c1', title);

    expect(mockApi.searchArticles).toHaveBeenCalledTimes(2);
    expect(mockApi.searchArticles).toHaveBeenNthCalledWith(1, title.slice(0, 15));
    expect(mockApi.searchArticles).toHaveBeenNthCalledWith(2, title.slice(0, 8));
    expect(store.getExpandedArticles('c1')).toHaveLength(1);
  });

  it('sets expandingId during load', async () => {
    let resolveSearch;
    mockApi.searchArticles.mockReturnValue(
      new Promise((resolve) => { resolveSearch = resolve; })
    );

    const promise = store.expandEvent('c1', 'Event Title');
    expect(store.expandingId).toBe('c1');

    resolveSearch({ success: true, data: { articles: [{ article_id: 'x' }] } });
    await promise;

    expect(store.expandingId).toBeNull();
  });

  it('does not cache on search failure', async () => {
    mockApi.searchArticles.mockResolvedValue({
      success: false,
      error: { type: 'search_failed' },
    });

    await store.expandEvent('c1', 'Bad Title');

    // Not cached — undefined, not empty array
    expect(store.getExpandedArticles('c1')).toBeUndefined();
  });

  it('does not cache on search exception', async () => {
    mockApi.searchArticles.mockRejectedValue(new Error('Network'));

    await store.expandEvent('c1', 'Error Title');

    expect(store.getExpandedArticles('c1')).toBeUndefined();
    expect(store.expandingId).toBeNull();
  });

  it('handles data.items fallback in search results', async () => {
    mockApi.searchArticles.mockResolvedValue({
      success: true,
      data: { items: [{ article_id: 'i1', title: 'Item Fallback' }] },
    });

    await store.expandEvent('c1', 'Title');

    const articles = store.getExpandedArticles('c1');
    expect(articles).toHaveLength(1);
    expect(articles[0].article_id).toBe('i1');
  });
});

// ══════════════════════════════════════════════
// 5. collapseEvent
// ══════════════════════════════════════════════

describe('collapseEvent', () => {
  it('removes articles from expandedArticles', async () => {
    await store.expandEvent('c1', 'Short Title');
    expect(store.getExpandedArticles('c1')).toBeDefined();

    store.collapseEvent('c1');
    expect(store.getExpandedArticles('c1')).toBeUndefined();
  });

  it('does not throw for non-existent cluster id', () => {
    expect(() => store.collapseEvent('nonexistent')).not.toThrow();
  });
});

// ══════════════════════════════════════════════
// 6. getExpandedArticles
// ══════════════════════════════════════════════

describe('getExpandedArticles', () => {
  it('returns undefined for unexpanded cluster', () => {
    expect(store.getExpandedArticles('unknown')).toBeUndefined();
  });

  it('returns articles array for expanded cluster', async () => {
    await store.expandEvent('c1', 'Short');
    const result = store.getExpandedArticles('c1');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ══════════════════════════════════════════════
// 7. refreshEvents
// ══════════════════════════════════════════════

describe('refreshEvents', () => {
  it('re-fetches page 1', async () => {
    const twentyEvents = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `c${i}`, title: `Event ${i}`,
    }));
    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: twentyEvents },
    });

    await store.fetchEvents(1);
    await store.loadMore();
    mockApi.fetchEvents.mockClear();

    mockApi.fetchEvents.mockResolvedValue({
      success: true,
      data: { items: [{ cluster_id: 'r1', title: 'Refreshed' }] },
    });

    await store.refreshEvents();

    expect(mockApi.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });
});
