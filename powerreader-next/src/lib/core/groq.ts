/**
 * PowerReader - Groq API Inference (Temporary Testing Module)
 *
 * Uses Groq cloud API with Llama 8B for fast analysis validation.
 * Same dual-pass prompt architecture as WebLLM inference.
 *
 * TODO: Remove this module after cluster analysis is validated.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import {
  assembleScoreSystemPrompt,
  assembleNarrativeSystemPrompt,
  assembleUserMessage
} from './prompt.js';
import { parseScoreOutput, parseNarrativeOutput } from './output-parser.js';
import type { Article, AnalysisResult, KnowledgeEntry } from '$lib/types/models.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const GROQ_KEY_STORAGE = 'powerreader_groq_api_key';
const GROQ_MODEL_STORAGE = 'powerreader_groq_model';
const FETCH_TIMEOUT_MS = 30000;

/**
 * Get stored Groq API key.
 */
export function getGroqApiKey(): string | null {
  try { return localStorage.getItem(GROQ_KEY_STORAGE); } catch { return null; }
}

/**
 * Set Groq API key.
 */
export function setGroqApiKey(key: string): void {
  try { localStorage.setItem(GROQ_KEY_STORAGE, key); } catch {}
}

/**
 * Get stored Groq model.
 */
export function getGroqModel(): string {
  try { return localStorage.getItem(GROQ_MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}

/**
 * Set Groq model.
 */
export function setGroqModel(model: string): void {
  try { localStorage.setItem(GROQ_MODEL_STORAGE, model); } catch {}
}

/**
 * Check if Groq testing mode is configured.
 */
export function isGroqConfigured(): boolean {
  const key = getGroqApiKey();
  return !!key && key.length > 10;
}

interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Call Groq chat completions API.
 */
async function callGroq(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number = 512): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      top_p: 0.85
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Groq API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Run dual-pass analysis via Groq API.
 * Same prompt structure as WebLLM inference.
 */
export async function runGroqAnalysis(article: Article, knowledgeEntries: KnowledgeEntry[] = [], apiKey?: string, model?: string): Promise<AnalysisResult> {
  const key = apiKey || getGroqApiKey();
  if (!key) throw new Error('Groq API key not configured');
  const selectedModel = model || getGroqModel();

  const userMessage = assembleUserMessage(article, knowledgeEntries);
  const startTime = Date.now();

  // Pass 1: Score extraction
  const pass1System = assembleScoreSystemPrompt();
  const pass1Raw = await callGroq(key, selectedModel, [
    { role: 'system', content: pass1System },
    { role: 'user', content: userMessage }
  ], 200);

  const scores = parseScoreOutput(pass1Raw);

  // Pass 2: Narrative analysis
  const pass2System = assembleNarrativeSystemPrompt(scores.bias_score, scores.controversy_score);
  const pass2Raw = await callGroq(key, selectedModel, [
    { role: 'system', content: pass2System },
    { role: 'user', content: userMessage }
  ], 512);

  const narrative = parseNarrativeOutput(pass2Raw);

  const key_phrases = narrative.key_phrases.length > 0
    ? narrative.key_phrases
    : narrative.points.slice(0, 5).map(p => p.slice(0, 20).replace(/[，。！？,\.!?\s]+$/, ''));

  const source_attribution = narrative.source_attribution
    || `資料來源：${article.source || '未知'}`;

  return {
    ...scores,
    points: narrative.points,
    reasoning: narrative.points.join('\n'),
    key_phrases,
    source_attribution,
    prompt_version: 'v4.1.0',
    mode: 'groq',
    latency_ms: Date.now() - startTime,
    _debug: {
      model: selectedModel,
      pass1_raw: pass1Raw,
      pass2_raw: pass2Raw
    }
  };
}
