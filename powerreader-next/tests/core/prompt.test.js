/**
 * Unit tests for prompt.js
 *
 * Covers: assembleScoreSystemPrompt, assembleNarrativeSystemPrompt,
 *         assembleUserMessage, formatKnowledgeAsL2
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { describe, it, expect } from 'vitest';
import {
  assembleScoreSystemPrompt,
  assembleNarrativeSystemPrompt,
  assembleUserMessage,
  formatKnowledgeAsL2
} from '../../src/lib/core/prompt.js';

// ---------------------------------------------------------------------------
// assembleScoreSystemPrompt
// ---------------------------------------------------------------------------
describe('assembleScoreSystemPrompt', () => {
  it('returns a string', () => {
    const result = assembleScoreSystemPrompt();
    expect(typeof result).toBe('string');
  });

  it('contains "bias_score"', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('bias_score');
  });

  it('contains "controversy_score"', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('controversy_score');
  });

  it('contains "camp_ratio"', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('camp_ratio');
  });

  it('contains political spectrum definition with green end (0)', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('0=');
    expect(result).toMatch(/綠/);
  });

  it('contains political spectrum definition with blue end (100)', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('100=');
    expect(result).toMatch(/藍/);
  });

  it('contains 50 as center (neutral/TPP)', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('50=');
    expect(result).toMatch(/中立/);
  });

  it('contains all camp_ratio keys (green, white, blue, gray)', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toContain('green=');
    expect(result).toContain('white=');
    expect(result).toContain('blue=');
    expect(result).toContain('gray=');
  });

  it('instructs JSON-only output', () => {
    const result = assembleScoreSystemPrompt();
    expect(result).toMatch(/只輸出JSON/);
  });

  it('returns the same value on repeated calls (pure function)', () => {
    const a = assembleScoreSystemPrompt();
    const b = assembleScoreSystemPrompt();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// assembleNarrativeSystemPrompt
// ---------------------------------------------------------------------------
describe('assembleNarrativeSystemPrompt', () => {
  it('returns a string', () => {
    const result = assembleNarrativeSystemPrompt(75, 60);
    expect(typeof result).toBe('string');
  });

  it('embeds biasScore in the output', () => {
    const result = assembleNarrativeSystemPrompt(75, 60);
    expect(result).toContain('75');
  });

  it('embeds controversyScore in the output', () => {
    const result = assembleNarrativeSystemPrompt(75, 60);
    expect(result).toContain('60');
  });

  it('contains "bias_score=" with the provided value', () => {
    const result = assembleNarrativeSystemPrompt(42, 88);
    expect(result).toContain('bias_score=42');
    expect(result).toContain('controversy_score=88');
  });

  it('contains "points" in the output schema', () => {
    const result = assembleNarrativeSystemPrompt(50, 50);
    expect(result).toContain('points');
  });

  it('contains "key_phrases" in the output schema', () => {
    const result = assembleNarrativeSystemPrompt(50, 50);
    expect(result).toContain('key_phrases');
  });

  it('instructs JSON-only output', () => {
    const result = assembleNarrativeSystemPrompt(50, 50);
    expect(result).toMatch(/只輸出JSON/);
  });

  it('handles zero scores', () => {
    const result = assembleNarrativeSystemPrompt(0, 0);
    expect(result).toContain('bias_score=0');
    expect(result).toContain('controversy_score=0');
  });

  it('handles boundary score 100', () => {
    const result = assembleNarrativeSystemPrompt(100, 100);
    expect(result).toContain('bias_score=100');
    expect(result).toContain('controversy_score=100');
  });
});

// ---------------------------------------------------------------------------
// formatKnowledgeAsL2
// ---------------------------------------------------------------------------
describe('formatKnowledgeAsL2', () => {
  it('returns empty string for empty array', () => {
    expect(formatKnowledgeAsL2([])).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatKnowledgeAsL2(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatKnowledgeAsL2(undefined)).toBe('');
  });

  it('returns empty string for non-array input', () => {
    expect(formatKnowledgeAsL2('not an array')).toBe('');
    expect(formatKnowledgeAsL2(42)).toBe('');
    expect(formatKnowledgeAsL2({})).toBe('');
  });

  it('formats politician type as [人物]', () => {
    const entries = [{ type: 'politician', content: '蔡英文' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[人物]');
    expect(result).toContain('蔡英文');
  });

  it('formats topic type as [議題]', () => {
    const entries = [{ type: 'topic', title: '兩岸關係', description: '兩岸關係摘要' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[議題]');
    expect(result).toContain('兩岸關係');
  });

  it('formats term type as [名詞]', () => {
    const entries = [{ type: 'term', content: 'GDP' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[名詞]');
    expect(result).toContain('GDP');
  });

  it('formats event type as [事件]', () => {
    const entries = [{ type: 'event', content: '太陽花學運' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[事件]');
    expect(result).toContain('太陽花學運');
  });

  it('formats media type as [媒體]', () => {
    const entries = [{ type: 'media', content: '自由時報' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[媒體]');
    expect(result).toContain('自由時報');
  });

  it('uses type itself for unknown types', () => {
    const entries = [{ type: 'custom_type', content: 'test content' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[custom_type]');
    expect(result).toContain('test content');
  });

  it('uses "其他" when type is missing (undefined)', () => {
    const entries = [{ content: 'some content' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[其他]');
    expect(result).toContain('some content');
  });

  it('uses "其他" when type is empty string', () => {
    const entries = [{ type: '', content: 'data' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[其他]');
  });

  it('falls back to title when content is missing for figure type', () => {
    const entries = [{ type: 'politician', title: '摘要人物' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('摘要人物');
  });

  it('falls back to title when content and snippet are missing', () => {
    const entries = [{ type: 'topic', title: '議題標題' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('議題標題');
  });

  it('uses empty string when content, snippet, and title are all missing', () => {
    const entries = [{ type: 'term' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('[名詞] ');
  });

  it('formats multiple entries with line breaks', () => {
    const entries = [
      { type: 'politician', content: '賴清德' },
      { type: 'topic', title: '能源政策' },
      { type: 'event', title: '立法院衝突', content: '立法院衝突' }
    ];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('- [人物] 賴清德');
    expect(result).toContain('- [議題] 能源政策');
    expect(result).toContain('- [事件] 立法院衝突');
  });

  it('starts with [背景知識] header', () => {
    const entries = [{ type: 'politician', content: 'test' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toMatch(/^\[背景知識\]/);
  });

  it('includes instruction text about relevance filtering', () => {
    const entries = [{ type: 'politician', content: 'test' }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('自行判斷哪些與本文直接相關');
  });

  it('prefers content over snippet over title', () => {
    const entries = [{
      type: 'politician',
      content: 'from_content',
      snippet: 'from_snippet',
      title: 'from_title'
    }];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('from_content');
    expect(result).not.toContain('from_snippet');
    expect(result).not.toContain('from_title');
  });

  // ── Score filtering ──

  it('filters out entries with score = 0', () => {
    const entries = [
      { type: 'politician', content: '蔡英文', score: 0.85 },
      { type: 'topic', content: '兩岸關係', score: 0 }
    ];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('蔡英文');
    expect(result).not.toContain('兩岸關係');
  });

  it('returns empty string when all entries have score = 0', () => {
    const entries = [
      { type: 'politician', content: 'A', score: 0 },
      { type: 'topic', content: 'B', score: 0 }
    ];
    expect(formatKnowledgeAsL2(entries)).toBe('');
  });

  it('keeps entries without score field (backward compat)', () => {
    const entries = [
      { type: 'politician', content: '無分數條目' }
    ];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('無分數條目');
  });

  it('keeps entries with score > 0 and filters score = 0 in mixed list', () => {
    const entries = [
      { type: 'politician', content: 'A', score: 0.7 },
      { type: 'topic', title: 'B' },              // no score → keep
      { type: 'term', content: 'C', score: 0 },   // zero → filter
      { type: 'event', title: 'D', content: 'D', score: 0.01 }
    ];
    const result = formatKnowledgeAsL2(entries);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).not.toContain('[名詞] C');
    expect(result).toContain('D');
  });
});

// ---------------------------------------------------------------------------
// assembleUserMessage
// ---------------------------------------------------------------------------
describe('assembleUserMessage', () => {
  const baseArticle = {
    title: '測試標題',
    summary: '測試摘要',
    content_markdown: '測試內容',
    source: 'liberty_times',
    author: '記者王大明',
    published_at: '2026-03-09T10:00:00+08:00'
  };

  it('returns L3 only when knowledge entries are empty', () => {
    const result = assembleUserMessage(baseArticle, []);
    // Should NOT contain [背景知識] header
    expect(result).not.toContain('[背景知識]');
    // Should contain article JSON
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('測試標題');
    expect(parsed.summary).toBe('測試摘要');
    expect(parsed.content_markdown).toBe('測試內容');
    expect(parsed.source).toBe('liberty_times');
    expect(parsed.author).toBe('記者王大明');
    expect(parsed.published_at).toBe('2026-03-09T10:00:00+08:00');
  });

  it('returns L2 + L3 when knowledge entries are provided', () => {
    const entries = [{ type: 'politician', content: '蔡英文' }];
    const result = assembleUserMessage(baseArticle, entries);
    // Should contain L2 header
    expect(result).toContain('[背景知識]');
    expect(result).toContain('[人物] 蔡英文');
    // Should contain article JSON after the L2 section
    expect(result).toContain('"title":"測試標題"');
  });

  it('truncates content_markdown to 8400 characters', () => {
    const longContent = 'A'.repeat(10000);
    const article = { ...baseArticle, content_markdown: longContent };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.content_markdown).toHaveLength(8400);
    expect(parsed.content_markdown).toBe('A'.repeat(8400));
  });

  it('does not truncate content_markdown shorter than 8400', () => {
    const shortContent = 'B'.repeat(100);
    const article = { ...baseArticle, content_markdown: shortContent };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.content_markdown).toHaveLength(100);
  });

  it('uses empty string for missing title', () => {
    const article = { ...baseArticle, title: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('');
  });

  it('uses empty string for missing summary', () => {
    const article = { ...baseArticle, summary: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBe('');
  });

  it('uses empty string for missing content_markdown', () => {
    const article = { ...baseArticle, content_markdown: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.content_markdown).toBe('');
  });

  it('uses empty string for missing source', () => {
    const article = { ...baseArticle, source: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.source).toBe('');
  });

  it('uses null for missing author', () => {
    const article = { ...baseArticle, author: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.author).toBeNull();
  });

  it('uses empty string for missing published_at', () => {
    const article = { ...baseArticle, published_at: undefined };
    const result = assembleUserMessage(article, []);
    const parsed = JSON.parse(result);
    expect(parsed.published_at).toBe('');
  });

  it('handles completely empty article object', () => {
    const result = assembleUserMessage({}, []);
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('');
    expect(parsed.summary).toBe('');
    expect(parsed.content_markdown).toBe('');
    expect(parsed.source).toBe('');
    expect(parsed.author).toBeNull();
    expect(parsed.published_at).toBe('');
  });

  it('separates L2 and L3 with double newline', () => {
    const entries = [{ type: 'term', content: 'test' }];
    const result = assembleUserMessage(baseArticle, entries);
    // L2 ends before the double newline, L3 (JSON) starts after
    expect(result).toContain('\n\n{');
  });

  it('returns only L3 when knowledgeEntries is null', () => {
    const result = assembleUserMessage(baseArticle, null);
    // formatKnowledgeAsL2(null) returns '' which is falsy, so only L3
    expect(result).not.toContain('[背景知識]');
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('測試標題');
  });

  it('returns only L3 when knowledgeEntries is undefined', () => {
    const result = assembleUserMessage(baseArticle, undefined);
    expect(result).not.toContain('[背景知識]');
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('測試標題');
  });

  it('produces valid JSON in the L3 portion with knowledge entries', () => {
    const entries = [
      { type: 'politician', content: '柯文哲' },
      { type: 'topic', content: '少子化' }
    ];
    const result = assembleUserMessage(baseArticle, entries);
    // Extract JSON portion (after the double newline following L2)
    const jsonPart = result.substring(result.lastIndexOf('{'));
    const parsed = JSON.parse(jsonPart);
    expect(parsed.title).toBe('測試標題');
  });

  it('does not mutate the original article object', () => {
    const article = {
      title: 'original',
      summary: 'original',
      content_markdown: 'A'.repeat(10000),
      source: 'original',
      author: 'original',
      published_at: 'original'
    };
    const originalContent = article.content_markdown;
    assembleUserMessage(article, []);
    expect(article.content_markdown).toBe(originalContent);
    expect(article.content_markdown).toHaveLength(10000);
  });
});
