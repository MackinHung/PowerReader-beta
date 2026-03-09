/**
 * Unit tests for benchmark.js
 *
 * Tests cover: scanGPU, runBenchmark, getCachedBenchmark,
 *              clearBenchmark, getTimeoutForTier
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanGPU,
  runBenchmark,
  getCachedBenchmark,
  clearBenchmark,
  getTimeoutForTier,
} from '../../src/js/model/benchmark.js';

// ── Constants (mirrored from source for assertions) ──

const LS_BENCHMARK_RESULT = 'pr_benchmark_result';
const LS_WEBGPU_AVAILABLE = 'pr_webgpu_available';

// ── Helper: build a mock GPU adapter ──

/**
 * Create mock adapter using adapter.info property (modern Chrome 121+).
 * @param {Object} overrides
 * @param {boolean} [overrides.useLegacyAPI] - If true, use requestAdapterInfo() instead of .info
 */
function createMockAdapter(overrides = {}) {
  const infoObj = {
    vendor: overrides.vendor ?? 'nvidia',
    architecture: overrides.architecture ?? 'ampere',
    device: overrides.device ?? 'RTX 3060',
    description: overrides.description ?? '',
  };

  const adapter = {
    limits: {
      maxBufferSize: overrides.maxBufferSize ?? (6 * 1024 * 1024 * 1024), // 6 GB
    },
  };

  if (overrides.useLegacyAPI) {
    // Legacy: only requestAdapterInfo() method, no .info property
    adapter.requestAdapterInfo = vi.fn().mockResolvedValue(infoObj);
  } else {
    // Modern: .info sync property (Chrome 121+)
    adapter.info = infoObj;
  }

  return adapter;
}

// ── Setup / Teardown ──

beforeEach(() => {
  localStorage.clear();
  // Remove navigator.gpu if it exists from a previous test
  delete globalThis.navigator.gpu;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.navigator.gpu;
});

// ══════════════════════════════════════════════
// 1. scanGPU
// ══════════════════════════════════════════════

describe('scanGPU', () => {
  it('returns fallback when navigator.gpu does not exist', async () => {
    delete globalThis.navigator.gpu;

    const result = await scanGPU();

    expect(result).toEqual({
      supported: false,
      vendor: '',
      architecture: '',
      device: '',
      estimatedVRAM_MB: 0,
    });
    // cacheWebGPUFlag(false)
    expect(JSON.parse(localStorage.getItem(LS_WEBGPU_AVAILABLE))).toBe(false);
  });

  it('returns fallback when requestAdapter returns null', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(null),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(false);
    expect(JSON.parse(localStorage.getItem(LS_WEBGPU_AVAILABLE))).toBe(false);
  });

  it('returns supported info with correct fields from a valid adapter', async () => {
    const adapter = createMockAdapter({
      vendor: 'intel',
      architecture: 'xe',
      device: 'Arc A770',
      maxBufferSize: 8 * 1024 * 1024 * 1024, // 8 GB
    });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('intel');
    expect(result.architecture).toBe('xe');
    expect(result.device).toBe('Arc A770');
    expect(result.estimatedVRAM_MB).toBe(8192);
    expect(JSON.parse(localStorage.getItem(LS_WEBGPU_AVAILABLE))).toBe(true);
  });

  it('falls back to info.description when info.device is empty', async () => {
    const adapter = createMockAdapter({ device: '', description: 'Fallback Device' });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.device).toBe('Fallback Device');
  });

  it('uses adapter.info sync property (modern Chrome 121+)', async () => {
    const adapter = createMockAdapter({
      vendor: 'nvidia',
      architecture: 'ada',
      device: 'RTX 4090',
      maxBufferSize: 16 * 1024 * 1024 * 1024,
    });
    // Verify adapter.info is used, not requestAdapterInfo
    expect(adapter.info).toBeDefined();
    expect(adapter.requestAdapterInfo).toBeUndefined();

    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('nvidia');
    expect(result.device).toBe('RTX 4090');
    expect(result.estimatedVRAM_MB).toBe(16384);
  });

  it('falls back to requestAdapterInfo when adapter.info is unavailable (legacy)', async () => {
    const adapter = createMockAdapter({
      useLegacyAPI: true,
      vendor: 'amd',
      architecture: 'rdna3',
      device: 'RX 7900',
    });
    expect(adapter.info).toBeUndefined();

    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('amd');
    expect(result.device).toBe('RX 7900');
    expect(adapter.requestAdapterInfo).toHaveBeenCalled();
  });

  it('still reports supported=true when both info APIs fail', async () => {
    const adapter = {
      // No .info property, no requestAdapterInfo — simulates unknown future API change
      limits: { maxBufferSize: 4 * 1024 * 1024 * 1024 },
    };
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('');
    expect(result.device).toBe('');
    expect(result.estimatedVRAM_MB).toBe(4096);
  });

  it('returns fallback when requestAdapter throws', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(false);
    expect(result.estimatedVRAM_MB).toBe(0);
    expect(JSON.parse(localStorage.getItem(LS_WEBGPU_AVAILABLE))).toBe(false);
  });

  it('handles maxBufferSize being 0 gracefully', async () => {
    const adapter = createMockAdapter({ maxBufferSize: 0 });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.estimatedVRAM_MB).toBe(0);
  });
});

