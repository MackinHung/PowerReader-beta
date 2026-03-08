/**
 * PowerReader - Inference Engine (WebLLM Dual-Pass)
 *
 * Fallback chain: WebGPU (WebLLM) -> Server (Cloudflare Workers AI)
 *
 * Dual-Pass Architecture:
 *   Pass 1: Score extraction (bias_score + controversy_score)
 *   Pass 2: Narrative analysis (3-5 key points, informed by Pass 1)
 *
 * Config:
 *   - Model: Qwen3-4B-q4f16_1-MLC (3.4GB, WebGPU)
 *   - Params: think=false, t=0.5, response_format=json_object
 *   - Timeout: 30s/pass GPU, 120s/pass CPU
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';
import {
  assembleScoreSystemPrompt,
  assembleNarrativeSystemPrompt,
  assembleUserMessage
} from './prompt.js';
import { parseScoreOutput, parseNarrativeOutput, parseAnalysisOutput } from './output-parser.js';
import { getCachedBenchmark, getTimeoutForTier, scanGPU } from './benchmark.js';

// =============================================
// Configuration
// =============================================

const WEBLLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm';
const MODEL_ID = 'Qwen3-8B-q4f16_1-MLC';
const MODEL_PARAMS = {
  temperature: 0.3,
  top_p: 0.85,
  repetition_penalty: 1.05
};

// Qwen3 /no_think suffix — appended to system prompt to suppress <think> loop
const QWEN3_NO_THINK = '\n/no_think';

const PASS1_MAX_TOKENS = 150;   // Score JSON + camp_ratio ~80 tokens, buffer for stray text
const PASS2_MAX_TOKENS = 512;   // Narrative JSON ~200-400 tokens
const INFERENCE_TIMEOUT_MS = 90000; // 90s total for dual pass (8B needs more time)

/**
 * Get dynamic inference timeout based on benchmark tier.
 * Falls back to INFERENCE_TIMEOUT_MS if no benchmark data.
 * @returns {number} Timeout in milliseconds
 */
function getInferenceTimeout() {
  const cached = getCachedBenchmark();
  if (cached && cached.mode) {
    return getTimeoutForTier(cached.mode);
  }
  return INFERENCE_TIMEOUT_MS; // fallback to default
}

const SLOW_HINT_THRESHOLD_MS = 15000;
const SERVER_OFFER_THRESHOLD_MS = 60000;

// =============================================
// Inference Modes
// =============================================

export const INFERENCE_MODES = {
  WEBGPU: 'webgpu',
  SERVER: 'server'
};

// =============================================
// WebLLM Engine (Singleton)
// =============================================

let _webllmEngine = null;
let _webllmLoading = false;

/**
 * Get or create the WebLLM engine (singleton).
 * Downloads model on first call (~3.4GB).
 *
 * @param {function} onProgress - Progress callback ({ text, progress })
 * @returns {Promise<Object>} WebLLM MLCEngine instance
 */
export async function getWebLLMEngine(onProgress) {
  if (_webllmEngine) return _webllmEngine;
  if (_webllmLoading) {
    // Wait for in-progress loading
    while (_webllmLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (_webllmEngine) return _webllmEngine;
    throw new Error('WebLLM engine loading failed');
  }

  _webllmLoading = true;
  try {
    const webllm = await import(/* webpackIgnore: true */ WEBLLM_CDN);

    _webllmEngine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        if (onProgress) {
          onProgress({
            text: report.text || '',
            progress: report.progress || 0
          });
        }
      }
    });

    // Mark model as cached for future visits (skip download confirmation)
    try { localStorage.setItem('powerreader_webllm_cached', '1'); } catch {}

    return _webllmEngine;
  } catch (err) {
    _webllmEngine = null;
    throw err;
  } finally {
    _webllmLoading = false;
  }
}

// =============================================
// Cache Management
// =============================================

/**
 * Clear all WebLLM model caches from browser Cache API.
 * This removes ALL downloaded models (old and current).
 *
 * @returns {Promise<number>} Approximate freed MB
 */
