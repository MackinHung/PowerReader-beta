/**
 * Unit tests for offline-queue.js (Background Sync Queue)
 *
 * Tests cover: enqueuePendingSync, getPendingSyncCount,
 *              processPendingSync, clearPendingSync
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -- Fake IDB store (in-memory) --

function createFakeIDBStore() {
  let autoId = 0;
  const records = new Map();

  const store = {
    _records: records,
    put(item) {
      const id = item.id ?? ++autoId;
      const record = { ...item, id };
      records.set(id, record);
      return { _result: id };
    },
    add(item) {
      const id = ++autoId;
      const record = { ...item, id };
      records.set(id, record);
      return { _result: id };
    },
    get(key) {
      return { _result: records.get(key) };
    },
    delete(key) {
      records.delete(key);
      return { _result: undefined };
    },
    clear() {
      records.clear();
      return { _result: undefined };
    },
    count() {
      return { _result: records.size };
    },
    getAll() {
      return { _result: Array.from(records.values()) };
    },
    getAllKeys() {
      return { _result: Array.from(records.keys()) };
    },
  };
  return store;
}

// -- Module-level vars --

let mod;
let fakeStore;
let mockOpenDB;
let mockPromisifyRequest;
let mockPromisifyTransaction;
let mockSyncRegister;
let savedSW;

const MOCK_API_BASE = 'https://powerreader-api.watermelom5404.workers.dev/api/v1';

beforeEach(async () => {
  vi.resetModules();

  fakeStore = createFakeIDBStore();

  // Build a fake DB that returns transactions backed by fakeStore
  const fakeDB = {
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => fakeStore),
      oncomplete: null,
      onerror: null,
    })),
    close: vi.fn(),
  };

  mockOpenDB = vi.fn(() => Promise.resolve(fakeDB));

  // promisifyRequest returns the _result from our fake request objects
  mockPromisifyRequest = vi.fn((req) => Promise.resolve(req._result));
  // promisifyTransaction just resolves
  mockPromisifyTransaction = vi.fn(() => Promise.resolve());

  vi.doMock('../../src/lib/core/db.js', () => ({
    openDB: mockOpenDB,
  }));

  vi.doMock('../../src/lib/utils/idb-helpers.js', () => ({
    promisifyRequest: mockPromisifyRequest,
    promisifyTransaction: mockPromisifyTransaction,
  }));

  vi.doMock('../../src/lib/core/api.js', () => ({
    API_BASE: MOCK_API_BASE,
  }));

  // Mock navigator.serviceWorker
  mockSyncRegister = vi.fn(() => Promise.resolve());
  savedSW = navigator.serviceWorker;

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        sync: { register: mockSyncRegister },
      }),
    },
    configurable: true,
    writable: true,
  });

  // Mock fetch
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  );

  mod = await import('../../src/lib/core/offline-queue.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'serviceWorker', {
    value: savedSW,
    configurable: true,
    writable: true,
  });
  delete globalThis.fetch;
});

// ====================================================
// 1. enqueuePendingSync
// ====================================================

describe('enqueuePendingSync', () => {
  it('writes to IDB pending_sync store via openDB', async () => {
    await mod.enqueuePendingSync('feedback', { articleId: 'abc', feedbackType: 'agree' });

    expect(mockOpenDB).toHaveBeenCalled();
    const db = await mockOpenDB.mock.results[0].value;
    expect(db.transaction).toHaveBeenCalledWith('pending_sync', 'readwrite');
  });

  it('stores type, payload, and created_at fields', async () => {
    await mod.enqueuePendingSync('feedback', { articleId: 'abc', feedbackType: 'agree' });

    const records = Array.from(fakeStore._records.values());
    expect(records.length).toBeGreaterThanOrEqual(1);
    const item = records[0];
    expect(item).toHaveProperty('type', 'feedback');
    expect(item).toHaveProperty('payload');
    expect(item.payload).toEqual({ articleId: 'abc', feedbackType: 'agree' });
    expect(item).toHaveProperty('created_at');
    expect(typeof item.created_at).toBe('string');
  });

  it('registers SW sync tag "pending-sync" when SW available', async () => {
    await mod.enqueuePendingSync('analysis', { articleId: 'x', data: {} });

    expect(mockSyncRegister).toHaveBeenCalledWith('pending-sync');
  });

  it('works without SW (no crash)', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await expect(
      mod.enqueuePendingSync('feedback', { articleId: 'a', feedbackType: 'disagree' })
    ).resolves.toBeUndefined();
  });

  it('handles type: feedback', async () => {
    await mod.enqueuePendingSync('feedback', { articleId: 'f1', feedbackType: 'agree' });

    const records = Array.from(fakeStore._records.values());
    const feedbackItems = records.filter((r) => r.type === 'feedback');
    expect(feedbackItems.length).toBe(1);
  });

  it('handles type: analysis', async () => {
    await mod.enqueuePendingSync('analysis', { articleId: 'a1', data: { bias_score: 0.7 } });

    const records = Array.from(fakeStore._records.values());
    const analysisItems = records.filter((r) => r.type === 'analysis');
    expect(analysisItems.length).toBe(1);
  });
});

// ====================================================
// 2. getPendingSyncCount
// ====================================================

describe('getPendingSyncCount', () => {
  it('returns 0 for empty store', async () => {
    const count = await mod.getPendingSyncCount();
    expect(count).toBe(0);
  });

  it('returns correct count after enqueue', async () => {
    // Pre-populate the store
    fakeStore.add({ type: 'feedback', payload: {}, created_at: new Date().toISOString() });
    fakeStore.add({ type: 'analysis', payload: {}, created_at: new Date().toISOString() });

    const count = await mod.getPendingSyncCount();
    expect(count).toBe(2);
  });
});

// ====================================================
// 3. processPendingSync
// ====================================================

describe('processPendingSync', () => {
  it('returns {synced:0, failed:0} for empty queue', async () => {
    const result = await mod.processPendingSync();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it('sends feedback items via fetch to correct URL', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'art1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });

    await mod.processPendingSync();

    expect(globalThis.fetch).toHaveBeenCalled();
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('feedback');
    expect(url).toContain('art1');
  });

  it('sends analysis items via fetch to correct URL', async () => {
    fakeStore.add({
      type: 'analysis',
      payload: { articleId: 'art2', data: { bias_score: 0.5 } },
      created_at: new Date().toISOString(),
    });

    await mod.processPendingSync();

    expect(globalThis.fetch).toHaveBeenCalled();
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('analysis');
    expect(url).toContain('art2');
  });

  it('deletes items on successful sync', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });
    expect(fakeStore._records.size).toBe(1);

    await mod.processPendingSync();

    // After successful sync, items should be removed
    expect(fakeStore._records.size).toBe(0);
  });

  it('keeps items on fetch failure', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 })
    );

    await mod.processPendingSync();

    // Failed items should remain in store
    expect(fakeStore._records.size).toBe(1);
  });

  it('returns correct synced/failed counts', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a2', feedbackType: 'disagree' },
      created_at: new Date().toISOString(),
    });

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    const result = await mod.processPendingSync();
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('handles network error gracefully', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });

    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Network error')));

    const result = await mod.processPendingSync();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(fakeStore._records.size).toBe(1);
  });

  it('handles mixed success/failure', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: new Date().toISOString(),
    });
    fakeStore.add({
      type: 'analysis',
      payload: { articleId: 'a2', data: { bias: 0.5 } },
      created_at: new Date().toISOString(),
    });

    let callCount = 0;
    globalThis.fetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await mod.processPendingSync();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('multiple items enqueued maintain order', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree' },
      created_at: '2026-03-17T01:00:00Z',
    });
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a2', feedbackType: 'disagree' },
      created_at: '2026-03-17T02:00:00Z',
    });
    fakeStore.add({
      type: 'analysis',
      payload: { articleId: 'a3', data: { score: 3 } },
      created_at: '2026-03-17T03:00:00Z',
    });

    const urls = [];
    globalThis.fetch = vi.fn((url) => {
      urls.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await mod.processPendingSync();

    // Should process in insertion order
    expect(urls.length).toBe(3);
    expect(urls[0]).toContain('a1');
    expect(urls[1]).toContain('a2');
    expect(urls[2]).toContain('a3');
  });

  it('includes Authorization header when token present in payload', async () => {
    fakeStore.add({
      type: 'feedback',
      payload: { articleId: 'a1', feedbackType: 'agree', token: 'my-token-123' },
      created_at: new Date().toISOString(),
    });

    await mod.processPendingSync();

    expect(globalThis.fetch).toHaveBeenCalled();
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer my-token-123');
  });
});

// ====================================================
// 4. clearPendingSync
// ====================================================

describe('clearPendingSync', () => {
  it('empties the store', async () => {
    fakeStore.add({ type: 'feedback', payload: { articleId: 'a1', feedbackType: 'agree' }, created_at: new Date().toISOString() });
    fakeStore.add({ type: 'analysis', payload: { articleId: 'a2', data: {} }, created_at: new Date().toISOString() });
    expect(fakeStore._records.size).toBe(2);

    await mod.clearPendingSync();

    expect(fakeStore._records.size).toBe(0);
  });

  it('on empty store does not crash', async () => {
    expect(fakeStore._records.size).toBe(0);

    await expect(mod.clearPendingSync()).resolves.toBeUndefined();
  });
});