// ══════════════════════════════════════════════
// 2. runBenchmark
// ══════════════════════════════════════════════

describe('runBenchmark', () => {
  beforeEach(() => {
    // Provide a default navigator.gpu so scanGPU doesn't hit the
    // "no gpu" branch unless we override it per test
    delete globalThis.navigator.gpu;
  });

  it('returns mode="gpu" when engine inference is fast (< 8000ms)', async () => {
    const mockEngine = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
    };
    const getEngine = vi.fn().mockResolvedValue(mockEngine);

    const result = await runBenchmark(getEngine);

    expect(result.mode).toBe('gpu');
    expect(result.latency_ms).toBeLessThan(8000);
    expect(result.gpu_info).toBeDefined();
    expect(result.tested_at).toBeDefined();
    // Result should be cached in localStorage
    const cached = JSON.parse(localStorage.getItem(LS_BENCHMARK_RESULT));
    expect(cached.mode).toBe('gpu');
  });

  it('returns mode="cpu" when engine inference takes 8000-60000ms', async () => {
    const mockEngine = {
      chat: {
        completions: {
          // Simulate ~10000ms latency
          create: vi.fn().mockImplementation(() => {
            return new Promise(resolve => {
              const start = Date.now();
              // Busy wait to simulate elapsed time
              // Instead, we mock Date.now
              resolve({});
            });
          }),
        },
      },
    };

    // Mock Date.now to simulate slow inference
    let callCount = 0;
    const originalDateNow = Date.now;
    const startTime = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First few calls: pre-inference setup
      // The key calls are around inferenceStart and after create()
      // We need: inferenceStart = Date.now() → X, then after create: Date.now() → X + 10000
      if (callCount <= 3) return startTime;       // t0, loading_engine notify, running_inference notify
      if (callCount === 4) return startTime;       // inferenceStart
      if (callCount === 5) return startTime + 10000; // latency_ms = 10000 (cpu range)
      return startTime + 10000;
    });

    const getEngine = vi.fn().mockResolvedValue(mockEngine);
    const result = await runBenchmark(getEngine);

    expect(result.mode).toBe('cpu');
    expect(result.latency_ms).toBe(10000);

    Date.now.mockRestore();
  });

  it('returns mode="none" when getEngine throws', async () => {
    const getEngine = vi.fn().mockRejectedValue(new Error('Engine load failed'));

    const result = await runBenchmark(getEngine);

    expect(result.mode).toBe('none');
    expect(result.latency_ms).toBe(30000); // BENCHMARK_MAX_WAIT_MS
  });

  it('returns mode="none" when engine.chat.completions.create throws', async () => {
    const mockEngine = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Inference timeout')),
        },
      },
    };
    const getEngine = vi.fn().mockResolvedValue(mockEngine);

    const result = await runBenchmark(getEngine);

    expect(result.mode).toBe('none');
    expect(result.latency_ms).toBe(30000); // BENCHMARK_MAX_WAIT_MS
  });

  it('calls onProgress with correct stages in order', async () => {
    const mockEngine = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
    };
    const getEngine = vi.fn().mockResolvedValue(mockEngine);
    const onProgress = vi.fn();

    await runBenchmark(getEngine, onProgress);

    const stages = onProgress.mock.calls.map(call => call[0].stage);
    expect(stages).toEqual([
      'scanning_gpu',
      'loading_engine',
      'running_inference',
      'done',
    ]);
  });

  it('calls onProgress with error stage when inference fails', async () => {
    const mockEngine = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('fail')),
        },
      },
    };
    const getEngine = vi.fn().mockResolvedValue(mockEngine);
    const onProgress = vi.fn();

    await runBenchmark(getEngine, onProgress);

    const stages = onProgress.mock.calls.map(call => call[0].stage);
    expect(stages).toContain('error');
    expect(stages).not.toContain('done');
  });

  it('works without onProgress callback', async () => {
    const mockEngine = {
      chat: { completions: { create: vi.fn().mockResolvedValue({}) } },
    };
    const getEngine = vi.fn().mockResolvedValue(mockEngine);

    // Should not throw
    const result = await runBenchmark(getEngine);
    expect(result.mode).toBeDefined();
  });
});

