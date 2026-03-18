/**
 * Unit tests for api.js — Clusters API functions
 *
 * Tests cover: fetchClusters, fetchClusterDetail
 *
 * Strategy: Mock db.js (IndexedDB) and global fetch, test offline/online paths.
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

  mockCachedStore = createMockStore();
  mockDB = createMockDB({
    articles: createMockStore(),
    cached_responses: mockCachedStore,
  });

  vi.mock('../../src/lib/core/db.js', () => ({
    openDB: vi.fn(() => Promise.resolve(mockDB)),
  }));

  // Default: online
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

  // Default: successful fetch
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      success: true,
      data: {
        clusters: [{ cluster_id: 'ec_1', representative_title: 'Test Cluster' }],
        unclustered_article_ids: ['a1'],
        pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
      },
    }),
  });

  apiModule = await loadModule();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// 1. fetchClusters
// ══════════════════════════════════════════════

describe('fetchClusters', () => {
  it('calls API with default params', async () => {
    const result = await apiModule.fetchClusters();

    expect(result.success).toBe(true);
    expect(result.data.clusters).toHaveLength(1);
    expect(result.data.clusters[0].cluster_id).toBe('ec_1');
    expect(globalThis.fetch).toHaveBeenCalled();
    const fetchUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/clusters');
    expect(fetchUrl).toContain('page=1');
    expect(fetchUrl).toContain('limit=20');
  });

  it('passes category parameter to API', async () => {
    await apiModule.fetchClusters({ page: 1, limit: 10, category: '政治' });

    const fetchUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('category=');
  });

  it('excludes category when value is "all"', async () => {
    await apiModule.fetchClusters({ category: 'all' });

    const fetchUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchUrl).not.toContain('category=all');
  });

  it('returns offline error when navigator is offline and no cache', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.fetchClusters();

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles API error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ success: false, error: { type: 'server_error' } }),
    });

    const result = await apiModule.fetchClusters();

    expect(result.success).toBe(false);
  });

  it('handles network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await apiModule.fetchClusters();

    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 2. fetchClusterDetail
// ══════════════════════════════════════════════

describe('fetchClusterDetail', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: {
          cluster: {
            cluster_id: 'ec_abc',
            representative_title: 'Detail Cluster',
            article_count: 3,
          },
          articles: [
            { article_id: 'a1', title: 'Article 1' },
            { article_id: 'a2', title: 'Article 2' },
          ],
        },
      }),
    });
  });

  it('fetches cluster detail by ID', async () => {
    const result = await apiModule.fetchClusterDetail('ec_abc');

    expect(result.success).toBe(true);
    expect(result.data.cluster.cluster_id).toBe('ec_abc');
    expect(result.data.articles).toHaveLength(2);

    const fetchUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/clusters/ec_abc');
  });

  it('encodes cluster ID in URL', async () => {
    await apiModule.fetchClusterDetail('ec_special/chars');

    const fetchUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('/clusters/ec_special%2Fchars');
  });

  it('returns offline error when navigator is offline and no cache', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await apiModule.fetchClusterDetail('ec_abc');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('offline');
  });

  it('handles 404 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({
        success: false,
        error: { type: 'not_found', message: 'Cluster not found' },
      }),
    });

    const result = await apiModule.fetchClusterDetail('ec_nonexistent');

    expect(result.success).toBe(false);
  });

  it('handles network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await apiModule.fetchClusterDetail('ec_abc');

    expect(result.success).toBe(false);
  });
});
