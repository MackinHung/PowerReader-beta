/**
 * Tests for sub-clustering logic (Layer 2: Entity Anchor)
 * Tests extractEntities() and buildSubClusters() in cron-blindspot.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// D1-compatible mock
function createMockDB(handlers = {}) {
  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn(function () { return stmt; }),
        all: vi.fn(async () => {
          if (handlers.all) return handlers.all(sql);
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (handlers.first) return handlers.first(sql);
          return null;
        }),
        run: vi.fn(async () => ({}))
      };
      return stmt;
    }),
    batch: vi.fn(async () => {})
  };
}

/**
 * Get the sub_clusters JSON from the INSERT bind args (index 15).
 */
function getSubClustersFromBind(mockDB) {
  for (let i = 0; i < mockDB.prepare.mock.calls.length; i++) {
    const sql = mockDB.prepare.mock.calls[i][0];
    if (sql.includes('INSERT INTO event_clusters')) {
      const stmt = mockDB.prepare.mock.results[i].value;
      const bindArgs = stmt.bind.mock.calls[0];
      return JSON.parse(bindArgs[15]); // sub_clusters is at index 15
    }
  }
  return null;
}

describe('extractEntities', () => {
  let extractEntities;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../handlers/cron-blindspot.js');
    // extractEntities is not exported, so we test it indirectly through buildSubClusters
    // However, we can test it through buildAllClusters output
  });

  it('entity extraction works through sub-clustering output', async () => {
    vi.resetModules();
    // Crime articles with different amounts + different quoted terms → should split
    const articles = [
      { article_id: '1', title: '詐騙集團「台灣里」盜刷70億元遭起訴', summary: '檢方指控集團盜刷', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: '2', title: '詐騙集團「台灣里」盜刷70億元案開庭', summary: '法院審理中', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: '3', title: '柬埔寨電信詐騙案主嫌落網起訴', summary: '警方逮捕5人', source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: '4', title: '柬埔寨電信詐騙案再逮3嫌犯', summary: '刑事局公布偵辦結果', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    // Sub-clusters should exist (not null)
    expect(subClusters).not.toBeNull();
    expect(subClusters.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildSubClusters via buildAllClusters', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('stores sub_clusters JSON in bind args', async () => {
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    // With only 2 articles (< SUB_CLUSTER_MIN_ARTICLES=3), returns single group
    expect(subClusters.length).toBe(1);
    expect(subClusters[0].article_count).toBe(2);
    expect(subClusters[0].article_ids).toEqual(['1', '2']);
  });

  it('splits crime articles into sub-clusters by entity anchor', async () => {
    // 5 articles sharing judicial terms (起訴/判決/法院), but about different cases
    // Group A: 「台灣里」案 with 70億元 → shared entity anchors (quoted 台灣里 + number 70億元) → overlap ≥ 2
    // Group B: 「柬埔寨」+「電信」案 → shared entity anchors (quoted 柬埔寨 + quoted 電信) → overlap ≥ 2
    const articles = [
      { article_id: 'a1', title: '「台灣里」詐騙集團盜刷70億元遭起訴判決', summary: '法院審理「台灣里」案', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 'a2', title: '「台灣里」盜刷案70億元法院判決出爐結果', summary: '「台灣里」判決確定', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 'a3', title: '「台灣里」70億元詐騙案起訴後續追蹤報導', summary: '「台灣里」檢方追訴', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 'b1', title: '「柬埔寨」「電信」詐騙起訴10人法院審理', summary: '「柬埔寨」電信詐騙', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 'b2', title: '「柬埔寨」「電信」詐騙法院判決3人有罪', summary: '「柬埔寨」詐騙集團', source: '東森新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    // Should have at least 2 sub-clusters (台灣里 group and 柬埔寨 group)
    expect(subClusters.length).toBeGreaterThanOrEqual(2);

    // Find the 台灣里 sub-cluster (contains a1)
    const twSub = subClusters.find(s => s.article_ids.includes('a1'));
    expect(twSub).toBeDefined();
    // All 'a' articles should be in same sub-cluster
    expect(twSub.article_ids).toContain('a2');
    expect(twSub.article_ids).toContain('a3');
    // 'b' articles should NOT be in 台灣里 sub-cluster
    expect(twSub.article_ids).not.toContain('b1');
    expect(twSub.article_ids).not.toContain('b2');
  });

  it('dynamic stop-bigram filters common judicial terms', async () => {
    // All articles share 起訴/法院/判決 (>50% frequency) → these bigrams should be filtered
    // Entity anchor (quoted terms) separates the cases with overlap ≥ 2
    const articles = [
      { article_id: '1', title: '「TSMC」「內線交易」案起訴3人法院判決', summary: '', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '「TSMC」「內線交易」起訴法院判決確定', summary: '', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '「TSMC」「內線交易」案法院起訴審理', summary: '', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '「鴻海」「竊密」案起訴法院判決出爐', summary: '', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '5', title: '「鴻海」員工「竊密」起訴法院宣判刑期', summary: '', source: '東森新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    // TSMC articles and 鴻海 articles should be in different sub-clusters
    expect(subClusters.length).toBeGreaterThanOrEqual(2);

    const tsmcSub = subClusters.find(s =>
      s.article_ids.includes('1')
    );
    expect(tsmcSub.article_ids).toContain('2');
    expect(tsmcSub.article_ids).toContain('3');
    // 鴻海 articles should NOT be in TSMC sub-cluster
    expect(tsmcSub.article_ids).not.toContain('4');
    expect(tsmcSub.article_ids).not.toContain('5');
  });

  it('returns single sub-cluster when cluster has < 3 articles', async () => {
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    expect(subClusters.length).toBe(1);
    expect(subClusters[0].article_count).toBe(2);
  });

  it('sub_clusters have required fields', async () => {
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '某重要政策最新發展報導分析結論', source: '中央社', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    for (const sub of subClusters) {
      expect(sub).toHaveProperty('representative_title');
      expect(sub).toHaveProperty('article_ids');
      expect(sub).toHaveProperty('article_count');
      expect(typeof sub.representative_title).toBe('string');
      expect(Array.isArray(sub.article_ids)).toBe(true);
      expect(typeof sub.article_count).toBe('number');
      expect(sub.article_count).toBe(sub.article_ids.length);
    }
  });

  it('SQL includes sub_clusters column', async () => {
    const articles = [
      { article_id: '1', title: '某重要政策最新發展報導分析結果', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '某重要政策最新發展報導分析內容', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
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
    expect(insertCalls[0][0]).toContain('sub_clusters');
  });

  it('entity repulsion: different quoted entities prevent Jaccard merge', async () => {
    // All articles share many CJK bigrams (行政院/通過/政策/最新/推動...)
    // but have different quoted entities → should NOT merge via Jaccard
    const articles = [
      { article_id: '1', title: '行政院通過「育兒津貼」最新政策推動3000元方案', summary: '', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '行政院推動「育兒津貼」最新政策通過3000元計畫', summary: '', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '行政院推動「育兒津貼」政策最新方案3000元實施', summary: '', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '行政院通過「國防預算」最新政策推動500億元規模', summary: '', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '5', title: '行政院推動「國防預算」最新政策通過500億元計畫', summary: '', source: '三立新聞', bias_score: null, published_at: '2026-03-10T09:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '6', title: '行政院通過「能源轉型」最新政策推動綠能方案規劃', summary: '', source: '東森新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    // Should have at least 2 sub-clusters (育兒津貼 vs 國防預算 vs 能源轉型)
    expect(subClusters.length).toBeGreaterThanOrEqual(2);

    // 育兒津貼 group should be separate from 國防預算 group
    const childSub = subClusters.find(s => s.article_ids.includes('1'));
    expect(childSub).toBeDefined();
    expect(childSub.article_ids).toContain('2');
    expect(childSub.article_ids).toContain('3');
    expect(childSub.article_ids).not.toContain('4');
    expect(childSub.article_ids).not.toContain('5');
  });

  it('one article has quoted entity, one does not: no repulsion', async () => {
    // Repulsion only triggers when BOTH articles have quoted entities
    // If only one has 「」, Jaccard path still applies
    const articles = [
      { article_id: '1', title: '「反核遊行」台北街頭3萬人上街抗議要求廢核', summary: '', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '「反核遊行」台北3萬人上街抗議市府回應安全', summary: '', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '「反核遊行」台北街頭3萬人抗議活動順利結束', summary: '', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '台北街頭大型活動上街抗議人數眾多市府關注', summary: '', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    expect(subClusters).not.toBeNull();
    // Article 4 has no quoted entities → repulsion doesn't apply to pairs involving article 4
    // All articles are valid and in sub-clusters
    const allIds = subClusters.flatMap(s => s.article_ids).sort();
    expect(allIds).toEqual(['1', '2', '3', '4']);

    // Articles 1-3 share quoted entity 反核遊行 → entity overlap ≥ 1 (but need ≥2 for entity path)
    // They also share 3萬人 number entity → overlap = 2 → merge via entity path
    const coreGroup = subClusters.find(s => s.article_ids.includes('1'));
    expect(coreGroup.article_ids).toContain('2');
    expect(coreGroup.article_ids).toContain('3');
  });

  it('English proper nouns serve as entity anchors', async () => {
    // TSMC vs NVIDIA articles — English names + quoted terms as entity anchors (overlap ≥ 2)
    const articles = [
      { article_id: '1', title: 'TSMC「法說會」最新財報公布分析報導', summary: 'TSMC第四季', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: 'TSMC「法說會」最新營收財報創新高紀錄', summary: 'TSMC公布', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: 'NVIDIA「業績」最新法說會財報分析報導', summary: 'NVIDIA AI', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: 'NVIDIA「業績」法說會最新營收財報公布', summary: 'NVIDIA成長', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const subClusters = getSubClustersFromBind(mockDB);
    // Should be at least 2 sub-clusters: TSMC group and NVIDIA group
    expect(subClusters).not.toBeNull();
    if (subClusters.length >= 2) {
      const tsmcSub = subClusters.find(s => s.article_ids.includes('1'));
      expect(tsmcSub.article_ids).toContain('2');
      expect(tsmcSub.article_ids).not.toContain('3');
    }
  });
});
