/**
 * PowerReader - Hardware Store (Svelte 5 Runes)
 *
 * Reactive store wrapping benchmark.js and manager.js for:
 *   - GPU detection and capability scanning
 *   - Benchmark results and tier classification
 *   - Model download progress and lifecycle
 */

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
let gpuInfo = $state(null);
let gpuScanning = $state(false);

// -- Benchmark --
let benchmarkResult = $state(getCachedBenchmark());
let benchmarking = $state(false);
let benchmarkStage = $state(null);

// -- Model --
let modelDownloaded = $state(false);
let downloading = $state(false);
let downloadProgress = $state(0);
let downloadError = $state(null);

// -- Pre-download checks --
let preChecks = $state(null);

// -- Inference mode --
let inferenceMode = $state(null);

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
    get inferenceTimeout() {
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
    async detectHardware() {
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
    async runBenchmark() {
      benchmarking = true;
      benchmarkStage = 'scanning_gpu';
      try {
        const result = await runBenchmark(
          () => getWebLLMEngine(),
          (progress) => { benchmarkStage = progress.stage; }
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
    async clearBenchmark() {
      clearBenchmark();
      benchmarkResult = null;
      benchmarkStage = null;
    },

    /**
     * Save user's manual GPU selection.
     * @param {string} device - GPU display name
     * @param {number} vramMB - VRAM in MB
     */
    saveGPUSelection(device, vramMB) {
      saveUserGPUSelection(device, vramMB);
    },

    /**
     * Run pre-download condition checks (WiFi, battery, storage).
     * @returns {Promise<{ canDownload: boolean, checks: Array }>}
     */
    async checkPreDownload() {
      preChecks = await runPreDownloadChecks();
      return preChecks;
    },

    /**
     * Download the WebLLM model.
     * @param {string} modelUrl - URL to download from
     */
    async downloadModel(modelUrl) {
      downloading = true;
      downloadError = null;
      downloadProgress = 0;
      try {
        const completed = await downloadModel(modelUrl, (downloaded, total) => {
          downloadProgress = total > 0 ? downloaded / total : 0;
        });
        if (completed) {
          modelDownloaded = true;
        }
      } catch (e) {
        downloadError = e.message;
      } finally {
        downloading = false;
      }
    },

    /** Pause active model download. */
    pauseDownload() {
      pauseDownload();
      downloading = false;
    },

    /** Delete downloaded model and clear caches. */
    async deleteModel() {
      await deleteModel();
      await clearAllModelCaches();
      modelDownloaded = false;
      downloadProgress = 0;
      try { localStorage.removeItem('powerreader_webllm_cached'); } catch {}
    },

    /** Check if model is already downloaded. */
    async checkModelStatus() {
      modelDownloaded = await isModelDownloaded();
      // Also check WebLLM cache flag
      if (!modelDownloaded && localStorage.getItem('powerreader_webllm_cached') === '1') {
        modelDownloaded = true;
      }
      return modelDownloaded;
    }
  };
}
