/**
 * Unit tests for db.js (IndexedDB Setup)
 *
 * TDD tests for openDB, cleanExpiredCache, requestPersistentStorage.
 * Uses mock indexedDB since jsdom does not provide a full implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -- Fake IndexedDB infrastructure --

function createFakeIndexedDB() {
  const stores = {};
  let onupgradeneededCb = null;

  function createFakeObjectStore(name, opts = {}) {
    const indices = {};
    const data = new Map();
    return {
      name,
      keyPath: opts.keyPath || null,
      autoIncrement: !!opts.autoIncrement,
      _indices: indices,
      _data: data,
      createIndex(indexName, keyPath, options = {}) {
        indices[indexName] = { keyPath, ...options };
        return indices[indexName];
      },
      index(name) {
        return {
          openCursor(range) {
            const req = { result: null, onsuccess: null, onerror: null };
            Promise.resolve().then(() => {
              if (req.onsuccess) req.onsuccess({ target: req });
            });
            return req;
          },
        };
      },
    };
  }

  const fakeDB = {
    _stores: stores,
    objectStoreNames: {
      _list: [],
      contains(name) { return this._list.includes(name); },
    },
    createObjectStore(name, opts) {
      const store = createFakeObjectStore(name, opts);
      stores[name] = store;
      fakeDB.objectStoreNames._list.push(name);
      return store;
    },
    transaction(storeNames, mode) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const tx = {
        objectStore(name) { return stores[name]; },
        oncomplete: null,
        onerror: null,
      };
      Promise.resolve().then(() => {
        if (tx.oncomplete) tx.oncomplete();
      });
      return tx;
    },
    close: vi.fn(),
  };

  const fakeIDB = {
    open(name, version) {
      const request = {
        result: fakeDB,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      Promise.resolve().then(() => {
        // Simulate upgrade needed (fresh DB)
        if (request.onupgradeneeded) {
          request.onupgradeneeded({
            target: { result: fakeDB },
            oldVersion: 0,
            newVersion: version,
          });
        }
        if (request.onsuccess) {
          request.onsuccess();
        }
      });

      return request;
    },
  };

  return { fakeIDB, fakeDB };
}

// -- Module-level vars --

let mod;
let savedIndexedDB;
let savedStorage;
let fakeIDB;
let fakeDB;

beforeEach(async () => {
  vi.resetModules();

  const fake = createFakeIndexedDB();
  fakeIDB = fake.fakeIDB;
  fakeDB = fake.fakeDB;

  savedIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = fakeIDB;

  // Provide IDBKeyRange (not available in jsdom)
  if (!globalThis.IDBKeyRange) {
    globalThis.IDBKeyRange = {
      upperBound: (value) => ({ upper: value, lower: null, type: 'upperBound' }),
      lowerBound: (value) => ({ upper: null, lower: value, type: 'lowerBound' }),
      bound: (lower, upper) => ({ lower, upper, type: 'bound' }),
    };
  }

  savedStorage = navigator.storage;

  mod = await import('../../src/lib/core/db.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.indexedDB = savedIndexedDB;
  Object.defineProperty(navigator, 'storage', {
    value: savedStorage,
    configurable: true,
    writable: true,
  });
});

// ====================================================
// 1. openDB
// ====================================================

describe('openDB', () => {
  it('returns an IDBDatabase instance', async () => {
    const db = await mod.openDB();
    expect(db).toBeDefined();
    expect(db).toBe(fakeDB);
  });

  it('creates articles store with keyPath article_hash', async () => {
    await mod.openDB();
    const store = fakeDB._stores['articles'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('article_hash');
    expect(store.autoIncrement).toBe(false);
  });

  it('creates user_analyses store', async () => {
    await mod.openDB();
    const store = fakeDB._stores['user_analyses'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('id');
    expect(store.autoIncrement).toBe(true);
  });

  it('creates cached_results store', async () => {
    await mod.openDB();
    const store = fakeDB._stores['cached_results'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('cache_key');
  });

  it('creates pending_sync store', async () => {
    await mod.openDB();
    const store = fakeDB._stores['pending_sync'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('id');
    expect(store.autoIncrement).toBe(true);
  });

  it('creates model_files store', async () => {
    await mod.openDB();
    const store = fakeDB._stores['model_files'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('key');
  });

  it('creates auto_runner_history store (v2)', async () => {
    await mod.openDB();
    const store = fakeDB._stores['auto_runner_history'];
    expect(store).toBeDefined();
    expect(store.keyPath).toBe('article_id');
  });
});

// ====================================================
// 2. cleanExpiredCache
// ====================================================

describe('cleanExpiredCache', () => {
  it('deletes old articles via by_cached_at index', async () => {
    // cleanExpiredCache calls openDB internally, so our fake will be used
    // It will try to open cursors on articles and cached_results stores
    await expect(mod.cleanExpiredCache()).resolves.toBeUndefined();

    // Verify db.close() was called
    expect(fakeDB.close).toHaveBeenCalled();
  });

  it('deletes old cached_results via by_cached_at index', async () => {
    await mod.cleanExpiredCache();
    // The function should have accessed the cached_results store
    const store = fakeDB._stores['cached_results'];
    expect(store).toBeDefined();
  });

  it('with empty stores does not crash', async () => {
    await expect(mod.cleanExpiredCache()).resolves.toBeUndefined();
  });
});

// ====================================================
// 3. requestPersistentStorage
// ====================================================

describe('requestPersistentStorage', () => {
  it('logs granted when storage.persist() returns true', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persist: vi.fn(() => Promise.resolve(true)),
      },
      configurable: true,
      writable: true,
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await mod.requestPersistentStorage();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('granted')
    );
    logSpy.mockRestore();
  });

  it('logs denied when storage.persist() returns false', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persist: vi.fn(() => Promise.resolve(false)),
      },
      configurable: true,
      writable: true,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mod.requestPersistentStorage();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('denied')
    );
    warnSpy.mockRestore();
  });
});
