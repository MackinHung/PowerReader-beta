/**
 * Tests for analyze-checks.ts, analyze-engine.ts, analyze-result.ts, article-panels.ts
 * These are stub modules — tests verify contract and default behavior.
 */
import { describe, it, expect } from 'vitest';
import { runPreAnalysisChecks } from '../../src/lib/pages/analyze-checks.js';
import { updateStatusUI } from '../../src/lib/pages/analyze-engine.js';
import { renderResultPreview } from '../../src/lib/pages/analyze-result.js';
import { loadClusterPanel } from '../../src/lib/pages/article-panels.js';

describe('runPreAnalysisChecks', () => {
  it('returns canAnalyze=true with no issues (stub)', async () => {
    const result = await runPreAnalysisChecks({ article_id: 'a1', title: 'Test' });
    expect(result.canAnalyze).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns a promise', () => {
    const result = runPreAnalysisChecks({ article_id: 'a2' });
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('updateStatusUI', () => {
  it('does not throw (stub)', () => {
    const el = document.createElement('div');
    expect(() => updateStatusUI(el, 'loading', 100)).not.toThrow();
  });

  it('accepts optional extra param', () => {
    const el = document.createElement('div');
    expect(() => updateStatusUI(el, 'pass1', 500, { eta: 1000, progress: 50 })).not.toThrow();
  });
});

describe('renderResultPreview', () => {
  it('does not throw (stub)', () => {
    const el = document.createElement('div');
    const article = { article_id: 'a1', title: 'T' };
    const result = { bias_score: 50, points: [], reasoning: '', key_phrases: [] };
    expect(() => renderResultPreview(el, article, result)).not.toThrow();
  });
});

describe('loadClusterPanel', () => {
  it('does not throw (stub)', () => {
    const el = document.createElement('div');
    expect(() => loadClusterPanel(el, 'cluster-1')).not.toThrow();
  });
});
