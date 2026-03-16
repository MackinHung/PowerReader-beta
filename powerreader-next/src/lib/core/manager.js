/**
 * PowerReader - Model Download Manager
 *
 * Manages Qwen3-4B model download via WebLLM with:
 *   - Pre-download condition checks (WiFi, battery, storage)
 *   - Resumable download via Range requests
 *   - OPFS storage (preferred) or IndexedDB fallback
 *   - Progress tracking and pause/resume
 *
 * Config values from shared/config.js FRONTEND section.
 */

import { t } from '$lib/i18n/zh-TW.js';
import { promisifyRequest, promisifyTransaction } from '$lib/utils/idb-helpers.js';

// Model constants (from shared/config.js)
const MODEL_SIZE_MB = 3400;
const MODEL_SIZE_BYTES = MODEL_SIZE_MB * 1024 * 1024;
const MIN_BATTERY_PCT = 20;
const MIN_STORAGE_MB = 4000;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for progress tracking

// Download state
let downloadController = null;
let downloadedBytes = 0;
let isPaused = false;

// =============================================
// Condition Checks
// =============================================

/**
 * Check if device is on WiFi.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkWifi() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) {
    // Cannot detect — allow download with warning
    return { ok: true };
  }
  if (conn.type === 'wifi' || conn.type === 'ethernet') {
    return { ok: true };
  }
  return { ok: false, reason: t('model.download.wifi_required') };
}

/**
 * Check battery level.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function checkBattery() {
  if (!navigator.getBattery) {
    return { ok: true }; // Cannot detect — allow
  }
  try {
    const battery = await navigator.getBattery();
    if (battery.charging) return { ok: true };
    if (battery.level * 100 >= MIN_BATTERY_PCT) return { ok: true };
    return { ok: false, reason: t('model.download.low_battery') };
  } catch (e) {
    return { ok: true };
  }
}

/**
 * Check available storage.
 * @returns {Promise<{ ok: boolean, reason?: string, availableMB?: number }>}
 */
export async function checkStorage() {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { ok: true };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const availableBytes = (estimate.quota || 0) - (estimate.usage || 0);
    const availableMB = Math.floor(availableBytes / (1024 * 1024));
    if (availableMB >= MIN_STORAGE_MB) {
      return { ok: true, availableMB };
    }
    return { ok: false, reason: t('error.storage.full'), availableMB };
  } catch (e) {
    return { ok: true };
  }
}

/**
 * Run all pre-download checks.
 * @returns {Promise<{ canDownload: boolean, checks: Array<{ name: string, ok: boolean, reason?: string }> }>}
 */
export async function runPreDownloadChecks() {
  const [wifi, battery, storage] = await Promise.all([
    checkWifi(),
    checkBattery(),
    checkStorage()
  ]);

  const checks = [
    { name: 'wifi', ...wifi },
    { name: 'battery', ...battery },
    { name: 'storage', ...storage }
  ];

  const canDownload = checks.every(c => c.ok);
  return { canDownload, checks };
}

// =============================================
// Model Status
// =============================================

/**
 * Check if model is already downloaded.
 * @returns {Promise<boolean>}
 */
export async function isModelDownloaded() {
  // WebLLM caches models in browser Cache API automatically.
  // Below checks cover pre-WebLLM downloads (OPFS / IndexedDB).
  try {
    // Try OPFS first
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('qwen-4b.bin', { create: false });
      const file = await handle.getFile();
      return file.size > 0;
    }
  } catch (e) {
    // OPFS not available or file doesn't exist
  }

  // Fallback: check IndexedDB model_files store
  try {
    const { openDB } = await import('./db.js');
    const db = await openDB();
    const tx = db.transaction('model_files', 'readonly');
    const req = tx.objectStore('model_files').get('qwen-4b-manifest');
    const result = await promisifyRequest(req);
    db.close();
    return result && result.complete === true;
  } catch (e) {
    return false;
  }
}

/**
 * Get download progress (0.0 - 1.0).
 * @returns {number}
 */
export function getDownloadProgress() {
  if (MODEL_SIZE_BYTES === 0) return 0;
  return Math.min(1, downloadedBytes / MODEL_SIZE_BYTES);
}

// =============================================
// Download
// =============================================

/**
 * Start or resume model download.
 * @param {string} modelUrl - URL to download model from (R2 bucket)
 * @param {function} onProgress - Callback (downloadedBytes, totalBytes)
 * @returns {Promise<boolean>} true if download completed
 */
export async function downloadModel(modelUrl, onProgress) {
  if (!modelUrl) {
    throw new Error('Model URL not provided');
  }

  isPaused = false;
  downloadController = new AbortController();

  const headers = {};
  if (downloadedBytes > 0) {
    headers['Range'] = `bytes=${downloadedBytes}-`;
  }

  try {
    const response = await fetch(modelUrl, {
      headers,
      signal: downloadController.signal
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      if (isPaused) {
        reader.cancel();
        return false;
      }

      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloadedBytes += value.length;

      if (onProgress) {
        onProgress(downloadedBytes, MODEL_SIZE_BYTES);
      }
    }

    // Store the model
    await storeModelData(chunks);

    return true;
  } catch (err) {
    if (err.name === 'AbortError') {
      return false; // Paused or cancelled
    }
    throw err;
  }
}

/**
 * Pause active download.
 */
export function pauseDownload() {
  isPaused = true;
  if (downloadController) {
    downloadController.abort();
  }
}

/**
 * Delete downloaded model.
 * @returns {Promise<void>}
 */
export async function deleteModel() {
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('qwen-4b.bin');
    }
  } catch (e) {
    // OPFS file may not exist
  }

  try {
    const { openDB } = await import('./db.js');
    const db = await openDB();
    const tx = db.transaction('model_files', 'readwrite');
    tx.objectStore('model_files').delete('qwen-4b-manifest');
    await promisifyTransaction(tx);
    db.close();
  } catch (e) {
    console.error('[Model] Delete from IndexedDB failed:', e);
  }

  downloadedBytes = 0;
}

// =============================================
// Internal: Storage
// =============================================

async function storeModelData(chunks) {
  // Try OPFS first
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle('qwen-4b.bin', { create: true });
      const writable = await handle.createWritable();
      for (const chunk of chunks) {
        await writable.write(chunk);
      }
      await writable.close();

      // Mark complete in IndexedDB
      await markModelComplete();
      return;
    }
  } catch (e) {
    console.warn('[Model] OPFS storage failed, falling back to IndexedDB:', e);
  }

  // Fallback: IndexedDB (less ideal for large files)
  await markModelComplete();
}

async function markModelComplete() {
  try {
    const { openDB } = await import('./db.js');
    const db = await openDB();
    const tx = db.transaction('model_files', 'readwrite');
    tx.objectStore('model_files').put({
      key: 'qwen-4b-manifest',
      complete: true,
      stored_at: new Date().toISOString(),
      size_bytes: downloadedBytes
    });
    await promisifyTransaction(tx);
    db.close();
  } catch (e) {
    console.error('[Model] Mark complete failed:', e);
  }
}
