/**
 * PowerReader - Inference Engine
 *
 * Fallback chain: Ollama → WebGPU → WASM → Server (Cloudflare Workers AI)
 * Detects device capabilities and selects optimal inference mode.
 *
 * Config: shared/config.js MODELS section
 *   - Model: Qwen3.5-4B, think=false, t=0.5
 *   - Timeout: 30s
 *   - Server fallback: always available
 */

import { t } from '../../locale/zh-TW.js';
import { checkOllamaStatus, OLLAMA_CONFIG } from './ollama-detect.js';

const INFERENCE_TIMEOUT_MS = 30000;
const SLOW_HINT_THRESHOLD_MS = 10000;
const SERVER_OFFER_THRESHOLD_MS = 30000;

/**
 * Inference modes in fallback order.
 */
export const INFERENCE_MODES = {
  OLLAMA: 'ollama',
  WEBGPU: 'webgpu',
  WASM: 'wasm',
  SERVER: 'server'
};

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
  } catch (e) {
    return false;
  }
}

/**
 * Check WASM availability.
 * @returns {boolean}
 */
export function hasWASM() {
  try {
    return typeof WebAssembly === 'object' &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch (e) {
    return false;
  }
}

/**
 * Detect best available inference mode.
 * Priority: Ollama (user's local install) → WebGPU → WASM → Server
 * @returns {Promise<string>} INFERENCE_MODES value
 */
export async function detectBestMode() {
  const ollamaStatus = await checkOllamaStatus();
  if (ollamaStatus.available && ollamaStatus.model_ready) {
    return INFERENCE_MODES.OLLAMA;
  }
  if (await hasWebGPU()) return INFERENCE_MODES.WEBGPU;
  if (hasWASM()) return INFERENCE_MODES.WASM;
  return INFERENCE_MODES.SERVER;
}

/**
 * Get i18n label for inference mode.
 * @param {string} mode
 * @returns {string}
 */
export function getModeLabel(mode) {
  const labels = {
    [INFERENCE_MODES.OLLAMA]: t('model.inference.ollama'),
    [INFERENCE_MODES.WEBGPU]: t('model.inference.webgpu'),
    [INFERENCE_MODES.WASM]: t('model.inference.wasm'),
    [INFERENCE_MODES.SERVER]: t('model.inference.server')
  };
  return labels[mode] || mode;
}

// =============================================
// Inference
// =============================================

/**
 * Run bias analysis on an article.
 *
 * @param {Object} options
 * @param {string} options.articleContent - Full article text (markdown)
 * @param {Array} options.knowledgeEntries - RAG Layer 2 entries
 * @param {string} options.mode - Forced inference mode (optional)
 * @param {function} options.onStatus - Status callback (stage, elapsedMs)
 * @returns {Promise<{ bias_score: number, controversy_score: number, reasoning: string, key_phrases: string[], mode: string, latency_ms: number }>}
 */
export async function runAnalysis({ articleContent, knowledgeEntries = [], mode, onStatus }) {
  const selectedMode = mode || await detectBestMode();
  const startTime = Date.now();

  const updateStatus = (stage) => {
    if (onStatus) onStatus(stage, Date.now() - startTime);
  };

  updateStatus('preparing');

  try {
    let result;

    if (selectedMode === INFERENCE_MODES.OLLAMA) {
      result = await runOllamaInference(articleContent, knowledgeEntries, updateStatus);
    } else if (selectedMode === INFERENCE_MODES.SERVER) {
      result = await runServerInference(articleContent, knowledgeEntries, updateStatus);
    } else {
      result = await runLocalInference(articleContent, knowledgeEntries, selectedMode, updateStatus);
    }

    return { ...result, mode: selectedMode, latency_ms: Date.now() - startTime };
  } catch (err) {
    // If non-server inference fails, fallback to server
    if (selectedMode !== INFERENCE_MODES.SERVER) {
      updateStatus('fallback_to_server');
      const result = await runServerInference(articleContent, knowledgeEntries, updateStatus);
      return { ...result, mode: INFERENCE_MODES.SERVER, latency_ms: Date.now() - startTime };
    }
    throw err;
  }
}

// =============================================
// Ollama Inference (Local via Ollama HTTP API)
// =============================================

/**
 * Run inference via local Ollama instance.
 * Calls POST /api/generate with assembled 3-layer prompt.
 */
async function runOllamaInference(articleContent, knowledgeEntries, updateStatus) {
  updateStatus('running');

  const prompt = assemblePrompt(articleContent, knowledgeEntries);

  const response = await fetch(`${OLLAMA_CONFIG.DEFAULT_ENDPOINT}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_CONFIG.MODEL_NAME,
      prompt,
      stream: false,
      options: { temperature: 0.5, num_predict: 1024 }
    }),
    signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Ollama inference failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  updateStatus('generating');

  return parseAnalysisOutput(data.response || '');
}

// =============================================
// Server Inference (Cloudflare Workers AI)
// =============================================

/**
 * Run inference on server (Cloudflare Workers AI).
 */
async function runServerInference(articleContent, knowledgeEntries, updateStatus) {
  updateStatus('running');

  const response = await fetch('/api/v1/inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: articleContent,
      knowledge: knowledgeEntries,
      model_params: { think: false, temperature: 0.5 }
    }),
    signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Server inference failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  updateStatus('generating');

  return {
    bias_score: data.bias_score,
    controversy_score: data.controversy_score,
    reasoning: data.reasoning || '',
    key_phrases: data.key_phrases || []
  };
}

// =============================================
// Local Inference (WebGPU / WASM)
// =============================================

/**
 * Run local inference (WebGPU or WASM).
 * Stub: Actual model loading will be implemented when T03 provides binary.
 */
async function runLocalInference(articleContent, knowledgeEntries, mode, updateStatus) {
  updateStatus('running');
  // TODO: T03 dependency — load model from OPFS/IndexedDB
  // TODO: Assemble 3-layer prompt (L1 core + L2 RAG + L3 article)
  // TODO: Run Qwen3.5-4B inference with { think: false, temperature: 0.5 }
  throw new Error(`Local inference (${mode}) not yet implemented — awaiting T03 model binary`);
}

// =============================================
// Prompt Assembly (3-Layer Architecture)
// =============================================

/**
 * Assemble the 3-layer prompt for Qwen3.5-4B bias analysis.
 * Layer 1: Core scoring rules (static, ~300 tokens)
 * Layer 2: RAG knowledge entries (dynamic, ~200-800 tokens)
 * Layer 3: Article content + JSON output instruction
 *
 * @param {string} articleContent
 * @param {Array} knowledgeEntries
 * @returns {string}
 */
function assemblePrompt(articleContent, knowledgeEntries) {
  // Layer 1: Core scoring rules
  const layer1 = [
    '你是台灣新聞立場分析師。請分析以下新聞的政治立場偏向。',
    '評分標準 (0-100): 0=極左(偏綠) 50=中立 100=極右(偏藍)',
    '偏綠特徵: 批評藍營/國民黨、支持台獨/正名、強調轉型正義',
    '偏藍特徵: 批評綠營/民進黨、支持兩岸交流、強調經濟發展',
    '爭議程度 (0-100): 0=無爭議 100=極高爭議',
  ].join('\n');

  // Layer 2: RAG knowledge injection
  let layer2 = '';
  if (knowledgeEntries.length > 0) {
    const entries = knowledgeEntries
      .map((e) => `- [${e.type}] ${e.title}: ${e.snippet}`)
      .join('\n');
    layer2 = `\n背景知識:\n${entries}\n`;
  }

  // Layer 3: Article + output format
  const layer3 = [
    '\n請分析以下新聞:',
    articleContent.slice(0, 3000),
    '\n請以 JSON 格式回覆:',
    '{"bias_score":數字,"controversy_score":數字,"reasoning":"分析理由","key_phrases":["關鍵詞1","關鍵詞2"]}'
  ].join('\n');

  return layer1 + layer2 + layer3;
}

/**
 * Parse JSON analysis output from model response.
 * Handles partial/malformed JSON gracefully.
 *
 * @param {string} rawOutput
 * @returns {{ bias_score: number, controversy_score: number, reasoning: string, key_phrases: string[] }}
 */
function parseAnalysisOutput(rawOutput) {
  const defaults = { bias_score: 50, controversy_score: 0, reasoning: '', key_phrases: [] };

  // Extract JSON from response (model may include extra text)
  const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return defaults;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      bias_score: typeof parsed.bias_score === 'number' ? parsed.bias_score : defaults.bias_score,
      controversy_score: typeof parsed.controversy_score === 'number' ? parsed.controversy_score : defaults.controversy_score,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : defaults.reasoning,
      key_phrases: Array.isArray(parsed.key_phrases) ? parsed.key_phrases : defaults.key_phrases
    };
  } catch {
    return defaults;
  }
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
