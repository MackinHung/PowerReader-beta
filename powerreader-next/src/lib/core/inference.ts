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

import { t } from '$lib/i18n/zh-TW.js';
import {
  assembleScoreSystemPrompt,
  assembleNarrativeSystemPrompt,
  assembleUserMessage
} from './prompt.js';
import { parseScoreOutput, parseNarrativeOutput } from './output-parser.js';
import { isMobileDevice } from '$lib/utils/device-detect.js';
import { recordLatency, estimateRemaining, getDualPassProgress } from './eta.js';
import { getCachedBenchmark, getTimeoutForTier } from './benchmark.js';
import type { Article, AnalysisResult, KnowledgeEntry, ScoreOutput } from '$lib/types/models.js';
import type { InferenceMode, AnalysisRunOptions, StatusCallback } from '$lib/types/inference.js';
import { hashPrompts, buildFingerprint } from './fingerprint.js';

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

const PASS1_MAX_TOKENS = 180;   // Score JSON + camp_ratio + is_political + emotion_intensity
const PASS2_MAX_TOKENS = 512;   // Narrative JSON ~200-400 tokens

/**
 * Race a promise against a timeout. Rejects with 'inference_timeout' on expiry.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('inference_timeout')), ms))
  ]);
}


// =============================================
// Inference Modes
// =============================================

export const INFERENCE_MODES = {
  WEBGPU: 'webgpu',
  SERVER: 'server'
} as const;

// =============================================
// WebLLM Engine (Singleton)
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _webllmEngine: any = null;
let _webllmLoading = false;

/**
 * Get or create the WebLLM engine (singleton).
 * Downloads model on first call (~3.4GB).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWebLLMEngine(onProgress?: (progress: { text: string; progress: number }) => void): Promise<any> {
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
      initProgressCallback: (report: { text?: string; progress?: number }) => {
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
// Interrupt GPU Inference
// =============================================

/**
 * Interrupt any in-progress WebLLM generation on the GPU.
 * Safe to call even if no inference is running.
 */
export function interruptInference(): void {
  if (_webllmEngine) {
    try {
      _webllmEngine.interruptGenerate();
    } catch {
      // Engine may not have active generation — ignore
    }
  }
}

// =============================================
// Cache Management
// =============================================

/**
 * Clear all WebLLM model caches from browser Cache API.
 * This removes ALL downloaded models (old and current).
 */