export async function clearAllModelCaches() {
  let freedBytes = 0;

  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      // WebLLM cache names contain 'webllm' or model-related patterns
      if (name.includes('webllm') || name.includes('mlc') ||
          name.includes('Qwen') || name.includes('DeepSeek') ||
          name.includes('Llama') || name.includes('wasm')) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const key of keys) {
          const resp = await cache.match(key);
          if (resp) {
            const blob = await resp.blob();
            freedBytes += blob.size;
          }
        }
        await caches.delete(name);
      }
    }
  } catch (e) {
    console.warn('[Inference] Cache cleanup error:', e);
  }

  // Reset engine singleton
  _webllmEngine = null;

  return Math.round(freedBytes / (1024 * 1024));
}

// =============================================
// Capability Detection
// =============================================

/**
 * Check WebGPU availability.
 * @returns {Promise<boolean>}
 */
export async function hasWebGPU() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Detect best available inference mode.
 * Priority: WebGPU -> Server
 * @returns {Promise<string>} INFERENCE_MODES value
 */
export async function detectBestMode() {
  // Check cached benchmark first
  const cached = getCachedBenchmark();
  if (cached && cached.mode) {
    if (cached.mode === 'gpu' || cached.mode === 'cpu') {
      return INFERENCE_MODES.WEBGPU;
    }
    if (cached.mode === 'none') {
      return INFERENCE_MODES.SERVER;
    }
  }

  // No cached benchmark — probe WebGPU
  if (await hasWebGPU()) return INFERENCE_MODES.WEBGPU;

  // Fire-and-forget: scan GPU and cache availability for future visits
  scanGPU().catch(() => {});

  return INFERENCE_MODES.SERVER;
}

/**
 * Get i18n label for inference mode.
 * @param {string} mode
 * @returns {string}
 */
export function getModeLabel(mode) {
  const labels = {
    [INFERENCE_MODES.WEBGPU]: t('model.inference.webgpu'),
    [INFERENCE_MODES.SERVER]: t('model.inference.server')
  };
  return labels[mode] || mode;
}

// =============================================
// Main Entry Point
// =============================================

/**
 * Run dual-pass bias analysis on an article.
 *
 * @param {Object} options
 * @param {Object} options.article - Full article object
 * @param {Array} options.knowledgeEntries - RAG Layer 2 entries
 * @param {string} options.mode - Forced inference mode (optional)
 * @param {function} options.onStatus - Status callback (stage, elapsedMs, extra)
 * @returns {Promise<Object>} Analysis result with mode, latency_ms, and narrative points
 */
export async function runAnalysis({ article, knowledgeEntries = [], mode, onStatus }) {
  const selectedMode = mode || await detectBestMode();
  const startTime = Date.now();

  const updateStatus = (stage, extra) => {
    if (onStatus) onStatus(stage, Date.now() - startTime, extra);
  };

  updateStatus('preparing');

  try {
    let result;

    if (selectedMode === INFERENCE_MODES.WEBGPU) {
      result = await runWebLLMInference(article, knowledgeEntries, updateStatus);
    } else {
      result = await runServerInference(article, knowledgeEntries, updateStatus);
    }

    return { ...result, mode: selectedMode, latency_ms: Date.now() - startTime };
  } catch (err) {
    // If WebGPU inference fails, fallback to server
    if (selectedMode !== INFERENCE_MODES.SERVER) {
      updateStatus('fallback_to_server');
      try {
        const result = await runServerInference(article, knowledgeEntries, updateStatus);
        return { ...result, mode: INFERENCE_MODES.SERVER, latency_ms: Date.now() - startTime };
      } catch (serverErr) {
        throw new Error(`All inference modes failed. WebGPU: ${err.message}. Server: ${serverErr.message}`);
      }
    }
    throw err;
  }
}

// =============================================
// WebLLM Inference (WebGPU, Dual-Pass)
// =============================================

