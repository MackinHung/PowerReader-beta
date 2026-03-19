/**
 * PowerReader - GPU Capability Scan & Inference Benchmark
 *
 * Detects WebGPU support, estimates VRAM, and benchmarks local
 * inference latency to classify the device as GPU / CPU / none.
 * Results are cached in localStorage so detection runs once.
 *
 * Exports:
 *   scanGPU()            - Instant GPU capability probe (no model needed)
 *   runBenchmark()       - Timed inference test (requires loaded engine)
 *   getCachedBenchmark() - Read cached benchmark result
 *   clearBenchmark()     - Remove all cached benchmark data
 *   getTimeoutForTier()  - Tier-based inference timeout
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { lookupGPU, lookupByArch } from './gpu-database.js';
import type { GPUScanResult, BenchmarkResult, GPUTier } from '$lib/types/inference.js';

// Inlined from shared/config.js BENCHMARK section (cannot import outside src/)
const BENCHMARK = {
  BENCHMARK_PROMPT: '分析以下新聞標題的政治立場：總統出席國防展覽',
  BENCHMARK_MAX_WAIT_MS: 30000,
  BENCHMARK_GPU_THRESHOLD_MS: 8000,
  BENCHMARK_CPU_THRESHOLD_MS: 60000,
  TIMEOUT_GPU_MS: 30000,
  TIMEOUT_CPU_MS: 120000,
  TIMEOUT_CPU_SLOW_MS: 180000,
  LS_BENCHMARK_RESULT: 'pr_benchmark_result',
  LS_WEBGPU_AVAILABLE: 'pr_webgpu_available',
  LS_GPU_OVERRIDE: 'pr_gpu_override',
};

// =============================================
// 1. GPU Capability Scan
// =============================================

/**
 * Probe the browser for WebGPU adapter info and GPU VRAM (via known-GPU lookup).
 * Does NOT load any model -- purely a hardware capabilities check.
 *
 * VRAM is determined by matching the GPU device name against a database of
 * known GPUs, NOT from adapter.limits.maxBufferSize (which is capped at 2 GB
 * by the WebGPU spec regardless of actual VRAM).
 */
export async function scanGPU(): Promise<GPUScanResult> {
  const fallback: GPUScanResult = {
    supported: false,
    vendor: '',
    architecture: '',
    device: '',
    vramMB: 0,
    gpuType: 'unknown',
    archInfo: null,
  };

  try {
    if (!navigator.gpu) {
      cacheWebGPUFlag(false);
      return fallback;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      cacheWebGPUFlag(false);
      return fallback;
    }

    // adapter.info (sync property, Chrome 121+) replaces deprecated requestAdapterInfo()
    let info: { vendor: string; architecture: string; device: string; description: string } = { vendor: '', architecture: '', device: '', description: '' };
    try {
      if ((adapter as any).info) {
        info = (adapter as any).info;
      } else if (typeof (adapter as any).requestAdapterInfo === 'function') {
        info = await (adapter as any).requestAdapterInfo();
      }
    } catch {
      // Info retrieval failed — adapter still works, just no details
    }

    const deviceName: string = info.device || info.description || '';
    const gpu = lookupGPU(deviceName);
    const vendor: string = info.vendor || '';
    const architecture: string = info.architecture || '';

    // When device name is empty/unknown, try architecture-level fallback
    const archInfo = (gpu.type === 'unknown')
      ? lookupByArch(vendor, architecture)
      : null;

    cacheWebGPUFlag(true);

    return {
      supported: true,
      vendor,
      architecture,
      device: deviceName,
      vramMB: gpu.vramMB,
      gpuType: gpu.type,
      archInfo,
    };
  } catch {
    cacheWebGPUFlag(false);
    return fallback;
  }
}

// =============================================
// 2. Inference Benchmark
// =============================================