export async function clearAllModelCaches(): Promise<number> {
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
 */
export async function hasWebGPU(): Promise<boolean> {
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
 */
export async function detectBestMode(): Promise<InferenceMode> {
  if (isMobileDevice()) return INFERENCE_MODES.SERVER;
  if (await hasWebGPU()) return INFERENCE_MODES.WEBGPU;
  return INFERENCE_MODES.SERVER;
}

/**
 * Get i18n label for inference mode.
 */
export function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
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
 */
export async function runAnalysis({ article, knowledgeEntries = [], mode, onStatus, signal }: AnalysisRunOptions): Promise<AnalysisResult> {
  const selectedMode: InferenceMode = mode || await detectBestMode();
  const startTime = Date.now();

  const updateStatus: StatusCallback = (stage, elapsedMs, extra) => {
    const elapsed = Date.now() - startTime;
    const tier = getCachedBenchmark()?.mode || 'cpu';
    const progress = getDualPassProgress(stage, elapsed, tier);
    const etaEstimate = estimateRemaining(tier, stage.includes('pass2') ? 'pass2' : 'pass1', elapsed);
    if (onStatus) onStatus(stage, elapsed, { ...extra, eta: etaEstimate?.remainingMs ?? null, progress });
  };

  updateStatus('preparing', 0);

  try {
    let result: AnalysisResult;

    if (selectedMode === INFERENCE_MODES.WEBGPU) {
      result = await runWebLLMInference(article, knowledgeEntries, updateStatus, signal);
    } else {
      result = await runServerInference(article, knowledgeEntries, updateStatus);
    }

    return { ...result, mode: selectedMode, latency_ms: Date.now() - startTime };
  } catch (err) {
    // If WebGPU inference fails, fallback to server
    if (selectedMode !== INFERENCE_MODES.SERVER) {
      updateStatus('fallback_to_server', Date.now() - startTime);
      try {
        const result = await runServerInference(article, knowledgeEntries, updateStatus);
        return { ...result, mode: INFERENCE_MODES.SERVER, latency_ms: Date.now() - startTime };
      } catch (serverErr) {
        throw new Error(`All inference modes failed. WebGPU: ${(err as Error).message}. Server: ${(serverErr as Error).message}`);
      }
    }
    throw err;
  }
}

// =============================================
// WebLLM Inference (WebGPU, Dual-Pass)
// =============================================

async function runWebLLMInference(article: Article, knowledgeEntries: KnowledgeEntry[], updateStatus: StatusCallback, signal?: AbortSignal): Promise<AnalysisResult> {
  // Streaming investigation: WebLLM supports stream:true but JSON output (Pass 1)
  // is not suitable for streaming. Pass 2 narrative could benefit but stability
  // varies across browsers. Keeping batch mode for reliability. Revisit when
  // WebLLM streaming API stabilizes.

  // Phase 0: Load model
  updateStatus('loading_model', 0);
  const engine = await getWebLLMEngine((progress) => {
    updateStatus('loading_model', 0, progress);
  });

  const userMessage = assembleUserMessage(article, knowledgeEntries);
  const tier = getCachedBenchmark()?.mode || 'cpu';

  // Phase 1: Score extraction (per-pass timeout)
  updateStatus('pass1_running', 0);
  const pass1Start = Date.now();
  const pass1Timeout = getTimeoutForTier(tier);
  const pass1SystemPrompt = assembleScoreSystemPrompt() + QWEN3_NO_THINK;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pass1Response: any = await withTimeout(
    engine.chat.completions.create({
      messages: [
        { role: 'system', content: pass1SystemPrompt },
        { role: 'user', content: userMessage }
      ],
      ...MODEL_PARAMS,
      max_tokens: PASS1_MAX_TOKENS
    }),
    pass1Timeout
  );

  const pass1TimeMs = Date.now() - pass1Start;
  recordLatency(tier, 'pass1', pass1TimeMs);

  const pass1Raw: string = pass1Response.choices[0]?.message?.content || '';
  const pass1Tokens: number = pass1Response.usage?.completion_tokens ?? 0;
  const scores: ScoreOutput = parseScoreOutput(pass1Raw);
  updateStatus('pass1_done', pass1TimeMs);

  // Free KV cache between passes — critical for 6GB VRAM
  try { await engine.resetChat(); } catch {}

  // Bail out if cancelled between passes — avoid starting Pass 2 on GPU
  if (signal?.aborted) {
    throw new Error('inference_cancelled');
  }

  // Phase 2: Narrative analysis (informed by Pass 1 scores, 2x timeout)
  updateStatus('pass2_running', 0);
  const pass2Start = Date.now();
  const pass2Timeout = getTimeoutForTier(tier) * 2;
  const pass2SystemPrompt = assembleNarrativeSystemPrompt(scores.bias_score, scores.controversy_score) + QWEN3_NO_THINK;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pass2Response: any;
  try {
    pass2Response = await withTimeout(
      engine.chat.completions.create({
        messages: [
          { role: 'system', content: pass2SystemPrompt },
          { role: 'user', content: userMessage }
        ],
        ...MODEL_PARAMS,
        max_tokens: PASS2_MAX_TOKENS
      }),
      pass2Timeout
    );
  } catch (err) {
    // Pass 2 timeout — return partial result (pass 1 scores preserved)
    const pass2TimeMs = Date.now() - pass2Start;
    recordLatency(tier, 'pass2', pass2TimeMs);
    updateStatus('pass2_done', pass2TimeMs);
    const promptHash = await hashPrompts(pass1SystemPrompt, pass2SystemPrompt, userMessage);
    return {
      ...scores,
      points: [],
      reasoning: '',
      key_phrases: [],
      source_attribution: `資料來源：${article.source || '未知'}`,
      prompt_version: 'v4.1.0',
      mode: 'webgpu',
      latency_ms: 0,
      fingerprint: buildFingerprint({
        modelId: MODEL_ID,
        promptHash,
        pass1Tokens,
        pass2Tokens: 0,
        pass1TimeMs,
        pass2TimeMs,
      }),
      _debug: { pass1_system: pass1SystemPrompt, pass1_raw: pass1Raw, pass2_error: (err as Error).message }
    };
  }

  const pass2TimeMs = Date.now() - pass2Start;
  recordLatency(tier, 'pass2', pass2TimeMs);

  const pass2Raw: string = pass2Response.choices[0]?.message?.content || '';
  const pass2Tokens: number = pass2Response.usage?.completion_tokens ?? 0;
  const narrative = parseNarrativeOutput(pass2Raw);
  updateStatus('pass2_done', pass2TimeMs);

  // Fallback: derive key_phrases from points if model didn't provide them
  const key_phrases = narrative.key_phrases.length > 0
    ? narrative.key_phrases
    : narrative.points.slice(0, 5).map(p => p.slice(0, 20).replace(/[，。！？,\.!?\s]+$/, ''));

  // Fallback: derive source_attribution from article.source if model didn't provide it
  const source_attribution = narrative.source_attribution
    || `資料來源：${article.source || '未知'}`;

  const promptHash = await hashPrompts(pass1SystemPrompt, pass2SystemPrompt, userMessage);

  return {
    ...scores,
    points: narrative.points,
    reasoning: narrative.points.join('\n'),
    key_phrases,
    source_attribution,
    prompt_version: 'v4.1.0',
    mode: 'webgpu',
    latency_ms: 0,
    fingerprint: buildFingerprint({
      modelId: MODEL_ID,
      promptHash,
      pass1Tokens,
      pass2Tokens,
      pass1TimeMs,
      pass2TimeMs,
    }),
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

async function runServerInference(article: Article, knowledgeEntries: KnowledgeEntry[], updateStatus: StatusCallback): Promise<AnalysisResult> {
  updateStatus('running', 0);

  const serverStart = Date.now();
  const response = await fetch('/api/v1/inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: article.content_markdown || article.summary || '',
      knowledge: knowledgeEntries,
      model_params: { think: false, temperature: 0.5 }
    }),
    signal: AbortSignal.timeout(getTimeoutForTier(getCachedBenchmark()?.mode || 'cpu'))
  });

  if (!response.ok) {
    throw new Error(`Server inference failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const serverTimeMs = Date.now() - serverStart;
  updateStatus('generating', 0);

  const promptHash = await hashPrompts(
    article.content_markdown || article.summary || ''
  );

  return {
    bias_score: data.bias_score ?? 50,
    controversy_score: data.controversy_score ?? 0,
    camp_ratio: data.camp_ratio ?? null,
    is_political: data.is_political ?? true,
    emotion_intensity: data.emotion_intensity ?? 50,
    points: data.points || [],
    reasoning: data.reasoning || '',
    key_phrases: data.key_phrases || [],
    source_attribution: data.source_attribution || `資料來源：${article.source || '未知'}`,
    prompt_version: data.prompt_version || 'server',
    mode: 'server',
    latency_ms: 0,
    fingerprint: buildFingerprint({
      modelId: 'server',
      promptHash,
      pass1Tokens: data.usage?.completion_tokens ?? 0,
      pass2Tokens: 0,
      pass1TimeMs: serverTimeMs,
      pass2TimeMs: 0,
    }),
  };
}
