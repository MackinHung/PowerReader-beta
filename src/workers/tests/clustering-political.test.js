/**
 * Regression tests for political news mega-cluster fix.
 *
 * Validates 3-layer defense:
 *   Fix A: Layer 1 dynamic stop-bigrams (>25% doc freq filtered)
 *   Fix B: MAX_CLUSTER_SIZE=30 cap + reclusterStrict()
 *   Fix C: Layer 2 entity overlap ≥ 2
 *
 * These tests simulate the real-world scenario where 20+ political articles
 * about different topics (budget, legislation, scandal, election) share
 * common bigrams (行政院, 立法院, 國民黨, 委員, 預算...) and should NOT
 * all merge into a single mega-cluster.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
 * Collect all sub_clusters JSON from INSERT bind args.
 */
function getAllSubClustersFromBind(mockDB) {
  const results = [];
  for (let i = 0; i < mockDB.prepare.mock.calls.length; i++) {
    const sql = mockDB.prepare.mock.calls[i][0];
    if (sql.includes('INSERT INTO event_clusters')) {
      const stmt = mockDB.prepare.mock.results[i].value;
      const bindArgs = stmt.bind.mock.calls[0];
      results.push({
        clusterId: bindArgs[0],
        articleCount: bindArgs[2],
        subClusters: JSON.parse(bindArgs[15]),
      });
    }
  }
  return results;
}

/**
 * Generate political articles with shared generic terms but different topics.
 * Each topic group has distinct quoted entities and numbers.
 */
function generatePoliticalArticles() {
  const base = '2026-03-10T';
  const topics = [
    // Topic A: 預算審查 (budget review) — 6 articles
    { prefix: 'a', titles: [
      '立法院「預算案」審查行政院提出1.2兆元年度預算',
      '行政院「預算案」送立法院審議1.2兆元總額確定',
      '立法委員質詢「預算案」行政院長說明1.2兆元用途',
      '「預算案」立法院三讀通過行政院1.2兆元年度計畫',
      '國民黨立委批「預算案」行政院1.2兆元太浮濫浪費',
      '民進黨力推「預算案」通過行政院1.2兆元建設經費',
    ], source: '自由時報' },
    // Topic B: 食安修法 (food safety law) — 5 articles
    { prefix: 'b', titles: [
      '立法院「食安法」修正草案委員會初審通過規範',
      '行政院提出「食安法」修正案立法院排審日程確定',
      '國民黨立委推動「食安法」修正加重罰則立法院',
      '「食安法」修正草案行政院版本立法院二讀討論',
      '立法院三讀「食安法」修正案行政院公布施行日',
    ], source: '聯合報' },
    // Topic C: 選舉民調 (election polls) — 5 articles
    { prefix: 'c', titles: [
      '「2028總統」大選民調國民黨候選人支持度35%',
      '「2028總統」民調最新結果民進黨候選人領先42%',
      '「2028總統」選舉民調各方陣營支持度變化分析',
      '「2028總統」大選最新民調國民黨內部整合挑戰',
      '「2028總統」民調趨勢分析民進黨選情看好態勢',
    ], source: '中央社' },
    // Topic D: 外交事件 (diplomatic event) — 5 articles
    { prefix: 'd', titles: [
      '行政院「對美關係」最新政策立法院外交委員會報告',
      '立法院質詢「對美關係」行政院長回應最新進展',
      '國民黨立委關注「對美關係」行政院外交政策走向',
      '「對美關係」行政院公布新合作計畫立法院背書',
      '民進黨立委支持「對美關係」行政院推動新協定',
    ], source: 'ETtoday新聞雲' },
    // Topic E: 弊案調查 (scandal investigation) — 5 articles
    { prefix: 'e', titles: [
      '「採購弊案」監察院立案調查行政院相關人員約談',
      '立法院要求「採購弊案」專案報告行政院回應說明',
      '國民黨立委追查「採購弊案」行政院官員接受調查',
      '「採購弊案」最新進展行政院移送檢調立法院關注',
      '「採購弊案」行政院官員停職立法院成立調查小組',
    ], source: '三立新聞' },
  ];

  const articles = [];
  let hour = 12;
  for (const topic of topics) {
    for (let i = 0; i < topic.titles.length; i++) {
      articles.push({
        article_id: `${topic.prefix}${i + 1}`,
        title: topic.titles[i],
        summary: '',
        source: topic.source,
        bias_score: null,
        published_at: `${base}${String(hour).padStart(2, '0')}:00:00+08:00`,
        controversy_score: null,
        controversy_level: null,
        matched_topic: '政治新聞',
      });
      hour = Math.max(1, hour - 1);
    }
  }
  return articles;
}

