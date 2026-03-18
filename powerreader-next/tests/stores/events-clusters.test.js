/**
 * Unit tests for events.svelte.js — Cluster methods
 *
 * Tests cover: fetchClusters, loadMoreClusters, refreshClusters,
 *              cluster getters (clusters, clustersLoading, clustersError,
 *              clustersHasMore, unclusteredArticleIds)
 *
 * Strategy: Mock '$lib/core/api.js' and test the store interface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock api.js ──

const mockApi = {
  fetchEvents: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
  searchArticles: vi.fn().mockResolvedValue({ success: true, data: { articles: [] } }),
  fetchClusters: vi.fn().mockResolvedValue({
    success: true,
    data: {
      clusters: [
        { cluster_id: 'ec_1', representative_title: 'Cluster 1', article_count: 3, source_count: 2 },
        { cluster_id: 'ec_2', representative_title: 'Cluster 2', article_count: 5, source_count: 3 },
      ],
      unclustered_article_ids: ['a10', 'a11'],
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

  mockApi.fetchClusters.mockResolvedValue({
    success: true,
    data: {
      clusters: [
        { cluster_id: 'ec_1', representative_title: 'Cluster 1', article_count: 3, source_count: 2 },
        { cluster_id: 'ec_2', representative_title: 'Cluster 2', article_count: 5, source_count: 3 },
      ],
      unclustered_article_ids: ['a10', 'a11'],
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
// 1. Cluster store structure
// ══════════════════════════════════════════════

describe('getEventsStore — cluster getters', () => {
  it('has cluster-related getters', () => {
    expect(Array.isArray(store.clusters)).toBe(true);
    expect(typeof store.clustersLoading).toBe('boolean');
    expect(store.clustersError).toBeNull();
    expect(typeof store.clustersHasMore).toBe('boolean');
    expect(Array.isArray(store.unclusteredArticleIds)).toBe(true);
  });

  it('has cluster-related methods', () => {
    expect(typeof store.fetchClusters).toBe('function');
    expect(typeof store.loadMoreClusters).toBe('function');
    expect(typeof store.refreshClusters).toBe('function');
  });
});

// ══════════════════════════════════════════════
// 2. fetchClusters
// ══════════════════════════════════════════════

describe('fetchClusters', () => {
  it('sets clusters array on success', async () => {
    await store.fetchClusters();

    expect(store.clusters).toHaveLength(2);
    expect(store.clusters[0].cluster_id).toBe('ec_1');
    expect(store.clusters[1].cluster_id).toBe('ec_2');
  });

  it('sets unclusteredArticleIds on page 1', async () => {
    await store.fetchClusters(1);

    expect(store.unclusteredArticleIds).toEqual(['a10', 'a11']);
  });

  it('page 1 replaces clusters', async () => {
    await store.fetchClusters(1);
    expect(store.clusters).toHaveLength(2);

    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: {
        clusters: [{ cluster_id: 'ec_new', representative_title: 'New Cluster' }],
        unclustered_article_ids: [],
      },
    });

    await store.fetchClusters(1);
    expect(store.clusters).toHaveLength(1);
    expect(store.clusters[0].cluster_id).toBe('ec_new');
  });

  it('page 2+ appends clusters', async () => {
    await store.fetchClusters(1);
    expect(store.clusters).toHaveLength(2);

    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: {
        clusters: [{ cluster_id: 'ec_3', representative_title: 'Cluster 3' }],
      },
    });

    await store.fetchClusters(2);
    expect(store.clusters).toHaveLength(3);
    expect(store.clusters[2].cluster_id).toBe('ec_3');
  });

  it('sets error on API failure', async () => {
    mockApi.fetchClusters.mockResolvedValue({
      success: false,
      error: { type: 'fetch_failed' },
    });

    await store.fetchClusters();
    expect(store.clustersError).toBe('fetch_failed');
  });

  it('sets clustersHasMore=false when fewer than 20 results', async () => {
    await store.fetchClusters();
    expect(store.clustersHasMore).toBe(false);
  });

  it('sets clustersHasMore=true when 20+ results', async () => {
    const twentyClusters = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `ec_${i}`, representative_title: `Cluster ${i}`,
    }));
    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: twentyClusters, unclustered_article_ids: [] },
    });

    await store.fetchClusters();
    expect(store.clustersHasMore).toBe(true);
  });

  it('passes category to API', async () => {
    await store.fetchClusters(1, '政治');

    expect(mockApi.fetchClusters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, category: '政治' }),
    );
  });

  it('handles exception during fetch', async () => {
    mockApi.fetchClusters.mockRejectedValue(new Error('Network error'));

    await store.fetchClusters();
    expect(store.clustersError).toBe('Network error');
    expect(store.clustersLoading).toBe(false);
  });

  it('sets loading state during fetch', async () => {
    let resolveApi;
    mockApi.fetchClusters.mockReturnValue(
      new Promise((resolve) => { resolveApi = resolve; })
    );

    const promise = store.fetchClusters();
    expect(store.clustersLoading).toBe(true);

    resolveApi({
      success: true,
      data: { clusters: [], unclustered_article_ids: [] },
    });
    await promise;

    expect(store.clustersLoading).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 3. loadMoreClusters
// ══════════════════════════════════════════════

describe('loadMoreClusters', () => {
  it('increments page and fetches next page', async () => {
    const twentyClusters = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `ec_${i}`, representative_title: `Cluster ${i}`,
    }));
    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: twentyClusters, unclustered_article_ids: [] },
    });

    await store.fetchClusters(1);
    mockApi.fetchClusters.mockClear();

    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: [{ cluster_id: 'ec_more' }] },
    });

    await store.loadMoreClusters();
    expect(mockApi.fetchClusters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('does not fetch when clustersHasMore is false', async () => {
    await store.fetchClusters(1);
    expect(store.clustersHasMore).toBe(false);

    mockApi.fetchClusters.mockClear();
    await store.loadMoreClusters();
    expect(mockApi.fetchClusters).not.toHaveBeenCalled();
  });

  it('passes category parameter', async () => {
    const twentyClusters = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `ec_${i}`, representative_title: `Cluster ${i}`,
    }));
    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: twentyClusters, unclustered_article_ids: [] },
    });

    await store.fetchClusters(1, '政治');
    mockApi.fetchClusters.mockClear();

    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: [] },
    });

    await store.loadMoreClusters('政治');
    expect(mockApi.fetchClusters).toHaveBeenCalledWith(
      expect.objectContaining({ category: '政治' }),
    );
  });
});

// ══════════════════════════════════════════════
// 4. refreshClusters
// ══════════════════════════════════════════════

describe('refreshClusters', () => {
  it('re-fetches page 1', async () => {
    const twentyClusters = Array.from({ length: 20 }, (_, i) => ({
      cluster_id: `ec_${i}`, representative_title: `Cluster ${i}`,
    }));
    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: { clusters: twentyClusters, unclustered_article_ids: [] },
    });

    await store.fetchClusters(1);
    await store.loadMoreClusters();
    mockApi.fetchClusters.mockClear();

    mockApi.fetchClusters.mockResolvedValue({
      success: true,
      data: {
        clusters: [{ cluster_id: 'ec_refreshed', representative_title: 'Refreshed' }],
        unclustered_article_ids: [],
      },
    });

    await store.refreshClusters();

    expect(mockApi.fetchClusters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it('passes category filter on refresh', async () => {
    await store.refreshClusters('國際');

    expect(mockApi.fetchClusters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, category: '國際' }),
    );
  });
});
