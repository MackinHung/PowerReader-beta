/**
 * Unit tests for benchmark.js
 *
 * Tests cover: scanGPU, deriveTierFromVRAM, getDeviceTier,
 *              getCachedBenchmark, clearBenchmark, getTimeoutForTier
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanGPU,
  deriveTierFromVRAM,
  getDeviceTier,
  getCachedBenchmark,
  clearBenchmark,
  getTimeoutForTier,
  saveUserGPUSelection,
  getUserGPUSelection,
} from '../../src/lib/core/benchmark.js';

// ── Constants (mirrored from source for assertions) ──

const LS_BENCHMARK_RESULT = 'pr_benchmark_result';
const LS_WEBGPU_AVAILABLE = 'pr_webgpu_available';
const LS_GPU_OVERRIDE = 'pr_gpu_override';

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
      vramMB: 0,
      gpuType: 'unknown',
      archInfo: null,
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

  it('returns supported info with VRAM from GPU lookup table', async () => {
    const adapter = createMockAdapter({
      vendor: 'intel',
      architecture: 'xe',
      device: 'Arc A770',
    });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('intel');
    expect(result.architecture).toBe('xe');
    expect(result.device).toBe('Arc A770');
    expect(result.vramMB).toBe(16384); // 16 GB from GPU database lookup
    expect(result.gpuType).toBe('discrete');
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
    expect(result.vramMB).toBe(24576); // 24 GB from GPU database lookup
    expect(result.gpuType).toBe('discrete');
  });

  it('falls back to requestAdapterInfo when adapter.info is unavailable (legacy)', async () => {
    const adapter = createMockAdapter({
      useLegacyAPI: true,
      vendor: 'amd',
      architecture: 'rdna3',
      device: 'RX 7900 XTX',
    });
    expect(adapter.info).toBeUndefined();

    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.vendor).toBe('amd');
    expect(result.device).toBe('RX 7900 XTX');
    expect(result.vramMB).toBe(24576); // 24 GB from GPU database lookup
    expect(result.gpuType).toBe('discrete');
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
    expect(result.vramMB).toBe(0); // No device name → lookup returns unknown
    expect(result.gpuType).toBe('unknown');
    expect(result.archInfo).toBeNull(); // No vendor/arch either
  });

  it('provides archInfo fallback when device is empty but vendor+arch are present', async () => {
    // Simulates Chrome privacy tiering: device hidden, vendor+arch available
    const adapter = createMockAdapter({
      vendor: 'nvidia',
      architecture: 'turing',
      device: '',
    });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.device).toBe('');
    expect(result.vramMB).toBe(0); // Exact lookup fails
    expect(result.gpuType).toBe('unknown');
    // Architecture fallback kicks in
    expect(result.archInfo).not.toBeNull();
    expect(result.archInfo.label).toBe('NVIDIA Turing');
    expect(result.archInfo.series).toBe('RTX 20 / GTX 16');
    expect(result.archInfo.vramRange).toBe('4 ~ 11 GB');
  });

  it('returns fallback when requestAdapter throws', async () => {
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(false);
    expect(result.vramMB).toBe(0);
    expect(JSON.parse(localStorage.getItem(LS_WEBGPU_AVAILABLE))).toBe(false);
  });

  it('returns unknown gpuType for unrecognized device name', async () => {
    const adapter = createMockAdapter({ device: 'Some Future GPU 9999' });
    globalThis.navigator.gpu = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };

    const result = await scanGPU();

    expect(result.supported).toBe(true);
    expect(result.device).toBe('Some Future GPU 9999');
    expect(result.vramMB).toBe(0);
    expect(result.gpuType).toBe('unknown');
  });
});

// ══════════════════════════════════════════════
// 2. deriveTierFromVRAM
// ══════════════════════════════════════════════

describe('deriveTierFromVRAM', () => {
  it('returns "gpu" for >= 6144 MB (6 GB)', () => {
    expect(deriveTierFromVRAM(6144)).toBe('gpu');
    expect(deriveTierFromVRAM(8192)).toBe('gpu');
    expect(deriveTierFromVRAM(24576)).toBe('gpu');
  });

  it('returns "cpu" for >= 4096 MB but < 6144 MB', () => {
    expect(deriveTierFromVRAM(4096)).toBe('cpu');
    expect(deriveTierFromVRAM(5120)).toBe('cpu');
    expect(deriveTierFromVRAM(6143)).toBe('cpu');
  });

  it('returns "none" for < 4096 MB', () => {
    expect(deriveTierFromVRAM(0)).toBe('none');
    expect(deriveTierFromVRAM(2048)).toBe('none');
    expect(deriveTierFromVRAM(4095)).toBe('none');
  });

  it('returns "none" for 0 MB (no VRAM)', () => {
    expect(deriveTierFromVRAM(0)).toBe('none');
  });
});

// ══════════════════════════════════════════════
// 3. getDeviceTier
// ══════════════════════════════════════════════

describe('getDeviceTier', () => {
  it('returns "cpu" fallback when no data is available', () => {
    expect(getDeviceTier()).toBe('cpu');
  });

  it('uses user GPU selection when available', () => {
    saveUserGPUSelection('RTX 4090', 24576);
    expect(getDeviceTier()).toBe('gpu');
  });

  it('uses user GPU selection with low VRAM', () => {
    saveUserGPUSelection('GTX 1050', 2048);
    expect(getDeviceTier()).toBe('none');
  });

  it('uses cached benchmark gpu_info when no user selection', () => {
    // Simulate a cached benchmark with gpu_info containing VRAM
    localStorage.setItem(LS_BENCHMARK_RESULT, JSON.stringify({
      mode: 'gpu',
      latency_ms: 5000,
      gpu_info: { supported: true, vramMB: 8192, device: 'RTX 3060' },
      tested_at: '2026-01-01T00:00:00Z',
    }));

    expect(getDeviceTier()).toBe('gpu');
  });

  it('falls back to "cpu" when cached benchmark has no vramMB', () => {
    localStorage.setItem(LS_BENCHMARK_RESULT, JSON.stringify({
      mode: 'cpu',
      latency_ms: 15000,
      gpu_info: { supported: true, vramMB: 0, device: '' },
      tested_at: '2026-01-01T00:00:00Z',
    }));

    expect(getDeviceTier()).toBe('cpu');
  });

  it('prefers user selection over cached benchmark', () => {
    // Cached benchmark says GPU (8 GB), but user selected a 2 GB card
    localStorage.setItem(LS_BENCHMARK_RESULT, JSON.stringify({
      mode: 'gpu',
      latency_ms: 3000,
      gpu_info: { supported: true, vramMB: 8192, device: 'RTX 3060' },
      tested_at: '2026-01-01T00:00:00Z',
    }));
    saveUserGPUSelection('Iris Xe', 2048);

    expect(getDeviceTier()).toBe('none');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(LS_BENCHMARK_RESULT, '{broken json!!!');
    expect(getDeviceTier()).toBe('cpu');
  });
});

// ══════════════════════════════════════════════
// 4. getCachedBenchmark
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
// 5. clearBenchmark
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
// 6. getTimeoutForTier
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
