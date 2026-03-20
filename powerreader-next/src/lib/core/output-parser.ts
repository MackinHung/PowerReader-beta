/**
 * PowerReader - Dual-Pass Output Parser
 *
 * Pass 1: parseScoreOutput()  → { bias_score, camp_ratio, emotion_intensity }
 * Pass 2: parseNarrativeOutput() → { points, key_phrases, stances }
 *
 * Handles partial/malformed JSON gracefully with defaults.
 * Attempts single-quote fix for 4B model quirks.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import type { ScoreOutput, NarrativeOutput } from '$lib/types/models.js';
import type { CampRatio } from '$lib/types/api.js';

const SCORE_DEFAULTS: ScoreOutput = {
  bias_score: 50,
  camp_ratio: null,
  is_political: true,
  emotion_intensity: 50
};

const NARRATIVE_DEFAULTS: NarrativeOutput = {
  points: [],
  key_phrases: [],
  stances: {}
};

/**
 * Strip <think>...</think> blocks from reasoning model output.
 * DeepSeek-R1 and similar models emit these before actual content.
 */
function stripThinkBlocks(raw: string): string {
  if (!raw) return raw;
  // Remove all <think>...</think> blocks (greedy, handles multiline)
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Try to extract and parse JSON from raw model output.
 * Handles: <think> blocks, extra text wrapping, single quotes (4B quirk),
 * markdown code fences.
 */
function extractJSON(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strip reasoning model <think> blocks
  let cleaned = stripThinkBlocks(raw);

  // Strip markdown code fences (```json ... ```)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const jsonStr = jsonMatch[0];

  // Attempt standard parse
  try {
    return JSON.parse(jsonStr);
  } catch {
    // 4B quirk: sometimes outputs single quotes instead of double quotes
    try {
      const fixed = jsonStr.replace(/'/g, '"');
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

/**
 * Parse and validate camp_ratio from parsed JSON.
 * Expects { green, white, blue, gray } with values 0-100 summing to ~100.
 * Returns null if invalid.
 */
function parseCampRatio(raw: unknown): CampRatio | null {
  if (!raw || typeof raw !== 'object') return null;

  const keys = ['green', 'white', 'blue', 'gray'] as const;
  const values: Record<string, number> = {};

  for (const key of keys) {
    if (typeof (raw as Record<string, unknown>)[key] !== 'number') return null;
    values[key] = Math.round(Math.max(0, Math.min(100, (raw as Record<string, number>)[key])));
  }

  // Normalize: if sum is off (model quirk), scale proportionally
  const sum = values.green + values.white + values.blue + values.gray;
  if (sum === 0) return null;
  if (sum !== 100) {
    const scale = 100 / sum;
    values.green = Math.round(values.green * scale);
    values.white = Math.round(values.white * scale);
    values.blue = Math.round(values.blue * scale);
    // gray absorbs rounding remainder
    values.gray = 100 - values.green - values.white - values.blue;
  }

  return values as unknown as CampRatio;
}

/**
 * Parse Pass 1 output: score extraction.
 */
export function parseScoreOutput(rawOutput: string): ScoreOutput {
  const parsed = extractJSON(rawOutput);
  if (!parsed) return { ...SCORE_DEFAULTS };

  const biasRaw = typeof parsed.bias_score === 'number' ? parsed.bias_score : SCORE_DEFAULTS.bias_score;
  const bias_score = Math.round(Math.max(0, Math.min(100, biasRaw)));

  const camp_ratio = parseCampRatio(parsed.camp_ratio);

  // Parse is_political (boolean, default true for backward compat)
  const is_political = typeof parsed.is_political === 'boolean'
    ? parsed.is_political
    : SCORE_DEFAULTS.is_political;

  // Parse emotion_intensity (0-100, default 50)
  const emotionRaw = typeof parsed.emotion_intensity === 'number'
    ? parsed.emotion_intensity
    : SCORE_DEFAULTS.emotion_intensity;
  const emotion_intensity = Math.round(Math.max(0, Math.min(100, emotionRaw)));

  // Non-political enforcement: force bias_score to 50
  const final_bias = is_political ? bias_score : 50;

  return { bias_score: final_bias, camp_ratio, is_political, emotion_intensity };
}

/**
 * Parse Pass 2 output: narrative points.
 */
export function parseNarrativeOutput(rawOutput: string): NarrativeOutput {
  const parsed = extractJSON(rawOutput);
  if (!parsed) return { ...NARRATIVE_DEFAULTS };

  const points = Array.isArray(parsed.points)
    ? parsed.points.filter((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0).slice(0, 8)
    : NARRATIVE_DEFAULTS.points;

  const key_phrases = Array.isArray(parsed.key_phrases)
    ? parsed.key_phrases.filter((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0).slice(0, 10)
    : NARRATIVE_DEFAULTS.key_phrases;

  // Parse stances: Record<string, string>
  const rawStances = parsed.stances;
  const stances: Record<string, string> = {};
  if (rawStances && typeof rawStances === 'object' && !Array.isArray(rawStances)) {
    for (const [k, v] of Object.entries(rawStances as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') {
        stances[k] = v;
      }
    }
  }

  return { points, key_phrases, stances };
}