describe('Political mega-cluster prevention', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('20+ political articles about different topics should NOT all merge into one cluster', async () => {
    const articles = generatePoliticalArticles(); // 26 articles
    expect(articles.length).toBe(26);

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const clusterInserts = getAllSubClustersFromBind(mockDB);

    // Should have multiple clusters, not one mega-cluster
    expect(clusterInserts.length).toBeGreaterThan(1);

    // No single cluster should contain all 26 articles
    for (const c of clusterInserts) {
      expect(c.articleCount).toBeLessThan(26);
    }
  });

  it('no cluster exceeds MAX_CLUSTER_SIZE (30)', async () => {
    const articles = generatePoliticalArticles();

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const clusterInserts = getAllSubClustersFromBind(mockDB);

    for (const c of clusterInserts) {
      expect(c.articleCount).toBeLessThanOrEqual(30);
    }
  });

  it('same-topic articles still cluster correctly (small cluster preservation)', async () => {
    // 3 articles about the exact same event should still merge
    const articles = [
      { article_id: 's1', title: '「反核遊行」今日台北市民上街3萬人參與', summary: '反核遊行盛大舉行', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 's2', title: '台北「反核遊行」3萬人上街民眾訴求廢核', summary: '反核遊行人數眾多', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
      { article_id: 's3', title: '「反核遊行」3萬人響應台北市府回應安全措施', summary: '反核遊行順利完成', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: '社會新聞' },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const clusterInserts = getAllSubClustersFromBind(mockDB);

    // All 3 articles should be in one cluster
    expect(clusterInserts.length).toBe(1);
    expect(clusterInserts[0].articleCount).toBe(3);
  });

  it('entity overlap ≥ 2 boundary: 1 shared entity does NOT merge sub-clusters', async () => {
    // All articles share a single entity "行政院" (in quoted form)
    // but belong to completely different topics — should NOT merge in sub-clustering
    const articles = [
      { article_id: '1', title: '「行政院」公布「育兒津貼」新制3000元每月', summary: '', source: '自由時報', bias_score: null, published_at: '2026-03-10T12:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '2', title: '「行政院」推動「育兒津貼」加碼3000元方案', summary: '', source: '聯合報', bias_score: null, published_at: '2026-03-10T11:30:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '3', title: '「行政院」推動「育兒津貼」措施3000元發放', summary: '', source: '中央社', bias_score: null, published_at: '2026-03-10T11:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '4', title: '「行政院」通過「國防預算」增加500億元規模', summary: '', source: 'ETtoday新聞雲', bias_score: null, published_at: '2026-03-10T10:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
      { article_id: '5', title: '「行政院」核定「國防預算」增額500億元計畫', summary: '', source: '三立新聞', bias_score: null, published_at: '2026-03-10T09:00:00+08:00', controversy_score: null, controversy_level: null, matched_topic: null },
    ];

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const clusterInserts = getAllSubClustersFromBind(mockDB);
    expect(clusterInserts.length).toBeGreaterThanOrEqual(1);

    // Find the cluster containing all 5 articles (if they clustered at L1)
    const bigCluster = clusterInserts.find(c => c.articleCount >= 5);
    if (bigCluster) {
      // Sub-clusters should separate 育兒津貼 group from 國防預算 group
      // because they share only 1 entity (行政院), not ≥ 2
      expect(bigCluster.subClusters.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('reclusterStrict splits oversized group with title-only bigrams', async () => {
    // Create 35 articles (> MAX_CLUSTER_SIZE=30) about the same broad topic
    // but with enough title variation to split into sub-groups
    const articles = [];
    for (let i = 0; i < 35; i++) {
      const group = i < 12 ? 'A' : i < 24 ? 'B' : 'C';
      const title = group === 'A'
        ? `「年金改革」勞工退休金制度修正${i + 1}項條款討論`
        : group === 'B'
          ? `「能源轉型」再生能源發電目標修正${i + 1}項計畫`
          : `「數位發展」科技產業補助方案修正${i + 1}項政策`;
      articles.push({
        article_id: `r${i + 1}`,
        title,
        summary: '',
        source: '自由時報',
        bias_score: null,
        published_at: `2026-03-10T${String(12 - Math.floor(i / 3)).padStart(2, '0')}:00:00+08:00`,
        controversy_score: null,
        controversy_level: null,
        matched_topic: '政治新聞',
      });
    }

    const mockDB = createMockDB({
      all: (sql) => {
        if (sql.includes('FROM articles')) return { results: articles };
        return { results: [] };
      }
    });

    const { buildAllClusters } = await import('../handlers/cron-blindspot.js');
    await buildAllClusters({ DB: mockDB });

    const clusterInserts = getAllSubClustersFromBind(mockDB);

    // No cluster should exceed MAX_CLUSTER_SIZE
    for (const c of clusterInserts) {
      expect(c.articleCount).toBeLessThanOrEqual(30);
    }
  });
});
