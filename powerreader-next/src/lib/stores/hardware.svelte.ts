/**
 * PowerReader - Hardware Store (Svelte 5 Runes)
 *
 * Reactive store wrapping benchmark.js and manager.js for:
 *   - GPU detection and capability scanning
 *   - Benchmark results and tier classification
 *   - Model download progress and lifecycle
 */

import type { GPUScanResult, BenchmarkResult, InferenceMode, PreDownloadChecks } from '$lib/types/inference.js';

import {
  scanGPU,
  runBenchmark,
  getCachedBenchmark,
  clearBenchmark,
  saveUserGPUSelection,
  getUserGPUSelection,
  getTimeoutForTier
} from '$lib/core/benchmark.js';

import {
  isModelDownloaded,
  downloadModel,
  pauseDownload,
  deleteModel,
  getDownloadProgress,
  runPreDownloadChecks
} from '$lib/core/manager.js';

import {
  getWebLLMEngine,
  clearAllModelCaches,
  hasWebGPU,
  detectBestMode,
  INFERENCE_MODES
} from '$lib/core/inference.js';

// -- GPU info --
let gpuInfo: GPUScanResult | null = $state(null);
let gpuScanning: boolean = $state(false);

// -- Benchmark --
let benchmarkResult: BenchmarkResult | null = $state(getCachedBenchmark());
let benchmarking: boolean = $state(false);
let benchmarkStage: string | null = $state(null);

// -- Model --
let modelDownloaded: boolean = $state(false);
let downloading: boolean = $state(false);
let downloadProgress: number = $state(0);
let downloadError: string | null = $state(null);

// -- Pre-download checks --
let preChecks: PreDownloadChecks | null = $state(null);

// -- Inference mode --
let inferenceMode: InferenceMode | null = $state(null);

export function getHardwareStore() {
  return {
    // -- Getters: GPU --
    get gpuInfo() { return gpuInfo; },
    get gpuScanning() { return gpuScanning; },
    get hasWebGPU() { return gpuInfo?.supported ?? false; },
    get userGPUSelection() { return getUserGPUSelection(); },

    // -- Getters: Benchmark --
    get benchmarkResult() { return benchmarkResult; },
    get benchmarking() { return benchmarking; },
    get benchmarkStage() { return benchmarkStage; },
    get deviceTier() { return benchmarkResult?.mode || 'unknown'; },
    get inferenceTimeout(): number {
      return benchmarkResult ? getTimeoutForTier(benchmarkResult.mode) : 90000;
    },

    // -- Getters: Model --
    get modelDownloaded() { return modelDownloaded; },
    get downloading() { return downloading; },
    get downloadProgress() { return downloadProgress; },
    get downloadError() { return downloadError; },
    get preChecks() { return preChecks; },

    // -- Getters: Inference --
    get inferenceMode() { return inferenceMode; },
    get INFERENCE_MODES() { return INFERENCE_MODES; },

    /**
     * Scan GPU capabilities. Updates gpuInfo state.
     */
    async detectHardware(): Promise<void> {
      gpuScanning = true;
      try {
        gpuInfo = await scanGPU();
        inferenceMode = await detectBestMode();
        modelDownloaded = await isModelDownloaded();
      } catch (e) {
        gpuInfo = { supported: false, vendor: '', architecture: '', device: '', vramMB: 0, gpuType: 'unknown', archInfo: null };
      } finally {
        gpuScanning = false;
      }
    },

    /**
     * Run inference benchmark to classify device tier.
     */
    async runBenchmark(): Promise<void> {
      benchmarking = true;
      benchmarkStage = 'scanning_gpu';
      try {
        const result = await runBenchmark(
          () => getWebLLMEngine(),
          (progress: { stage: string }) => { benchmarkStage = progress.stage; }
        );
        benchmarkResult = result;
      } catch (e) {
        benchmarkResult = { mode: 'none', latency_ms: 0, gpu_info: gpuInfo, tested_at: new Date().toISOString() };
      } finally {
        benchmarking = false;
        benchmarkStage = null;
      }
    },

    /** Clear cached benchmark data and re-scan. */
    async clearBenchmark(): Promise<void> {
      clearBenchmark();
      benchmarkResult = null;
      benchmarkStage = null;
    },

    /**
     * Save user's manual GPU selection.
     */
    saveGPUSelection(device: string, vramMB: number): void {
      saveUserGPUSelection(device, vramMB);
    },

    /**
     * Run pre-download condition checks (WiFi, battery, storage).
     */
    async checkPreDownload(): Promise<PreDownloadChecks | null> {
      preChecks = await runPreDownloadChecks();
      return preChecks;
    },

    /**
     * Download the WebLLM model.
     */
    async downloadModel(modelUrl: string): Promise<void> {
      downloading = true;
      downloadError = null;
      downloadProgress = 0;
      try {
        const completed = await downloadModel(modelUrl, (downloaded: number, total: number) => {
          downloadProgress = total > 0 ? downloaded / total : 0;
        });
        if (completed) {
          modelDownloaded = true;
        }
      } catch (e) {
        downloadError = (e as Error).message;
      } finally {
        downloading = false;
      }
    },

    /** Pause active model download. */
    pauseDownload(): void {
      pauseDownload();
      downloading = false;
    },

    /** Delete downloaded model and clear caches. */
    async deleteModel(): Promise<void> {
      await deleteModel();
      await clearAllModelCaches();
      modelDownloaded = false;
      downloadProgress = 0;
      try { localStorage.removeItem('powerreader_webllm_cached'); } catch {}
    },

    /** Check if model is already downloaded. */
    async checkModelStatus(): Promise<boolean> {
      modelDownloaded = await isModelDownloaded();
      // Also check WebLLM cache flag
      if (!modelDownloaded && localStorage.getItem('powerreader_webllm_cached') === '1') {
        modelDownloaded = true;
      }
      return modelDownloaded;
    }
  };
}
