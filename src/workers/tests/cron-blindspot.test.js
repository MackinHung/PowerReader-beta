/**
 * Tests for cron-blindspot.js — blindspot detection + source tendency
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// D1-compatible mock: prepare(sql) returns { bind(), all(), first(), run() }
function createMockDB(handlers = {}) {
  const calls = [];

  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn(function () {
          // bind() returns the same statement-like object
          return stmt;
        }),
        all: vi.fn(async () => {
          calls.push({ sql, method: 'all' });
          if (handlers.all) return handlers.all(sql);
          return { results: [] };
        }),
        first: vi.fn(async () => {
          calls.push({ sql, method: 'first' });
          if (handlers.first) return handlers.first(sql);
          return null;
        }),
        run: vi.fn(async () => {
          calls.push({ sql, method: 'run' });
          return {};
        })
      };
      return stmt;
    }),
    batch: vi.fn(async () => {}),
    _calls: calls
  };
}

describe('cron-blindspot source camp mapping', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('scanBlindspots uses source camp when bias_score is null', async () => {
    // 4 articles from green sources with similar titles → should cluster → green_only
    const articles = [
      { article_id: '1', title: '台灣總統府今日重要會議', source: '自由時報', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '2', title: '台灣總統府今日重要會議內容', source: '三立新聞', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '3', title: '台灣總統府今日重要會議決議', source: '新頭殼', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '4', title: '台灣總統府今日重要會議摘要', source: '匯流新聞', bias_score: null, published_at: new Date().toISOString() },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { scanBlindspots } = await import('../handlers/cron-blindspot.js');
    await scanBlindspots({ DB: mockDB });

    // Should have attempted INSERT for a blindspot event (all green sources → green_only)
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO blindspot_events')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('bias_score takes priority over source camp when available', async () => {
    // Articles from green source but with high bias_score (blue) → blue camp
    const articles = [
      { article_id: '1', title: '某重要議題相關新聞報導分析', source: '自由時報', bias_score: 70, published_at: new Date().toISOString() },
      { article_id: '2', title: '某重要議題相關新聞報導分析內容', source: '自由時報', bias_score: 75, published_at: new Date().toISOString() },
      { article_id: '3', title: '某重要議題相關新聞報導分析結果', source: '自由時報', bias_score: 80, published_at: new Date().toISOString() },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { scanBlindspots } = await import('../handlers/cron-blindspot.js');
    await scanBlindspots({ DB: mockDB });

    // bias_score ≥ 60 → blue camp (overrides green source mapping)
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO blindspot_events')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('returns no blindspot for balanced coverage', async () => {
    // 1 green + 1 white + 1 blue → balanced, no blindspot
    const articles = [
      { article_id: '1', title: '重要政治議題最新重大發展', source: '自由時報', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '2', title: '重要政治議題最新重大發展報導', source: '中央社', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '3', title: '重要政治議題最新重大發展分析', source: '聯合報', bias_score: null, published_at: new Date().toISOString() },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { scanBlindspots } = await import('../handlers/cron-blindspot.js');
    await scanBlindspots({ DB: mockDB });

    // green=1, white=1, blue=1 → balanced, no blindspot
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO blindspot_events')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('handles unknown source gracefully', async () => {
    const articles = [
      { article_id: '1', title: '某新聞事件完整報導內容分析', source: '未知媒體A', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '2', title: '某新聞事件完整報導內容分析一', source: '未知媒體B', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '3', title: '某新聞事件完整報導內容分析二', source: '未知媒體C', bias_score: null, published_at: new Date().toISOString() },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { scanBlindspots } = await import('../handlers/cron-blindspot.js');
    // Should not throw
    await scanBlindspots({ DB: mockDB });

    // Unknown sources skipped → campCounts all 0 → no blindspot
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO blindspot_events')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('white_missing detected when no neutral source in cluster', async () => {
    // All articles from green + blue sources, no white → white_missing
    const articles = [
      { article_id: '1', title: '爭議法案表決結果出爐最新', source: '自由時報', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '2', title: '爭議法案表決結果出爐報導', source: '三立新聞', bias_score: null, published_at: new Date().toISOString() },
      { article_id: '3', title: '爭議法案表決結果出爐分析', source: '聯合報', bias_score: null, published_at: new Date().toISOString() },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { scanBlindspots } = await import('../handlers/cron-blindspot.js');
    await scanBlindspots({ DB: mockDB });

    // green=2, white=0, blue=1, total=3 → white_missing
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO blindspot_events')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });
});
