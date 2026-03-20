/**
 * Unit tests for group-analysis.ts
 *
 * Covers: checkGroupReadiness, getDominantCamp, computeCampStatistics,
 *         assembleGroupAnalysisPrompt, parseGroupOutput
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import {
  checkGroupReadiness,
  getDominantCamp,
  computeCampStatistics,
  assembleGroupAnalysisPrompt,
  assembleGroupUserMessage,
  parseGroupOutput,
} from '../../src/lib/core/group-analysis.js';

// ── Helpers ──

function makeArticle(id, source) {
  return { article_id: id, title: `Article ${id}`, source, summary: '', content_markdown: '', primary_url: '', published_at: '' };
}

function makeAnalysis(overrides = {}) {
  return {
    bias_score: 50,
    camp_ratio: { green: 20, white: 20, blue: 20, gray: 40 },
    is_political: true,
    emotion_intensity: 50,
    points: ['p1'],
    key_phrases: ['k1'],
    reasoning: '',
    prompt_version: 'v4.0.0',
    mode: 'webgpu',
    latency_ms: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// checkGroupReadiness
// ═══════════════════════════════════════════════
describe('checkGroupReadiness', () => {
  it('returns not ready for empty articles', () => {
    const result = checkGroupReadiness([], new Map());
    expect(result.ready).toBe(false);
    expect(result.analyzed_count).toBe(0);
    expect(result.source_count).toBe(0);
  });

  it('returns not ready for null articles', () => {
    const result = checkGroupReadiness(null, new Map());
    expect(result.ready).toBe(false);
  });

  it('returns not ready when 2 articles from 2 sources (below threshold)', () => {
    const articles = [
      makeArticle('a1', 'source1'),
      makeArticle('a2', 'source2'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
    ]);
    const result = checkGroupReadiness(articles, analyses);
    expect(result.ready).toBe(false);
    expect(result.analyzed_count).toBe(2);
    expect(result.source_count).toBe(2);
  });

  it('returns not ready when 3 articles from only 2 sources', () => {
    const articles = [
      makeArticle('a1', 'source1'),
      makeArticle('a2', 'source1'),
      makeArticle('a3', 'source2'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);
    const result = checkGroupReadiness(articles, analyses);
    expect(result.ready).toBe(false);
    expect(result.source_count).toBe(2);
    expect(result.message).toContain('不足');
  });

  it('returns ready when 3 articles from 3 different sources', () => {
    const articles = [
      makeArticle('a1', 'source1'),
      makeArticle('a2', 'source2'),
      makeArticle('a3', 'source3'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);
    const result = checkGroupReadiness(articles, analyses);
    expect(result.ready).toBe(true);
    expect(result.analyzed_count).toBe(3);
    expect(result.source_count).toBe(3);
  });

  it('excludes unanalyzed articles from count', () => {
    const articles = [
      makeArticle('a1', 'source1'),
      makeArticle('a2', 'source2'),
      makeArticle('a3', 'source3'),
      makeArticle('a4', 'source4'), // not analyzed
    ];
    const analyses = new Map([
      ['a1', makeAnalysis()],
      ['a2', makeAnalysis()],
      ['a3', makeAnalysis()],
    ]);
    const result = checkGroupReadiness(articles, analyses);
    expect(result.ready).toBe(true);
    expect(result.analyzed_count).toBe(3);
    expect(result.source_count).toBe(3);
  });

  it('returns not ready when articles exist but none are analyzed', () => {
    const articles = [
      makeArticle('a1', 'source1'),
      makeArticle('a2', 'source2'),
      makeArticle('a3', 'source3'),
    ];
    const result = checkGroupReadiness(articles, new Map());
    expect(result.ready).toBe(false);
    expect(result.analyzed_count).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// getDominantCamp
// ═══════════════════════════════════════════════
describe('getDominantCamp', () => {
  it('returns "gray" for null input', () => {
    expect(getDominantCamp(null)).toBe('gray');
  });

  it('returns "gray" for undefined input', () => {
    expect(getDominantCamp(undefined)).toBe('gray');
  });

  it('returns the camp with highest value', () => {
    expect(getDominantCamp({ green: 60, white: 10, blue: 20, gray: 10 })).toBe('green');
    expect(getDominantCamp({ green: 10, white: 10, blue: 60, gray: 20 })).toBe('blue');
    expect(getDominantCamp({ green: 10, white: 60, blue: 20, gray: 10 })).toBe('white');
    expect(getDominantCamp({ green: 10, white: 10, blue: 10, gray: 70 })).toBe('gray');
  });

  it('handles all-zero camp_ratio', () => {
    // With all zeros, first checked camp with value > maxVal(-1) wins: green=0 > -1
    expect(getDominantCamp({ green: 0, white: 0, blue: 0, gray: 0 })).toBe('green');
  });

  it('handles tie by priority order (green > blue > white > gray)', () => {
    // green and blue both 40 — green is checked first, sets maxVal=40, blue can't exceed
    expect(getDominantCamp({ green: 40, white: 10, blue: 40, gray: 10 })).toBe('green');
  });
});

// ═══════════════════════════════════════════════
// computeCampStatistics
// ═══════════════════════════════════════════════
describe('computeCampStatistics', () => {
  it('returns empty array when no articles are analyzed', () => {
    const articles = [makeArticle('a1', 'src1')];
    const result = computeCampStatistics(articles, new Map());
    expect(result).toEqual([]);
  });

  it('groups articles by dominant camp correctly', () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
    ];
    const analyses = new Map([
      ['a1', makeAnalysis({ bias_score: 20, camp_ratio: { green: 60, white: 10, blue: 10, gray: 20 } })],
      ['a2', makeAnalysis({ bias_score: 80, camp_ratio: { green: 10, white: 10, blue: 60, gray: 20 } })],
    ]);

    const result = computeCampStatistics(articles, analyses);
    expect(result.length).toBe(2);

    const greenStat = result.find(s => s.camp === 'green');
    const blueStat = result.find(s => s.camp === 'blue');
    expect(greenStat).toBeTruthy();
    expect(greenStat.article_count).toBe(1);
    expect(greenStat.avg_bias_score).toBe(20);
    expect(blueStat).toBeTruthy();
    expect(blueStat.article_count).toBe(1);
    expect(blueStat.avg_bias_score).toBe(80);
  });

  it('computes within-group averages correctly', () => {
    const articles = [
      makeArticle('a1', 'src1'),
      makeArticle('a2', 'src2'),
      makeArticle('a3', 'src3'),
    ];
    // All articles in "green" camp
    const greenRatio = { green: 60, white: 10, blue: 10, gray: 20 };
    const analyses = new Map([
      ['a1', makeAnalysis({ bias_score: 10, emotion_intensity: 30, camp_ratio: greenRatio })],
      ['a2', makeAnalysis({ bias_score: 20, emotion_intensity: 60, camp_ratio: greenRatio })],
      ['a3', makeAnalysis({ bias_score: 30, emotion_intensity: 90, camp_ratio: greenRatio })],
    ]);

    const result = computeCampStatistics(articles, analyses);
    expect(result.length).toBe(1);
    expect(result[0].camp).toBe('green');
    expect(result[0].article_count).toBe(3);
    expect(result[0].avg_bias_score).toBe(20); // (10+20+30)/3 = 20
    expect(result[0].avg_emotion_intensity).toBe(60); // (30+60+90)/3 = 60
    expect(result[0].sources).toContain('src1');
    expect(result[0].sources).toContain('src2');
    expect(result[0].sources).toContain('src3');
  });

  it('handles missing emotion_intensity with default 50', () => {
    const articles = [makeArticle('a1', 'src1')];
    const analyses = new Map([
      ['a1', makeAnalysis({ emotion_intensity: undefined, camp_ratio: { green: 0, white: 0, blue: 0, gray: 100 } })],
    ]);

    const result = computeCampStatistics(articles, analyses);
    expect(result[0].avg_emotion_intensity).toBe(50);
  });
});

// ═══════════════════════════════════════════════
// assembleGroupAnalysisPrompt
// ═══════════════════════════════════════════════
describe('assembleGroupAnalysisPrompt', () => {
  it('returns a string', () => {
    const result = assembleGroupAnalysisPrompt();
    expect(typeof result).toBe('string');
  });

  it('contains cross-media analysis instruction', () => {
    const result = assembleGroupAnalysisPrompt();
    expect(result).toContain('跨媒體');
  });

  it('contains JSON output instruction', () => {
    const result = assembleGroupAnalysisPrompt();
    expect(result).toContain('source_summaries');
    expect(result).toContain('group_summary');
    expect(result).toContain('bias_direction');
  });

  it('contains bias_direction rules', () => {
    const result = assembleGroupAnalysisPrompt();
    expect(result).toContain('偏綠');
    expect(result).toContain('偏藍');
    expect(result).toContain('中立');
    expect(result).toContain('多元');
  });
});

// ═══════════════════════════════════════════════
// assembleGroupUserMessage
// ═══════════════════════════════════════════════
describe('assembleGroupUserMessage', () => {
  it('returns valid JSON', () => {
    const sources = [
      { source: 'src1', bias_score: 30, emotion_intensity: 40, points: ['p1'], key_phrases: ['k1'] },
    ];
    const result = assembleGroupUserMessage(sources);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].source).toBe('src1');
  });

  it('truncates points and key_phrases to 5 each', () => {
    const sources = [
      {
        source: 'src1',
        bias_score: 50,
        emotion_intensity: 50,
        points: ['1','2','3','4','5','6','7'],
        key_phrases: ['a','b','c','d','e','f','g'],
      },
    ];
    const result = assembleGroupUserMessage(sources);
    const parsed = JSON.parse(result);
    expect(parsed[0].points).toHaveLength(5);
    expect(parsed[0].key_phrases).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════
// parseGroupOutput
// ═══════════════════════════════════════════════
describe('parseGroupOutput', () => {
  it('parses valid JSON output', () => {
    const raw = JSON.stringify({
      source_summaries: [
        { source: 'src1', camp: 'green', summary: 'summary1' },
        { source: 'src2', camp: 'blue', summary: 'summary2' },
      ],
      group_summary: 'Overall summary',
      bias_direction: '多元',
    });
    const result = parseGroupOutput(raw);
    expect(result.source_summaries).toHaveLength(2);
    expect(result.source_summaries[0].source).toBe('src1');
    expect(result.source_summaries[0].camp).toBe('green');
    expect(result.group_summary).toBe('Overall summary');
    expect(result.bias_direction).toBe('多元');
  });

  it('returns defaults for null input', () => {
    const result = parseGroupOutput(null);
    expect(result.source_summaries).toEqual([]);
    expect(result.group_summary).toBe('');
    expect(result.bias_direction).toBe('多元');
  });

  it('returns defaults for empty string', () => {
    const result = parseGroupOutput('');
    expect(result.source_summaries).toEqual([]);
  });

  it('returns defaults for invalid JSON', () => {
    const result = parseGroupOutput('not valid json at all');
    expect(result.source_summaries).toEqual([]);
    expect(result.group_summary).toBe('');
  });

  it('handles <think> blocks', () => {
    const raw = '<think>analyzing...</think>' + JSON.stringify({
      source_summaries: [{ source: 's1', camp: 'white', summary: 'test' }],
      group_summary: 'summary',
      bias_direction: '中立',
    });
    const result = parseGroupOutput(raw);
    expect(result.source_summaries).toHaveLength(1);
    expect(result.bias_direction).toBe('中立');
  });

  it('handles markdown code fences', () => {
    const json = JSON.stringify({
      source_summaries: [],
      group_summary: 'test',
      bias_direction: '偏綠',
    });
    const raw = '```json\n' + json + '\n```';
    const result = parseGroupOutput(raw);
    expect(result.group_summary).toBe('test');
    expect(result.bias_direction).toBe('偏綠');
  });

  it('validates camp values and defaults invalid ones to gray', () => {
    const raw = JSON.stringify({
      source_summaries: [
        { source: 's1', camp: 'invalid_camp', summary: 'test' },
      ],
      group_summary: '',
      bias_direction: '多元',
    });
    const result = parseGroupOutput(raw);
    expect(result.source_summaries[0].camp).toBe('gray');
  });

  it('validates bias_direction and defaults invalid ones to 多元', () => {
    const raw = JSON.stringify({
      source_summaries: [],
      group_summary: '',
      bias_direction: 'invalid',
    });
    const result = parseGroupOutput(raw);
    expect(result.bias_direction).toBe('多元');
  });

  it('handles missing source_summaries gracefully', () => {
    const raw = JSON.stringify({
      group_summary: 'test',
      bias_direction: '偏藍',
    });
    const result = parseGroupOutput(raw);
    expect(result.source_summaries).toEqual([]);
    expect(result.bias_direction).toBe('偏藍');
  });

  it('filters out non-object entries in source_summaries', () => {
    const raw = JSON.stringify({
      source_summaries: ['string', null, 42, { source: 's1', camp: 'green', summary: 'ok' }],
      group_summary: '',
      bias_direction: '多元',
    });
    const result = parseGroupOutput(raw);
    expect(result.source_summaries).toHaveLength(1);
    expect(result.source_summaries[0].source).toBe('s1');
  });
});
