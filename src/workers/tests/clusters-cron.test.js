/**
 * Tests for buildAllClusters in cron-blindspot.js
 *
 * Pre-computes event_clusters from recent articles using title similarity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// D1-compatible mock: prepare(sql) returns { bind(), all(), first(), run() }
function createMockDB(handlers = {}) {
  const calls = [];

  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn(function () {
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

/**
 * Find the statement returned by the first INSERT INTO event_clusters call.
 * Returns the bind args passed to that statement's bind() call.
 */
function getInsertBindArgs(mockDB) {
  for (let i = 0; i < mockDB.prepare.mock.calls.length; i++) {
    const sql = mockDB.prepare.mock.calls[i][0];
    if (sql.includes('INSERT INTO event_clusters')) {
      const stmt = mockDB.prepare.mock.results[i].value;
      return stmt.bind.mock.calls[0];
    }
  }
  return null;
}

describe('buildAllClusters', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('builds clusters from articles with >=2 similar titles', async () => {
    const articles = [
      { article_id: '1', title: '台灣總統府今日重要會議決議', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: 0.5, controversy_level: 'moderate', matched_topic: '政治新聞' },
      { article_id: '2', title: '台灣總統府今日重要會議內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: 0.6, controversy_level: 'moderate', matched_topic: '政治新聞' },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('skips clusters with only 1 article', async () => {
    // Two articles with very different titles → separate clusters of size 1
    const articles = [
      { article_id: '1', title: 'AAAA完全不同主題AAAA', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: 'BBBB另一個話題BBBB', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('computes correct camp_distribution', async () => {
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '某重要政策最新發展報導結果', source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // camp_distribution is at index 4 (0-based) in bind args
    const campDist = JSON.parse(bindArgs[4]);
    // 自由時報→green, 聯合報→blue, 中央社→white
    expect(campDist).toEqual({ green: 1, white: 1, blue: 1 });
  });

  it('computes correct sources_json', async () => {
    const articles = [
      { article_id: '1', title: '國際經濟趨勢最新重要分析報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '國際經濟趨勢最新重要分析內容', source: '自由時報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '國際經濟趨勢最新重要分析結果', source: '聯合報', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // sources_json is at index 5 in bind args
    const sourcesJson = JSON.parse(bindArgs[5]);
    expect(sourcesJson).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '自由時報', count: 2 }),
      expect.objectContaining({ source: '聯合報', count: 1 }),
    ]));
  });

  it('computes avg_controversy_score', async () => {
    const articles = [
      { article_id: '1', title: '爭議法案最新表決結果出爐報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: 0.4, controversy_level: 'moderate', matched_topic: null },
      { article_id: '2', title: '爭議法案最新表決結果出爐分析', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: 0.8, controversy_level: 'high', matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // avg_controversy_score is at index 7
    // (0.4 + 0.8) / 2 = 0.6
    expect(bindArgs[7]).toBeCloseTo(0.6, 5);
  });

  it('finds max_controversy_level', async () => {
    const articles = [
      { article_id: '1', title: '某政策影響最新評估結果分析報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: 0.3, controversy_level: 'low', matched_topic: null },
      { article_id: '2', title: '某政策影響最新評估結果分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: 0.9, controversy_level: 'very_high', matched_topic: null },
      { article_id: '3', title: '某政策影響最新評估結果分析結果', source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: 0.5, controversy_level: 'moderate', matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // max_controversy_level is at index 8
    expect(bindArgs[8]).toBe('very_high');
  });

  it('computes category as majority matched_topic', async () => {
    const articles = [
      { article_id: '1', title: '社會議題最新焦點事件報導分析', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '政治新聞' },
      { article_id: '2', title: '社會議題最新焦點事件報導內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '政治新聞' },
      { article_id: '3', title: '社會議題最新焦點事件報導結果', source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // category is at index 9
    expect(bindArgs[9]).toBe('政治新聞');
  });

  it('detects blindspot type correctly', async () => {
    // All green sources → green_only blindspot
    const articles = [
      { article_id: '1', title: '台灣總統府今日重要會議決議報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '台灣總統府今日重要會議決議內容', source: '三立新聞', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '台灣總統府今日重要會議決議分析', source: '新頭殼', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '台灣總統府今日重要會議決議摘要', source: '匯流新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // blindspot_type is at index 11
    expect(bindArgs[11]).toBe('green_only');
  });

  it('sets is_blindspot = 1 when blindspot detected', async () => {
    // All green sources → green_only blindspot
    const articles = [
      { article_id: '1', title: '台灣總統府今日重要會議決議報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '台灣總統府今日重要會議決議內容', source: '三立新聞', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '台灣總統府今日重要會議決議分析', source: '新頭殼', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '台灣總統府今日重要會議決議摘要', source: '匯流新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // is_blindspot is at index 10
    expect(bindArgs[10]).toBe(1);
  });

  it('handles articles with no controversy data', async () => {
    const articles = [
      { article_id: '1', title: '某重要議題最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要議題最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // avg_controversy_score should be null when no data
    expect(bindArgs[7]).toBeNull();
    // max_controversy_level should be null
    expect(bindArgs[8]).toBeNull();
  });

  it('handles articles with no matched_topic', async () => {
    const articles = [
      { article_id: '1', title: '某重要議題最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要議題最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // category should be null
    expect(bindArgs[9]).toBeNull();
  });

  it('handles empty article list (< 2 articles)', async () => {
    const articles = [
      { article_id: '1', title: 'Only one article', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    // Should return early, no INSERT at all
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('deletes old clusters (>7 days)', async () => {
    const articles = [
      { article_id: '1', title: '某重要議題最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要議題最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const deleteCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('DELETE FROM event_clusters')
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][0]).toContain('-7 days');
  });

  it('UPSERTs into event_clusters (INSERT ON CONFLICT)', async () => {
    const articles = [
      { article_id: '1', title: '某重要議題最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要議題最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    // Verify ON CONFLICT clause exists
    expect(insertCalls[0][0]).toContain('ON CONFLICT(cluster_id) DO UPDATE');
  });

  it('uses source camp fallback when bias_score is null', async () => {
    // All articles from green sources with null bias_score
    const articles = [
      { article_id: '1', title: '台灣總統府今日重要會議決議報導', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '台灣總統府今日重要會議決議內容', source: '三立新聞', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '台灣總統府今日重要會議決議分析', source: '新頭殼', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const bindArgs = getInsertBindArgs(mockDB);
    expect(bindArgs).not.toBeNull();
    // camp_distribution at index 4 — all green sources, so green=3
    const campDist = JSON.parse(bindArgs[4]);
    expect(campDist.green).toBe(3);
    expect(campDist.blue).toBe(0);
    expect(campDist.white).toBe(0);
  });

  it('Union-Find merges transitively: A≈B, B≈C, A≉C → same cluster', async () => {
    // Designed so A↔B share bigrams, B↔C share bigrams, but A↔C do NOT meet threshold.
    // A bigrams: 甲甲,甲乙,乙乙,乙丙,丙丙,丙丁,丁丁 (7)
    // B bigrams: 乙乙,乙丙,丙丙,丙丁,丁丁,丁戊,戊戊 (7)  → A∩B=5, J=5/9≈0.56
    // C bigrams: 丁丁,丁戊,戊戊,戊己,己己,己庚,庚庚 (7)  → B∩C=3, J=3/11≈0.27; A∩C=1, J=1/13≈0.08
    const articles = [
      { article_id: '1', title: '甲甲乙乙丙丙丁丁', summary: null, source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '乙乙丙丙丁丁戊戊', summary: null, source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '丁丁戊戊己己庚庚', summary: null, source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    // All 3 should be in ONE cluster → exactly 1 INSERT with article_count=3
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(1);
    const bindArgs = getInsertBindArgs(mockDB);
    // article_count is at index 2
    expect(bindArgs[2]).toBe(3);
  });

  it('summary boosts clustering when titles differ', async () => {
    // Titles are very different, but summaries share enough content to merge
    const articles = [
      { article_id: '1', title: '甲甲甲甲甲甲甲甲', summary: '政府宣布新能源轉型計畫推動減碳', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '乙乙乙乙乙乙乙乙', summary: '政府宣布新能源轉型計畫加速實施', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    // Titles alone would NOT cluster (zero overlap). Summary overlap should merge them.
    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(1);
  });

  it('falls back to title-only when summary is null', async () => {
    // Similar titles, null summary → should still cluster
    const articles = [
      { article_id: '1', title: '台灣經濟發展最新重要政策分析', summary: null, source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '台灣經濟發展最新重要政策報導', summary: null, source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(1);
  });

  it('time decay: same-day articles cluster normally', async () => {
    // 1 hour apart → decay=1.0, should cluster
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析', summary: null, source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導內容', summary: null, source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(1);
  });

  it('time decay: strong match still clusters after 3 days', async () => {
    // 72h apart → decay≈0.733. rawJaccard needs to be high enough: raw*0.733 >= 0.09
    // These long, similar titles produce rawJaccard well above 0.15
    const articles = [
      { article_id: '1', title: '國際經濟趨勢最新重要分析報導結果', summary: '全球經濟走勢分析報告最新結論', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '國際經濟趨勢最新重要分析報導內容', summary: '全球經濟走勢分析報告最新摘要', source: '聯合報', bias_score: null, published_at: '2026-03-07T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(1);
  });

  it('time decay: weak match splits when days apart', async () => {
    // Borderline pair (rawJaccard ≈ 0.10). Same day → passes (0.10 >= 0.09).
    // 72h apart → 0.10 * 0.733 = 0.073 < 0.09 → should NOT cluster.
    const articles = [
      { article_id: '1', title: '甲甲乙乙丙丙丁丁戊戊己己庚庚', summary: null, source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '辛辛壬壬癸癸子子丑丑寅寅卯卯丁丁戊戊', summary: null, source: '聯合報', bias_score: null, published_at: '2026-03-07T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    // Weak match + time decay → should NOT form a cluster
    expect(insertCalls.length).toBe(0);
  });

  it('time decay: 15-day hard cutoff — identical titles never cluster', async () => {
    // Identical titles (rawJaccard=1.0) but 16 days apart → decay=0 → never cluster
    const articles = [
      { article_id: '1', title: '完全相同的新聞標題用來測試十五天硬切', summary: '完全相同的摘要內容', source: '自由時報', bias_score: null, published_at: '2026-03-20T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '完全相同的新聞標題用來測試十五天硬切', summary: '完全相同的摘要內容', source: '聯合報', bias_score: null, published_at: '2026-03-04T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const insertCalls = mockDB.prepare.mock.calls.filter(c =>
      c[0].includes('INSERT INTO event_clusters')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('queries 4-day window (not 2-day)', async () => {
    const mockDB = createMockDB({
      all: () => ({ results: [] })
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    // Verify the SQL uses 4 days
    const selectCall = mockDB.prepare.mock.calls.find(c =>
      c[0].includes('FROM articles')
    );
    expect(selectCall[0]).toContain('-4 days');
  });
});
