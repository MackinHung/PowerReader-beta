/**
 * PowerReader - GPU Capability Scan & VRAM-based Tier Detection
 *
 * Detects WebGPU support, estimates VRAM, and classifies the device
 * tier (GPU / CPU / none) based on available VRAM — no benchmark needed.
 *
 * Exports:
 *   scanGPU()              - Instant GPU capability probe (no model needed)
 *   deriveTierFromVRAM()   - Pure VRAM → tier classification
 *   getDeviceTier()        - Read tier from user selection or cached scan
 *   getCachedBenchmark()   - Read cached benchmark result (legacy)
 *   clearBenchmark()       - Remove all cached benchmark data
 *   getTimeoutForTier()    - Tier-based inference timeout
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { lookupGPU, lookupByArch } from './gpu-database.js';
import type { GPUScanResult, BenchmarkResult, GPUTier } from '$lib/types/inference.js';

// Inlined from shared/config.js BENCHMARK section (cannot import outside src/)
const BENCHMARK = {
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
// 2. VRAM-based Tier Detection
// =============================================

/**
 * Classify device tier purely from VRAM size.
 *   ≥ 6 GB (6144 MB) → 'gpu'  (recommended, smooth local inference)
 *   ≥ 4 GB (4096 MB) → 'cpu'  (runs but slower)
 *   < 4 GB           → 'none' (insufficient, use server mode)
 */
export function deriveTierFromVRAM(vramMB: number): GPUTier {
  if (vramMB >= 6144) return 'gpu';
  if (vramMB >= 4096) return 'cpu';
  return 'none';
}

/**
 * Determine device tier from available VRAM data.
 * Priority: user GPU selection > cached GPU scan > fallback 'cpu'.
 */
export function getDeviceTier(): GPUTier {
  // 1. User manual selection
  const userSelection = getUserGPUSelection();
  if (userSelection && userSelection.vramMB > 0) {
    return deriveTierFromVRAM(userSelection.vramMB);
  }

  // 2. Cached GPU scan result (from scanGPU → localStorage)
  try {
    const raw = localStorage.getItem(BENCHMARK.LS_BENCHMARK_RESULT);
    if (raw) {
      const cached = JSON.parse(raw) as BenchmarkResult;
      if (cached.gpu_info?.vramMB && cached.gpu_info.vramMB > 0) {
        return deriveTierFromVRAM(cached.gpu_info.vramMB);
      }
    }
  } catch {
    // Corrupted data — fall through
  }

  // 3. Safe fallback (matches existing inference.ts behavior)
  return 'cpu';
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
 * Persist the WebGPU availability flag to localStorage.
 */
function cacheWebGPUFlag(supported: boolean): void {
  try {
    localStorage.setItem(BENCHMARK.LS_WEBGPU_AVAILABLE, JSON.stringify(supported));
  } catch {
    // localStorage may be unavailable
  }
}
