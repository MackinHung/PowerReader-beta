/**
 * Unit tests for manager.js (Model Download Manager)
 *
 * Tests cover: checkWifi, checkBattery, checkStorage, runPreDownloadChecks,
 *              getDownloadProgress, downloadModel, pauseDownload, deleteModel,
 *              isModelDownloaded
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helper: create a mock transaction that auto-resolves oncomplete ──

function createMockTx(storeMethods = {}) {
  const store = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    ...storeMethods,
  };
  const tx = {
    objectStore: vi.fn(() => store),
    oncomplete: null,
    onerror: null,
  };
  // Auto-fire oncomplete on next microtask
  const origObjectStore = tx.objectStore;
  tx.objectStore = vi.fn((...args) => {
    Promise.resolve().then(() => {
      if (tx.oncomplete) tx.oncomplete();
    });
    return origObjectStore(...args);
  });
  return { tx, store };
}

function createMockDB(storeMethods = {}) {
  const { tx, store } = createMockTx(storeMethods);
  return {
    db: {
      transaction: vi.fn(() => tx),
      close: vi.fn(),
    },
    tx,
    store,
  };
}

// ── Module-level reset helpers ──

let mod;
let savedStorage;

beforeEach(async () => {
  vi.resetModules();

  vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
    t: vi.fn((key) => key),
  }));

  mod = await import('../../src/lib/core/manager.js');

  // Save original navigator.storage
  savedStorage = navigator.storage;
});

afterEach(() => {
  vi.restoreAllMocks();

  // Restore navigator properties
  Object.defineProperty(navigator, 'storage', {
    value: savedStorage,
    configurable: true,
    writable: true,
  });

  if ('connection' in navigator) {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
});

// ══════════════════════════════════════════════
// 1. checkWifi
// ══════════════════════════════════════════════

describe('checkWifi', () => {
  it('returns ok=true when navigator.connection is not available', () => {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'mozConnection', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'webkitConnection', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = mod.checkWifi();
    expect(result).toEqual({ ok: true });
  });

  it('returns ok=true when connection.type is wifi', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi' },
      configurable: true,
      writable: true,
    });

    const result = mod.checkWifi();
    expect(result.ok).toBe(true);
  });

  it('returns ok=true when connection.type is ethernet', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'ethernet' },
      configurable: true,
      writable: true,
    });

    const result = mod.checkWifi();
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with reason when connection.type is cellular', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular' },
      configurable: true,
      writable: true,
    });

    const result = mod.checkWifi();
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns ok=false with reason when connection.type is unknown non-wifi type', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'bluetooth' },
      configurable: true,
      writable: true,
    });

    const result = mod.checkWifi();
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ══════════════════════════════════════════════
// 2. checkBattery
// ══════════════════════════════════════════════

describe('checkBattery', () => {
  it('returns ok=true when navigator.getBattery is not available', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result).toEqual({ ok: true });
  });

  it('returns ok=true when battery is charging', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: true, level: 0.1 }),
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result.ok).toBe(true);
  });

  it('returns ok=true when battery level >= 20% and not charging', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: false, level: 0.5 }),
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result.ok).toBe(true);
  });

  it('returns ok=true when battery level is exactly 20% and not charging', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: false, level: 0.2 }),
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with reason when battery level < 20% and not charging', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: false, level: 0.1 }),
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns ok=true when getBattery throws', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockRejectedValue(new Error('Not supported')),
      configurable: true,
      writable: true,
    });

    const result = await mod.checkBattery();
    expect(result).toEqual({ ok: true });
  });
});

// ══════════════════════════════════════════════
// 3. checkStorage
// ══════════════════════════════════════════════

describe('checkStorage', () => {
  it('returns ok=true when navigator.storage.estimate is not available', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await mod.checkStorage();
    expect(result).toEqual({ ok: true });
  });

  it('returns ok=true with availableMB when enough storage (>= 4000MB)', async () => {
    const availableBytes = 5000 * 1024 * 1024;
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({
          quota: availableBytes + 1000 * 1024 * 1024,
          usage: 1000 * 1024 * 1024,
        }),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.checkStorage();
    expect(result.ok).toBe(true);
    expect(result.availableMB).toBe(5000);
  });

  it('returns ok=false with reason and availableMB when not enough storage', async () => {
    const quota = 3000 * 1024 * 1024;
    const usage = 0;
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({ quota, usage }),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.checkStorage();
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.availableMB).toBe(3000);
  });

  it('returns ok=true when estimate throws', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockRejectedValue(new Error('estimate failed')),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.checkStorage();
    expect(result).toEqual({ ok: true });
  });
});

// ══════════════════════════════════════════════
// 4. runPreDownloadChecks
// ══════════════════════════════════════════════

describe('runPreDownloadChecks', () => {
  it('returns canDownload=true when all checks pass', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi' },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: true, level: 1 }),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({
          quota: 10000 * 1024 * 1024,
          usage: 0,
        }),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.runPreDownloadChecks();
    expect(result.canDownload).toBe(true);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it('returns canDownload=false when wifi check fails', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular' },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: true, level: 1 }),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({
          quota: 10000 * 1024 * 1024,
          usage: 0,
        }),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.runPreDownloadChecks();
    expect(result.canDownload).toBe(false);
    const wifiCheck = result.checks.find((c) => c.name === 'wifi');
    expect(wifiCheck.ok).toBe(false);
  });

  it('returns canDownload=false when battery check fails', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue({ charging: false, level: 0.05 }),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: vi.fn().mockResolvedValue({
          quota: 10000 * 1024 * 1024,
          usage: 0,
        }),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.runPreDownloadChecks();
    expect(result.canDownload).toBe(false);
    const batteryCheck = result.checks.find((c) => c.name === 'battery');
    expect(batteryCheck.ok).toBe(false);
  });
});

// ══════════════════════════════════════════════
// 5. getDownloadProgress
// ══════════════════════════════════════════════

describe('getDownloadProgress', () => {
  it('returns 0 initially', () => {
    expect(mod.getDownloadProgress()).toBe(0);
  });
});

// ══════════════════════════════════════════════
// 6. downloadModel
// ══════════════════════════════════════════════

describe('downloadModel', () => {
  it('throws when modelUrl is not provided', async () => {
    await expect(mod.downloadModel(null)).rejects.toThrow(
      'Model URL not provided'
    );
    await expect(mod.downloadModel('')).rejects.toThrow(
      'Model URL not provided'
    );
    await expect(mod.downloadModel(undefined)).rejects.toThrow(
      'Model URL not provided'
    );
  });

  it('returns true on successful download', async () => {
    vi.resetModules();

    // Set up db.js mock BEFORE importing manager.js
    const { db: mockDB } = createMockDB();
    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
      t: vi.fn((key) => key),
    }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue(mockDB),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    // Mock OPFS storage for storeModelData
    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };
    const mockRoot = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
      },
      configurable: true,
      writable: true,
    });

    // Create a readable stream with one chunk then done
    const chunk = new Uint8Array([1, 2, 3, 4]);
    let readCount = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount === 0) {
          readCount++;
          return Promise.resolve({ done: false, value: chunk });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      cancel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
    });

    const onProgress = vi.fn();
    const result = await freshMod.downloadModel(
      'https://example.com/model.bin',
      onProgress
    );

    expect(result).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/model.bin',
      expect.objectContaining({
        headers: {},
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('throws when fetch returns non-ok status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      mod.downloadModel('https://example.com/model.bin')
    ).rejects.toThrow('Download failed: HTTP 500');
  });

  it('returns false when download is paused (AbortError)', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await mod.downloadModel('https://example.com/model.bin');
    expect(result).toBe(false);
  });

  it('calls onProgress with correct values during download', async () => {
    vi.resetModules();

    const { db: mockDB } = createMockDB();
    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
      t: vi.fn((key) => key),
    }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue(mockDB),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    const mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };
    const mockRoot = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
      },
      configurable: true,
      writable: true,
    });

    const chunk1 = new Uint8Array(100);
    const chunk2 = new Uint8Array(200);
    let readCount = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount === 0) {
          readCount++;
          return Promise.resolve({ done: false, value: chunk1 });
        }
        if (readCount === 1) {
          readCount++;
          return Promise.resolve({ done: false, value: chunk2 });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      cancel: vi.fn(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
    });

    const onProgress = vi.fn();
    await freshMod.downloadModel('https://example.com/model.bin', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    const MODEL_SIZE_BYTES = 3400 * 1024 * 1024;
    expect(onProgress).toHaveBeenNthCalledWith(1, 100, MODEL_SIZE_BYTES);
    expect(onProgress).toHaveBeenNthCalledWith(2, 300, MODEL_SIZE_BYTES);
  });
});

// ══════════════════════════════════════════════
// 7. pauseDownload
// ══════════════════════════════════════════════

describe('pauseDownload', () => {
  it('does not throw when no download is in progress', () => {
    expect(() => mod.pauseDownload()).not.toThrow();
  });
});

// ══════════════════════════════════════════════
// 8. deleteModel
// ══════════════════════════════════════════════

describe('deleteModel', () => {
  it('calls OPFS removeEntry and resets downloadedBytes', async () => {
    vi.resetModules();

    const { db: mockDB } = createMockDB();
    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
      t: vi.fn((key) => key),
    }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue(mockDB),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    const mockRoot = {
      removeEntry: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
      },
      configurable: true,
      writable: true,
    });

    await freshMod.deleteModel();

    expect(mockRoot.removeEntry).toHaveBeenCalledWith('qwen-4b.bin');
    expect(freshMod.getDownloadProgress()).toBe(0);
  });

  it('does not throw when OPFS removeEntry fails', async () => {
    vi.resetModules();

    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({
      t: vi.fn((key) => key),
    }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockRejectedValue(new Error('DB failed')),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi
          .fn()
          .mockRejectedValue(new Error('OPFS not supported')),
      },
      configurable: true,
      writable: true,
    });

    // Should not throw
    await expect(freshMod.deleteModel()).resolves.not.toThrow();
  });
});

// ══════════════════════════════════════════════
// 9. isModelDownloaded
// ══════════════════════════════════════════════

describe('isModelDownloaded', () => {
  it('returns true when OPFS file exists with size > 0', async () => {
    const mockFile = { size: 1000 };
    const mockFileHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    };
    const mockRoot = {
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    };
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
      },
      configurable: true,
      writable: true,
    });

    const result = await mod.isModelDownloaded();
    expect(result).toBe(true);

    expect(mockRoot.getFileHandle).toHaveBeenCalledWith('qwen-4b.bin', {
      create: false,
    });
  });

  it('returns false when OPFS fails and IndexedDB returns null record', async () => {
    vi.resetModules();

    // Mock db.js to return a record with null result
    const mockReq = { result: null, onsuccess: null, onerror: null };
    const mockStore = {
      get: vi.fn(() => {
        Promise.resolve().then(() => mockReq.onsuccess?.());
        return mockReq;
      }),
    };

    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({ t: vi.fn((key) => key) }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue({
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => mockStore),
        })),
        close: vi.fn(),
      }),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockRejectedValue(new Error('Not found')),
      },
      configurable: true,
      writable: true,
    });

    const result = await freshMod.isModelDownloaded();
    // null && null.complete === true => null, which is falsy but not strictly false
    // The code: `return result && result.complete === true;`
    // null && ... => null. So we check falsy.
    expect(result).toBeFalsy();
  });

  it('returns true when OPFS fails but IndexedDB has complete record', async () => {
    vi.resetModules();

    const mockReq = {
      result: { complete: true },
      onsuccess: null,
      onerror: null,
    };
    const mockStore = {
      get: vi.fn(() => {
        Promise.resolve().then(() => mockReq.onsuccess?.());
        return mockReq;
      }),
    };

    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({ t: vi.fn((key) => key) }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockResolvedValue({
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => mockStore),
        })),
        close: vi.fn(),
      }),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockRejectedValue(new Error('Not found')),
      },
      configurable: true,
      writable: true,
    });

    const result = await freshMod.isModelDownloaded();
    expect(result).toBe(true);
  });

  it('returns false when both OPFS and IndexedDB fail', async () => {
    vi.resetModules();

    vi.doMock('../../src/lib/i18n/zh-TW.js', () => ({ t: vi.fn((key) => key) }));
    vi.doMock('../../src/lib/core/db.js', () => ({
      openDB: vi.fn().mockRejectedValue(new Error('DB fail')),
    }));

    const freshMod = await import('../../src/lib/core/manager.js');

    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockRejectedValue(new Error('fail')),
      },
      configurable: true,
      writable: true,
    });

    const result = await freshMod.isModelDownloaded();
    expect(result).toBe(false);
  });
});
