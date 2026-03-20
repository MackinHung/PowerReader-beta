/**
 * Unit tests for event-detail.js helpers
 *
 * TDD RED phase: all tests should FAIL before implementation.
 */
import { describe, it, expect } from 'vitest';
import {
  getAnalysisState,
  getAnalysisProgress,
  groupArticlesBySource,
  parseSourcesJson,
  getArticleAnalysisStatus,
  buildShareData,
} from '../../src/lib/pages/event-detail.js';

// ── Test Data Factory ──

const makeCluster = (overrides = {}) => ({
  cluster_id: 'cluster-1',
  representative_title: '總統府召開國安會議',
  category: '政治',
  article_count: 10,
  source_count: 5,
  sources_json: JSON.stringify([
    { source: 'cna', count: 3 },
    { source: 'liberty_times', count: 4 },
    { source: 'china_times', count: 3 },
  ]),
  earliest_published_at: '2026-03-18T06:00:00Z',
  latest_published_at: '2026-03-18T14:00:00Z',
  is_blindspot: false,
  blindspot_type: null,
  camp_distribution: { green: 40, white: 30, blue: 30 },
  avg_camp_ratio: { dpp: 45, tpp: 25, kmt: 30 },
  analyzed_count: 7,
  ...overrides,
});

const makeArticle = (overrides = {}) => ({
  article_id: 'art-1',
  title: '測試新聞標題',
  source: 'cna',
  published_at: '2026-03-18T08:00:00Z',
  bias_score: 55,
  analysis_count: 1,
  ...overrides,
});

// ══════════════════════════════════════════════
// 1. getAnalysisState
// ══════════════════════════════════════════════

describe('getAnalysisState', () => {
  it('returns "none" when cluster is null', () => {
    expect(getAnalysisState(null)).toBe('none');
  });

  it('returns "none" when analyzed_count is 0', () => {
    const cluster = makeCluster({ analyzed_count: 0 });
    expect(getAnalysisState(cluster)).toBe('none');
  });

  it('returns "none" when analyzed_count is undefined', () => {
    const cluster = makeCluster({ analyzed_count: undefined });
    expect(getAnalysisState(cluster)).toBe('none');
  });

  it('returns "partial" when some articles are analyzed', () => {
    const cluster = makeCluster({ analyzed_count: 3, article_count: 10 });
    expect(getAnalysisState(cluster)).toBe('partial');
  });

  it('returns "complete" when all articles are analyzed', () => {
    const cluster = makeCluster({ analyzed_count: 10, article_count: 10 });
    expect(getAnalysisState(cluster)).toBe('complete');
  });

  it('returns "complete" when analyzed_count exceeds article_count', () => {
    const cluster = makeCluster({ analyzed_count: 12, article_count: 10 });
    expect(getAnalysisState(cluster)).toBe('complete');
  });

  it('returns "none" when article_count is 0', () => {
    const cluster = makeCluster({ analyzed_count: 0, article_count: 0 });
    expect(getAnalysisState(cluster)).toBe('none');
  });
});

// ══════════════════════════════════════════════
// 2. getAnalysisProgress
// ══════════════════════════════════════════════

describe('getAnalysisProgress', () => {
  it('returns zeros when cluster is null', () => {
    expect(getAnalysisProgress(null)).toEqual({
      analyzed: 0, total: 0, percentage: 0,
    });
  });

  it('returns correct counts from cluster data', () => {
    const cluster = makeCluster({ analyzed_count: 7, article_count: 10 });
    expect(getAnalysisProgress(cluster)).toEqual({
      analyzed: 7, total: 10, percentage: 70,
    });
  });

  it('caps percentage at 100', () => {
    const cluster = makeCluster({ analyzed_count: 15, article_count: 10 });
    const result = getAnalysisProgress(cluster);
    expect(result.percentage).toBe(100);
  });

  it('returns 0 percentage when article_count is 0', () => {
    const cluster = makeCluster({ analyzed_count: 0, article_count: 0 });
    expect(getAnalysisProgress(cluster).percentage).toBe(0);
  });

  it('rounds percentage to integer', () => {
    const cluster = makeCluster({ analyzed_count: 1, article_count: 3 });
    expect(getAnalysisProgress(cluster).percentage).toBe(33);
  });

  it('uses articles array length as fallback when article_count is missing', () => {
    const cluster = makeCluster({ analyzed_count: 2 });
    delete cluster.article_count;
    const articles = [makeArticle(), makeArticle(), makeArticle()];
    expect(getAnalysisProgress(cluster, articles)).toEqual({
      analyzed: 2, total: 3, percentage: 67,
    });
  });
});

// ══════════════════════════════════════════════
// 3. groupArticlesBySource
// ══════════════════════════════════════════════

