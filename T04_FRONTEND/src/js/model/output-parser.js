/**
 * PowerReader - Dual-Pass Output Parser
 *
 * Pass 1: parseScoreOutput()  → { bias_score, controversy_score }
 * Pass 2: parseNarrativeOutput() → { points: string[] }
 *
 * Handles partial/malformed JSON gracefully with defaults.
 * Attempts single-quote fix for 4B model quirks.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

const SCORE_DEFAULTS = {
  bias_score: 50,
  controversy_score: 0
};

const NARRATIVE_DEFAULTS = {
  points: [],
  key_phrases: []
};

/**
 * Strip <think>...</think> blocks from reasoning model output.
 * DeepSeek-R1 and similar models emit these before actual content.
 *
 * @param {string} raw - Raw model output
 * @returns {string} Output with thinking blocks removed
 */
function stripThinkBlocks(raw) {
  if (!raw) return raw;
  // Remove all <think>...</think> blocks (greedy, handles multiline)
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Try to extract and parse JSON from raw model output.
 * Handles: <think> blocks, extra text wrapping, single quotes (4B quirk),
 * markdown code fences.
 *
 * @param {string} raw - Raw model output string
 * @returns {Object|null} Parsed object, or null on failure
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Strip reasoning model <think> blocks
  let cleaned = stripThinkBlocks(raw);

  // Strip markdown code fences (```json ... ```)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0];

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
 * Parse Pass 1 output: score extraction.
 *
 * @param {string} rawOutput - Raw model output string
 * @returns {{ bias_score: number, controversy_score: number }}
 */
export function parseScoreOutput(rawOutput) {
  const parsed = extractJSON(rawOutput);
  if (!parsed) return { ...SCORE_DEFAULTS };

  const biasRaw = typeof parsed.bias_score === 'number' ? parsed.bias_score : SCORE_DEFAULTS.bias_score;
  const bias_score = Math.round(Math.max(0, Math.min(100, biasRaw)));

  const contRaw = typeof parsed.controversy_score === 'number' ? parsed.controversy_score : SCORE_DEFAULTS.controversy_score;
  const controversy_score = Math.round(Math.max(0, Math.min(100, contRaw)));

  return { bias_score, controversy_score };
}

/**
 * Parse Pass 2 output: narrative points.
 *
 * @param {string} rawOutput - Raw model output string
 * @returns {{ points: string[] }}
 */
export function parseNarrativeOutput(rawOutput) {
  const parsed = extractJSON(rawOutput);
  if (!parsed) return { ...NARRATIVE_DEFAULTS };

  const points = Array.isArray(parsed.points)
    ? parsed.points.filter(p => typeof p === 'string' && p.trim().length > 0).slice(0, 8)
    : NARRATIVE_DEFAULTS.points;

  const key_phrases = Array.isArray(parsed.key_phrases)
    ? parsed.key_phrases.filter(p => typeof p === 'string' && p.trim().length > 0).slice(0, 10)
    : NARRATIVE_DEFAULTS.key_phrases;

  return { points, key_phrases };
}