/**
 * Run a short inference timing test to classify the device tier.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runBenchmark(getEngine: () => Promise<any>, onProgress?: (p: { stage: string; elapsed_ms: number }) => void): Promise<BenchmarkResult> {
  const notify = (stage: string, elapsed_ms: number): void => {
    if (onProgress) onProgress({ stage, elapsed_ms });
  };

  // Step 1 -- GPU info (instant, no model)
  notify('scanning_gpu', 0);
  const gpu_info = await scanGPU();

  // Step 2 -- Acquire engine (may trigger model download)
  const t0 = Date.now();
  notify('loading_engine', 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let engine: any;
  try {
    engine = await getEngine();
  } catch {
    return buildResult('none', BENCHMARK.BENCHMARK_MAX_WAIT_MS, gpu_info);
  }

  // Step 3 -- Timed inference
  notify('running_inference', Date.now() - t0);
  try {
    const inferenceStart = Date.now();

    await engine.chat.completions.create({
      messages: [{ role: 'user', content: BENCHMARK.BENCHMARK_PROMPT }],
      max_tokens: 50,
      temperature: 0.3,
      signal: AbortSignal.timeout(BENCHMARK.BENCHMARK_MAX_WAIT_MS),
    });

    const latency_ms = Date.now() - inferenceStart;
    const mode = classifyLatency(latency_ms);

    notify('done', Date.now() - t0);
    return buildResult(mode, latency_ms, gpu_info);
  } catch {
    notify('error', Date.now() - t0);
    return buildResult('none', BENCHMARK.BENCHMARK_MAX_WAIT_MS, gpu_info);
  }
}

// =============================================
// 3. Cached Benchmark Access
// =============================================

/**
 * Read the most recent benchmark result from localStorage.
 */
export function getCachedBenchmark(): BenchmarkResult | null {
  try {
    const raw = localStorage.getItem(BENCHMARK.LS_BENCHMARK_RESULT);
    if (!raw) return null;
    return JSON.parse(raw) as BenchmarkResult;
  } catch {
    return null;
  }
}

// =============================================
// 4. Clear Cache
// =============================================

/**
 * Remove both benchmark result and WebGPU availability flag
 * from localStorage so the next check runs fresh.
 */
export function clearBenchmark(): void {
  try {
    localStorage.removeItem(BENCHMARK.LS_BENCHMARK_RESULT);
    localStorage.removeItem(BENCHMARK.LS_WEBGPU_AVAILABLE);
    localStorage.removeItem(BENCHMARK.LS_GPU_OVERRIDE);
  } catch {
    // localStorage may be unavailable (private browsing)
  }
}

// =============================================
// 4b. User GPU Selection Override
// =============================================

/**
 * Save user's manually-selected GPU model to localStorage.
 * Used when browser hides the device name and user picks from a list.
 */
export function saveUserGPUSelection(device: string, vramMB: number): void {
  try {
    localStorage.setItem(
      BENCHMARK.LS_GPU_OVERRIDE,
      JSON.stringify({ device, vramMB })
    );
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Read user's manually-selected GPU from localStorage.
 */
export function getUserGPUSelection(): { device: string; vramMB: number } | null {
  try {
    const raw = localStorage.getItem(BENCHMARK.LS_GPU_OVERRIDE);
    if (!raw) return null;
    return JSON.parse(raw) as { device: string; vramMB: number };
  } catch {
    return null;
  }
}

// =============================================
// 5. Timeout by Tier
// =============================================

/**
 * Return the appropriate inference timeout for a given benchmark tier.
 */
export function getTimeoutForTier(mode: string): number {
  if (mode === 'gpu') return BENCHMARK.TIMEOUT_GPU_MS;
  if (mode === 'cpu') return BENCHMARK.TIMEOUT_CPU_MS;
  return BENCHMARK.TIMEOUT_CPU_SLOW_MS;
}

// =============================================
// Internal Helpers
// =============================================

/**
 * Classify raw latency into a device tier.
 */
function classifyLatency(latency_ms: number): GPUTier {
  if (latency_ms < BENCHMARK.BENCHMARK_GPU_THRESHOLD_MS) return 'gpu';
  if (latency_ms < BENCHMARK.BENCHMARK_CPU_THRESHOLD_MS) return 'cpu';
  return 'none';
}

/**
 * Build an immutable result object and persist it to localStorage.
 */
function buildResult(mode: GPUTier, latency_ms: number, gpu_info: GPUScanResult): BenchmarkResult {
  const result: BenchmarkResult = {
    mode,
    latency_ms,
    gpu_info,
    tested_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(BENCHMARK.LS_BENCHMARK_RESULT, JSON.stringify(result));
  } catch {
    // localStorage quota exceeded or unavailable
  }

  return result;
}

/**
 * Persist the WebGPU availability flag to localStorage.
 */
function cacheWebGPUFlag(supported: boolean): void {
  try {
    localStorage.setItem(BENCHMARK.LS_WEBGPU_AVAILABLE, JSON.stringify(supported));
  } catch {
    // localStorage may be unavailable
  }
}