// ══════════════════════════════════════════════
// 3. getCachedBenchmark
// ══════════════════════════════════════════════

describe('getCachedBenchmark', () => {
  it('returns parsed object when localStorage has valid JSON', () => {
    const data = { mode: 'gpu', latency_ms: 5000, tested_at: '2026-01-01T00:00:00Z' };
    localStorage.setItem(LS_BENCHMARK_RESULT, JSON.stringify(data));

    const result = getCachedBenchmark();

    expect(result).toEqual(data);
  });

  it('returns null when localStorage is empty', () => {
    const result = getCachedBenchmark();

    expect(result).toBeNull();
  });

  it('returns null when localStorage has invalid JSON', () => {
    localStorage.setItem(LS_BENCHMARK_RESULT, '{broken json!!!');

    const result = getCachedBenchmark();

    expect(result).toBeNull();
  });

  it('returns null when localStorage key does not exist', () => {
    localStorage.removeItem(LS_BENCHMARK_RESULT);

    const result = getCachedBenchmark();

    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════
// 4. clearBenchmark
// ══════════════════════════════════════════════

describe('clearBenchmark', () => {
  it('removes both benchmark result and WebGPU flag from localStorage', () => {
    localStorage.setItem(LS_BENCHMARK_RESULT, '{"mode":"gpu"}');
    localStorage.setItem(LS_WEBGPU_AVAILABLE, 'true');

    clearBenchmark();

    expect(localStorage.getItem(LS_BENCHMARK_RESULT)).toBeNull();
    expect(localStorage.getItem(LS_WEBGPU_AVAILABLE)).toBeNull();
  });

  it('does not throw when keys do not exist', () => {
    expect(() => clearBenchmark()).not.toThrow();
  });
});

// ══════════════════════════════════════════════
// 5. getTimeoutForTier
// ══════════════════════════════════════════════

describe('getTimeoutForTier', () => {
  it('returns 30000 for gpu tier', () => {
    expect(getTimeoutForTier('gpu')).toBe(30000);
  });

  it('returns 120000 for cpu tier', () => {
    expect(getTimeoutForTier('cpu')).toBe(120000);
  });

  it('returns 180000 for none tier', () => {
    expect(getTimeoutForTier('none')).toBe(180000);
  });

  it('returns 180000 for unknown/other tier strings', () => {
    expect(getTimeoutForTier('unknown')).toBe(180000);
    expect(getTimeoutForTier('')).toBe(180000);
    expect(getTimeoutForTier('potato')).toBe(180000);
  });
});
