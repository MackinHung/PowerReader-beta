/**
 * Ollama Detection Module (T07)
 *
 * Client-side detection of local Ollama inference engine.
 * Used by PWA to check if Qwen3.5-4B is available for analysis.
 *
 * Navigation:
 * - Upstream: docs/OLLAMA_SETUP.md, shared/config.js MODELS
 * - Downstream: T04 PWA (integration point)
 * - Maintainer: T07 (Deployment & Monitoring Team)
 *
 * Usage:
 *   import { checkOllamaStatus } from './ollama-detect.js';
 *   const status = await checkOllamaStatus();
 *   if (!status.available) {
 *     showInstallPrompt();
 *   } else if (!status.model_ready) {
 *     showDownloadPrompt();
 *   }
 */

export const OLLAMA_CONFIG = Object.freeze({
  DEFAULT_ENDPOINT: 'http://localhost:11434',
  MODEL_NAME: 'qwen3.5:4b',
  MODEL_SIZE_MB: 3400,
  INFERENCE_TIMEOUT_MS: 30000,
  DETECT_TIMEOUT_MS: 3000,
  MIN_BATTERY_PCT: 20,
});

/**
 * Fetch with timeout using AbortSignal.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs = OLLAMA_CONFIG.DETECT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Simple ping: checks if Ollama HTTP server is reachable.
 * @param {string} [endpoint]
 * @returns {Promise<boolean>}
 */
export async function isOllamaRunning(endpoint = OLLAMA_CONFIG.DEFAULT_ENDPOINT) {
  try {
    const response = await fetchWithTimeout(`${endpoint}/api/tags`);
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Fetches the full list of locally available models from Ollama.
 * @param {string} [endpoint]
 * @returns {Promise<Array<Object>>} Array of model info objects, or empty array on failure.
 */
export async function getOllamaModels(endpoint = OLLAMA_CONFIG.DEFAULT_ENDPOINT) {
  try {
    const response = await fetchWithTimeout(`${endpoint}/api/tags`);
    if (response.status !== 200) return [];
    const data = await response.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch {
    return [];
  }
}

/**
 * Checks whether the expected model is downloaded and available locally.
 * @param {string} [endpoint]
 * @param {string} [modelName]
 * @returns {Promise<boolean>}
 */
export async function isModelReady(
  endpoint = OLLAMA_CONFIG.DEFAULT_ENDPOINT,
  modelName = OLLAMA_CONFIG.MODEL_NAME,
) {
  const models = await getOllamaModels(endpoint);
  return models.some((m) => m.name === modelName || m.name.startsWith(`${modelName}:`));
}

/**
 * Main detection function. Returns a comprehensive status object
 * describing Ollama availability and model readiness.
 * @param {string} [endpoint]
 * @returns {Promise<Object>} Status object for UI consumption.
 */
export async function checkOllamaStatus(endpoint = OLLAMA_CONFIG.DEFAULT_ENDPOINT) {
  const base = {
    model_name: OLLAMA_CONFIG.MODEL_NAME,
    model_size_mb: OLLAMA_CONFIG.MODEL_SIZE_MB,
    endpoint,
  };

  const running = await isOllamaRunning(endpoint);
  if (!running) {
    return {
      ...base,
      available: false,
      model_ready: false,
      error: 'Ollama is not running. Please start Ollama and try again.',
    };
  }

  const modelReady = await isModelReady(endpoint);
  if (!modelReady) {
    return {
      ...base,
      available: true,
      model_ready: false,
      error: `Model "${OLLAMA_CONFIG.MODEL_NAME}" not found. Run: ollama pull ${OLLAMA_CONFIG.MODEL_NAME}`,
    };
  }

  return {
    ...base,
    available: true,
    model_ready: true,
    error: null,
  };
}