describe('groupArticlesBySource', () => {
  it('returns empty array for empty input', () => {
    expect(groupArticlesBySource([])).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(groupArticlesBySource(null)).toEqual([]);
    expect(groupArticlesBySource(undefined)).toEqual([]);
  });

  it('groups articles by source', () => {
    const articles = [
      makeArticle({ source: 'cna', article_id: '1' }),
      makeArticle({ source: 'cna', article_id: '2' }),
      makeArticle({ source: 'liberty_times', article_id: '3' }),
    ];
    const result = groupArticlesBySource(articles);
    expect(result).toHaveLength(2);
    // cna has 2 articles, should be first (sorted by count desc)
    expect(result[0][0]).toBe('cna');
    expect(result[0][1]).toHaveLength(2);
    expect(result[1][0]).toBe('liberty_times');
    expect(result[1][1]).toHaveLength(1);
  });

  it('sorts groups by article count descending', () => {
    const articles = [
      makeArticle({ source: 'a', article_id: '1' }),
      makeArticle({ source: 'b', article_id: '2' }),
      makeArticle({ source: 'b', article_id: '3' }),
      makeArticle({ source: 'c', article_id: '4' }),
      makeArticle({ source: 'c', article_id: '5' }),
      makeArticle({ source: 'c', article_id: '6' }),
    ];
    const result = groupArticlesBySource(articles);
    expect(result[0][0]).toBe('c');
    expect(result[1][0]).toBe('b');
    expect(result[2][0]).toBe('a');
  });

  it('handles single source', () => {
    const articles = [
      makeArticle({ source: 'cna', article_id: '1' }),
      makeArticle({ source: 'cna', article_id: '2' }),
    ];
    const result = groupArticlesBySource(articles);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('cna');
    expect(result[0][1]).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════
// 4. parseSourcesJson
// ══════════════════════════════════════════════

describe('parseSourcesJson', () => {
  it('returns empty array for null', () => {
    expect(parseSourcesJson(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseSourcesJson(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSourcesJson('')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseSourcesJson('not json')).toEqual([]);
  });

  it('parses valid JSON string', () => {
    const json = JSON.stringify([
      { source: 'cna', count: 3 },
      { source: 'liberty_times', count: 2 },
    ]);
    const result = parseSourcesJson(json);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ source: 'cna', count: 3 });
  });

  it('returns the array directly if already parsed (non-string)', () => {
    const arr = [{ source: 'cna', count: 1 }];
    expect(parseSourcesJson(arr)).toEqual(arr);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseSourcesJson(JSON.stringify({ source: 'cna' }))).toEqual([]);
  });
});

// ══════════════════════════════════════════════
// 5. getArticleAnalysisStatus
// ══════════════════════════════════════════════

describe('getArticleAnalysisStatus', () => {
  it('returns "analyzed" when bias_score is present', () => {
    expect(getArticleAnalysisStatus(makeArticle({ bias_score: 55 }))).toBe('analyzed');
  });

  it('returns "analyzed" when bias_score is 0', () => {
    expect(getArticleAnalysisStatus(makeArticle({ bias_score: 0 }))).toBe('analyzed');
  });

  it('returns "pending" when bias_score is null and analysis_count is 0', () => {
    expect(getArticleAnalysisStatus(makeArticle({ bias_score: null, analysis_count: 0 }))).toBe('pending');
  });

  it('returns "pending" when bias_score is undefined and analysis_count is 0', () => {
    expect(getArticleAnalysisStatus(makeArticle({ bias_score: undefined, analysis_count: 0 }))).toBe('pending');
  });

  it('returns "pending" when article is null', () => {
    expect(getArticleAnalysisStatus(null)).toBe('pending');
  });

  it('returns "analyzed" when analysis_count > 0 even without bias_score', () => {
    expect(getArticleAnalysisStatus(makeArticle({
      bias_score: undefined,
      analysis_count: 2,
    }))).toBe('analyzed');
  });
});

// ══════════════════════════════════════════════
// 6. buildShareData
// ══════════════════════════════════════════════

describe('buildShareData', () => {
  it('builds share data with title and URL', () => {
    const cluster = makeCluster();
    const result = buildShareData(cluster, 'cluster-1');
    expect(result.title).toContain('總統府召開國安會議');
    expect(result.url).toContain('/event/cluster-1');
    expect(result.text).toBeTruthy();
  });

  it('includes article count and source count in text', () => {
    const cluster = makeCluster({ article_count: 12, source_count: 5 });
    const result = buildShareData(cluster, 'cluster-1');
    expect(result.text).toContain('12');
    expect(result.text).toContain('5');
  });

  it('handles null cluster gracefully', () => {
    const result = buildShareData(null, 'cluster-1');
    expect(result.title).toBe('');
    expect(result.url).toContain('/event/cluster-1');
  });

  it('uses production URL', () => {
    const result = buildShareData(makeCluster(), 'test-id');
    expect(result.url).toContain('powerreader.pages.dev');
  });
});