async function runWebLLMInference(article, knowledgeEntries, updateStatus) {
  // Phase 0: Load model
  updateStatus('loading_model');
  const engine = await getWebLLMEngine((progress) => {
    updateStatus('loading_model', progress);
  });

  const userMessage = assembleUserMessage(article, knowledgeEntries);

  // Phase 1: Score extraction
  updateStatus('pass1_running');
  const pass1SystemPrompt = assembleScoreSystemPrompt() + QWEN3_NO_THINK;
  const pass1Response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: pass1SystemPrompt },
      { role: 'user', content: userMessage }
    ],
    ...MODEL_PARAMS,
    max_tokens: PASS1_MAX_TOKENS
  });

  const pass1Raw = pass1Response.choices[0]?.message?.content || '';
  const scores = parseScoreOutput(pass1Raw);
  updateStatus('pass1_done');

  // Free KV cache between passes — critical for 6GB VRAM
  try { await engine.resetChat(); } catch {}

  // Phase 2: Narrative analysis (informed by Pass 1 scores)
  updateStatus('pass2_running');
  const pass2SystemPrompt = assembleNarrativeSystemPrompt(scores.bias_score, scores.controversy_score) + QWEN3_NO_THINK;
  const pass2Response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: pass2SystemPrompt },
      { role: 'user', content: userMessage }
    ],
    ...MODEL_PARAMS,
    max_tokens: PASS2_MAX_TOKENS
  });

  const pass2Raw = pass2Response.choices[0]?.message?.content || '';
  const narrative = parseNarrativeOutput(pass2Raw);
  updateStatus('pass2_done');

  // Fallback: derive key_phrases from points if model didn't provide them
  const key_phrases = narrative.key_phrases.length > 0
    ? narrative.key_phrases
    : narrative.points.slice(0, 5).map(p => p.slice(0, 20).replace(/[，。！？,\.!?\s]+$/, ''));

  return {
    ...scores,
    points: narrative.points,
    reasoning: narrative.points.join('\n'),
    key_phrases,
    prompt_version: 'v3.0.0',
    // Debug: raw prompts and outputs for inspection
    _debug: {
      pass1_system: pass1SystemPrompt,
      pass1_user: userMessage.substring(0, 500),
      pass1_raw: pass1Raw,
      pass2_system: pass2SystemPrompt,
      pass2_raw: pass2Raw
    }
  };
}

// =============================================
// Server Inference (Cloudflare Workers AI)
// =============================================

async function runServerInference(article, knowledgeEntries, updateStatus) {
  updateStatus('running');

  const response = await fetch('/api/v1/inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: article.content_markdown || article.summary || '',
      knowledge: knowledgeEntries,
      model_params: { think: false, temperature: 0.5 }
    }),
    signal: AbortSignal.timeout(getInferenceTimeout())
  });

  if (!response.ok) {
    throw new Error(`Server inference failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  updateStatus('generating');

  return {
    bias_score: data.bias_score ?? 50,
    controversy_score: data.controversy_score ?? 0,
    points: data.points || [],
    reasoning: data.reasoning || '',
    key_phrases: data.key_phrases || [],
    prompt_version: data.prompt_version || 'server'
  };
}

// =============================================
// Inference Timer UX
// =============================================

/**
 * Create a timed inference wrapper that provides UX status updates.
 *
 * @param {function} onStatus - Callback for UX updates
 * @returns {{ start: function, cancel: function }}
 */
export function createInferenceTimer(onStatus) {
  let intervalId = null;
  const startTime = Date.now();

  return {
    start() {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= SERVER_OFFER_THRESHOLD_MS) {
          onStatus('timeout_offer', elapsed);
        } else if (elapsed >= SLOW_HINT_THRESHOLD_MS) {
          onStatus('slow_hint', elapsed);
        }
      }, 1000);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  };
}

// =============================================
// Benchmark Integration
// =============================================

/**
 * Get the current device benchmark tier.
 * @returns {"gpu" | "cpu" | "none" | "unknown"}
 */
export function getBenchmarkTier() {
  const cached = getCachedBenchmark();
  return cached?.mode || 'unknown';
}
