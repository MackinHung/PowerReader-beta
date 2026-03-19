/**
 * Unit tests for output-parser.js
 *
 * Covers: parseScoreOutput, parseNarrativeOutput
 * Internal functions (stripThinkBlocks, extractJSON) tested via exports.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseScoreOutput,
  parseNarrativeOutput
} from '../../src/lib/core/output-parser.js';

// ---------------------------------------------------------------------------
// parseScoreOutput
// ---------------------------------------------------------------------------
describe('parseScoreOutput', () => {
  it('parses normal JSON with bias_score and controversy_score', () => {
    const raw = '{"bias_score": 75, "controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(75);
    expect(result.controversy_score).toBe(40);
    expect(result.camp_ratio).toBeNull();
    // v4 defaults
    expect(result.is_political).toBe(true);
    expect(result.emotion_intensity).toBe(50);
  });

  it('parses JSON wrapped in <think>...</think> blocks', () => {
    const raw = '<think>Let me analyze this...</think>{"bias_score": 30, "controversy_score": 60}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(30);
    expect(result.controversy_score).toBe(60);
    expect(result.camp_ratio).toBeNull();
  });

  it('parses JSON wrapped in multiline <think> blocks', () => {
    const raw = `<think>
This is reasoning output.
Multiple lines here.
</think>
{"bias_score": 45, "controversy_score": 20}`;
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(45);
    expect(result.controversy_score).toBe(20);
    expect(result.camp_ratio).toBeNull();
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const raw = '```json\n{"bias_score": 80, "controversy_score": 55}\n```';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(80);
    expect(result.controversy_score).toBe(55);
  });

  it('parses markdown code fences without json label', () => {
    const raw = '```\n{"bias_score": 10, "controversy_score": 5}\n```';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(10);
    expect(result.controversy_score).toBe(5);
  });

  it('parses single-quote JSON (4B model quirk)', () => {
    const raw = "{'bias_score': 75, 'controversy_score': 40}";
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(75);
    expect(result.controversy_score).toBe(40);
  });

  it('clamps bias_score above 100 to 100', () => {
    const raw = '{"bias_score": 150, "controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(100);
    expect(result.controversy_score).toBe(40);
  });

  it('clamps bias_score below 0 to 0', () => {
    const raw = '{"bias_score": -20, "controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(0);
  });

  it('clamps controversy_score above 100 to 100', () => {
    const raw = '{"bias_score": 50, "controversy_score": 200}';
    const result = parseScoreOutput(raw);
    expect(result.controversy_score).toBe(100);
  });

  it('clamps controversy_score below 0 to 0', () => {
    const raw = '{"bias_score": 50, "controversy_score": -10}';
    const result = parseScoreOutput(raw);
    expect(result.controversy_score).toBe(0);
  });

  it('returns default when bias_score is a non-number string', () => {
    const raw = '{"bias_score": "high", "controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(50); // default
    expect(result.controversy_score).toBe(40);
  });

  it('returns default when controversy_score is a non-number', () => {
    const raw = '{"bias_score": 40, "controversy_score": "medium"}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(40);
    expect(result.controversy_score).toBe(0); // default
  });

  it('returns full defaults for completely invalid string', () => {
    const raw = 'This is not JSON at all, just some random text.';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(50);
    expect(result.controversy_score).toBe(0);
    expect(result.camp_ratio).toBeNull();
    expect(result.is_political).toBe(true);
    expect(result.emotion_intensity).toBe(50);
  });

  it('returns defaults for null input', () => {
    const result = parseScoreOutput(null);
    expect(result.bias_score).toBe(50);
    expect(result.controversy_score).toBe(0);
    expect(result.camp_ratio).toBeNull();
    expect(result.is_political).toBe(true);
    expect(result.emotion_intensity).toBe(50);
  });

  it('returns defaults for undefined input', () => {
    const result = parseScoreOutput(undefined);
    expect(result.bias_score).toBe(50);
    expect(result.is_political).toBe(true);
  });

  it('returns defaults for empty string input', () => {
    const result = parseScoreOutput('');
    expect(result.bias_score).toBe(50);
    expect(result.is_political).toBe(true);
    expect(result.emotion_intensity).toBe(50);
  });

  it('rounds floating-point bias_score with Math.round', () => {
    const raw = '{"bias_score": 75.6, "controversy_score": 40.4}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(76);
    expect(result.controversy_score).toBe(40);
  });

  it('rounds .5 upward', () => {
    const raw = '{"bias_score": 50.5, "controversy_score": 49.5}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(51);
    expect(result.controversy_score).toBe(50);
  });

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is the result: {"bias_score": 60, "controversy_score": 30} hope this helps!';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(60);
    expect(result.controversy_score).toBe(30);
    expect(result.camp_ratio).toBeNull();
  });

  it('handles <think> + code fence combination', () => {
    const raw = `<think>analyzing...</think>
\`\`\`json
{"bias_score": 22, "controversy_score": 88}
\`\`\``;
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(22);
    expect(result.controversy_score).toBe(88);
  });

  it('handles extra whitespace around JSON', () => {
    const raw = '   \n  {"bias_score": 50, "controversy_score": 50}  \n  ';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(50);
    expect(result.controversy_score).toBe(50);
  });

  it('handles zero scores correctly', () => {
    const raw = '{"bias_score": 0, "controversy_score": 0}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(0);
    expect(result.controversy_score).toBe(0);
  });

  it('handles boundary value 100', () => {
    const raw = '{"bias_score": 100, "controversy_score": 100}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(100);
    expect(result.controversy_score).toBe(100);
  });

  it('uses default for missing bias_score key', () => {
    const raw = '{"controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(50);
    expect(result.controversy_score).toBe(40);
  });

  it('uses default for missing controversy_score key', () => {
    const raw = '{"bias_score": 60}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(60);
    expect(result.controversy_score).toBe(0);
  });

  it('does not mutate SCORE_DEFAULTS across calls', () => {
    const result1 = parseScoreOutput(null);
    result1.bias_score = 999;
    const result2 = parseScoreOutput(null);
    expect(result2.bias_score).toBe(50);
  });

  // camp_ratio tests
  it('parses valid camp_ratio from model output', () => {
    const raw = '{"bias_score": 30, "controversy_score": 60, "camp_ratio": {"green": 50, "white": 20, "blue": 10, "gray": 20}}';
    const result = parseScoreOutput(raw);
    expect(result.camp_ratio).toEqual({ green: 50, white: 20, blue: 10, gray: 20 });
  });

  it('returns null camp_ratio when not present in output', () => {
    const raw = '{"bias_score": 30, "controversy_score": 60}';
    const result = parseScoreOutput(raw);
    expect(result.camp_ratio).toBeNull();
  });

  it('normalizes camp_ratio when sum is not 100', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": 30, "white": 20, "blue": 10, "gray": 40}}';
    const result = parseScoreOutput(raw);
    // sum=100, no normalization needed
    expect(result.camp_ratio).toEqual({ green: 30, white: 20, blue: 10, gray: 40 });
  });

  it('normalizes camp_ratio when sum exceeds 100', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": 50, "white": 30, "blue": 20, "gray": 50}}';
    const result = parseScoreOutput(raw);
    // sum=150, scale=100/150=0.667
    const { green, white, blue, gray } = result.camp_ratio;
    expect(green + white + blue + gray).toBe(100);
  });

  it('returns null camp_ratio when all values are zero', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": 0, "white": 0, "blue": 0, "gray": 0}}';
    const result = parseScoreOutput(raw);
    expect(result.camp_ratio).toBeNull();
  });

  it('returns null camp_ratio when a key is missing', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": 50, "white": 30, "blue": 20}}';
    const result = parseScoreOutput(raw);
    expect(result.camp_ratio).toBeNull();
  });

  it('returns null camp_ratio when values are not numbers', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": "high", "white": 30, "blue": 20, "gray": 10}}';
    const result = parseScoreOutput(raw);
    expect(result.camp_ratio).toBeNull();
  });

  it('clamps camp_ratio values to 0-100', () => {
    const raw = '{"bias_score": 50, "controversy_score": 40, "camp_ratio": {"green": -10, "white": 50, "blue": 150, "gray": 10}}';
    const result = parseScoreOutput(raw);
    // After clamping: green=0, white=50, blue=100, gray=10 -> sum=160, normalize
    const { green, white, blue, gray } = result.camp_ratio;
    expect(green).toBeGreaterThanOrEqual(0);
    expect(blue).toBeLessThanOrEqual(100);
    expect(green + white + blue + gray).toBe(100);
  });

  // ── v4: is_political ──

  it('parses is_political=true from output', () => {
    const raw = '{"bias_score": 30, "controversy_score": 60, "is_political": true, "emotion_intensity": 40}';
    const result = parseScoreOutput(raw);
    expect(result.is_political).toBe(true);
    expect(result.bias_score).toBe(30);
  });

  it('parses is_political=false from output', () => {
    const raw = '{"bias_score": 30, "controversy_score": 20, "is_political": false, "emotion_intensity": 10}';
    const result = parseScoreOutput(raw);
    expect(result.is_political).toBe(false);
    // Non-political enforcement: bias_score forced to 50
    expect(result.bias_score).toBe(50);
  });

  it('defaults is_political to true when missing', () => {
    const raw = '{"bias_score": 70, "controversy_score": 40}';
    const result = parseScoreOutput(raw);
    expect(result.is_political).toBe(true);
  });

  it('defaults is_political to true when non-boolean', () => {
    const raw = '{"bias_score": 70, "controversy_score": 40, "is_political": "yes"}';
    const result = parseScoreOutput(raw);
    expect(result.is_political).toBe(true);
  });

  it('forces bias_score=50 when is_political=false even if model says otherwise', () => {
    const raw = '{"bias_score": 15, "controversy_score": 10, "is_political": false, "emotion_intensity": 5}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(50);
    expect(result.controversy_score).toBe(10);
    expect(result.emotion_intensity).toBe(5);
  });

  // ── v4: emotion_intensity ──

  it('parses emotion_intensity from output', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30, "emotion_intensity": 75}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(75);
  });

  it('defaults emotion_intensity to 50 when missing', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(50);
  });

  it('clamps emotion_intensity above 100 to 100', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30, "emotion_intensity": 150}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(100);
  });

  it('clamps emotion_intensity below 0 to 0', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30, "emotion_intensity": -20}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(0);
  });

  it('rounds emotion_intensity with Math.round', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30, "emotion_intensity": 42.7}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(43);
  });

  it('defaults emotion_intensity when non-number', () => {
    const raw = '{"bias_score": 50, "controversy_score": 30, "emotion_intensity": "high"}';
    const result = parseScoreOutput(raw);
    expect(result.emotion_intensity).toBe(50);
  });

  // ── v4: backward compatibility ──

  it('handles v3 output format (missing is_political and emotion_intensity)', () => {
    const raw = '{"bias_score": 65, "controversy_score": 45, "camp_ratio": {"green": 20, "white": 30, "blue": 40, "gray": 10}}';
    const result = parseScoreOutput(raw);
    expect(result.bias_score).toBe(65);
    expect(result.controversy_score).toBe(45);
    expect(result.is_political).toBe(true);
    expect(result.emotion_intensity).toBe(50);
    expect(result.camp_ratio).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseNarrativeOutput
// ---------------------------------------------------------------------------
describe('parseNarrativeOutput', () => {
  it('parses normal JSON with points and key_phrases', () => {
    const raw = '{"points": ["p1", "p2", "p3"], "key_phrases": ["k1", "k2"]}';
    const result = parseNarrativeOutput(raw);
    expect(result).toEqual({
      points: ['p1', 'p2', 'p3'],
      key_phrases: ['k1', 'k2']
    });
  });

  it('slices points to max 8', () => {
    const pts = Array.from({ length: 12 }, (_, i) => `point${i + 1}`);
    const raw = JSON.stringify({ points: pts, key_phrases: ['k1'] });
    const result = parseNarrativeOutput(raw);
    expect(result.points).toHaveLength(8);
    expect(result.points[0]).toBe('point1');
    expect(result.points[7]).toBe('point8');
  });

  it('slices key_phrases to max 10', () => {
    const kps = Array.from({ length: 15 }, (_, i) => `kp${i + 1}`);
    const raw = JSON.stringify({ points: ['p1'], key_phrases: kps });
    const result = parseNarrativeOutput(raw);
    expect(result.key_phrases).toHaveLength(10);
    expect(result.key_phrases[0]).toBe('kp1');
    expect(result.key_phrases[9]).toBe('kp10');
  });

  it('filters out empty strings from points', () => {
    const raw = '{"points": ["valid", "", "also valid", "  "], "key_phrases": []}';
    const result = parseNarrativeOutput(raw);
    expect(result.points).toEqual(['valid', 'also valid']);
  });

  it('filters out non-string items from points', () => {
    const raw = '{"points": ["valid", 42, null, true, "ok"], "key_phrases": []}';
    const result = parseNarrativeOutput(raw);
    expect(result.points).toEqual(['valid', 'ok']);
  });

  it('filters out empty strings from key_phrases', () => {
    const raw = '{"points": [], "key_phrases": ["good", "", "fine", "   "]}';
    const result = parseNarrativeOutput(raw);
    expect(result.key_phrases).toEqual(['good', 'fine']);
  });

  it('filters out non-string items from key_phrases', () => {
    const raw = '{"points": [], "key_phrases": ["a", 123, null, "b"]}';
    const result = parseNarrativeOutput(raw);
    expect(result.key_phrases).toEqual(['a', 'b']);
  });

  it('returns empty array when points is missing', () => {
    const raw = '{"key_phrases": ["k1"]}';
    const result = parseNarrativeOutput(raw);
    expect(result.points).toEqual([]);
  });

  it('returns empty array when key_phrases is missing', () => {
    const raw = '{"points": ["p1"]}';
    const result = parseNarrativeOutput(raw);
    expect(result.key_phrases).toEqual([]);
  });

  it('returns empty array when points is not an array', () => {
    const raw = '{"points": "not an array", "key_phrases": []}';
    const result = parseNarrativeOutput(raw);
    expect(result.points).toEqual([]);
  });

  it('returns empty array when key_phrases is not an array', () => {
    const raw = '{"points": [], "key_phrases": "not array"}';
    const result = parseNarrativeOutput(raw);
    expect(result.key_phrases).toEqual([]);
  });

  it('returns defaults for null input', () => {
    const result = parseNarrativeOutput(null);
    expect(result).toEqual({ points: [], key_phrases: [] });
  });

  it('returns defaults for empty string input', () => {
    const result = parseNarrativeOutput('');
    expect(result).toEqual({ points: [], key_phrases: [] });
  });

  it('returns defaults for undefined input', () => {
    const result = parseNarrativeOutput(undefined);
    expect(result).toEqual({ points: [], key_phrases: [] });
  });

  it('returns defaults for completely invalid string', () => {
    const result = parseNarrativeOutput('garbage text no json here');
    expect(result).toEqual({ points: [], key_phrases: [] });
  });

  it('handles <think> blocks before narrative JSON', () => {
    const raw = '<think>thinking hard</think>{"points": ["p1"], "key_phrases": ["k1"]}';
    const result = parseNarrativeOutput(raw);
    expect(result).toEqual({ points: ['p1'], key_phrases: ['k1'] });
  });

  it('handles markdown code fences around narrative JSON', () => {
    const raw = '```json\n{"points": ["a", "b"], "key_phrases": ["x"]}\n```';
    const result = parseNarrativeOutput(raw);
    expect(result).toEqual({ points: ['a', 'b'], key_phrases: ['x'] });
  });

  it('filtering + slicing: filters first, then slices', () => {
    // 10 valid + 3 empty = 13 entries; after filter = 10 valid; after slice = 8
    const pts = [
      'p1', '', 'p2', 'p3', '  ', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', ''
    ];
    const raw = JSON.stringify({ points: pts, key_phrases: [] });
    const result = parseNarrativeOutput(raw);
    expect(result.points).toHaveLength(8);
    expect(result.points).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });

  it('returns objects with points and key_phrases arrays on null input', () => {
    const result = parseNarrativeOutput(null);
    expect(Array.isArray(result.points)).toBe(true);
    expect(Array.isArray(result.key_phrases)).toBe(true);
    expect(result.points).toHaveLength(0);
    expect(result.key_phrases).toHaveLength(0);
  });
});
