/**
 * Unit tests for clusters handlers
 *
 * GET /api/v1/clusters            — list pre-computed event clusters
 * GET /api/v1/clusters/:cluster_id — cluster detail with articles
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/utils.js', () => ({
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
}));

import { getClusters, getClusterDetail } from '../handlers/clusters.js';
import { escapeHtml } from '../../../shared/utils.js';

// ── Helpers ────────────────────────────────────────────

/**
 * Creates a mock env where each prepare() call returns an independent chain.
 * Use setupChains to configure sequential prepare() calls with their results.
 */
function createMockEnv() {
  const prepareChains = [];
  let prepareIndex = 0;

  const mockPrepare = vi.fn().mockImplementation(() => {
    const chain = prepareChains[prepareIndex++];
    if (!chain) {
      return { bind: vi.fn().mockReturnValue({ first: vi.fn(), all: vi.fn(), run: vi.fn() }) };
    }
    return chain.prepareResult;
  });

  return {
    DB: { prepare: mockPrepare },
    _prepare: mockPrepare,
    _chains: prepareChains,
    setupChains(configs) {
      prepareIndex = 0;
      prepareChains.length = 0;
      for (const config of configs) {
        const boundResult = {
          first: config.first !== undefined ? vi.fn().mockResolvedValue(config.first) : vi.fn(),
          all: config.all !== undefined ? vi.fn().mockResolvedValue(config.all) : vi.fn(),
          run: config.run !== undefined ? vi.fn().mockResolvedValue(config.run) : vi.fn(),
        };
        const mockBind = vi.fn().mockReturnValue(boundResult);
        // prepareResult supports both .bind().all() and direct .all() (no bind)
        prepareChains.push({
          prepareResult: { bind: mockBind, ...boundResult },
          bind: mockBind,
        });
      }
    },
  };
}

function createUrl(queryString = '') {
  return new URL(`https://example.com/api/v1/clusters${queryString}`);
}

// ══════════════════════════════════════════════════════
// GET /api/v1/clusters
// ══════════════════════════════════════════════════════

describe('getClusters', () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it('returns list of clusters with correct fields', async () => {
    env.setupChains([
      // count query
      { first: { total: 1 } },
      // data query
      { all: { results: [
        {
          cluster_id: 'ec_abc',
          representative_title: 'Major Political Event',
          article_count: 5,
          source_count: 3,
          camp_distribution: '{"green":3,"white":1,"blue":1}',
          sources_json: '[{"source":"自由時報","camp":"green","count":3}]',
          article_ids: '["a1","a2","a3","a4","a5"]',
          avg_controversy_score: 0.72,
          max_controversy_level: 'high',
          category: '政治新聞',
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      // unclustered: all cluster article_ids query
      { all: { results: [{ article_ids: '["a1","a2","a3","a4","a5"]' }] } },
      // unclustered: recent articles query
      { all: { results: [{ article_id: 'a1' }, { article_id: 'a6' }] } },
    ]);

    const url = createUrl();
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.clusters).toHaveLength(1);

    const c = result.body.data.clusters[0];
    expect(c.cluster_id).toBe('ec_abc');
    expect(c.representative_title).toBe('Major Political Event');
    expect(c.article_count).toBe(5);
    expect(c.source_count).toBe(3);
    expect(c.camp_distribution).toEqual({ green: 3, white: 1, blue: 1 });
    expect(c.sources_json).toEqual([{ source: '自由時報', camp: 'green', count: 3 }]);
    expect(c.article_ids).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    expect(c.avg_controversy_score).toBe(0.72);
    expect(c.max_controversy_level).toBe('high');
    expect(c.category).toBe('政治新聞');
    expect(c.is_blindspot).toBe(false);
    expect(c.blindspot_type).toBeNull();
    expect(c.missing_camp).toBeNull();
    expect(result.body.data.pagination.total).toBe(1);
  });

  it('supports pagination with page and limit', async () => {
    env.setupChains([
      { first: { total: 50 } },
      { all: { results: [
        {
          cluster_id: 'ec_p2',
          representative_title: 'Page 2 Cluster',
          article_count: 3,
          source_count: 2,
          camp_distribution: '{"green":1,"white":1,"blue":1}',
          sources_json: '[]',
          article_ids: '["a10"]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl('?page=2&limit=10');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.pagination.page).toBe(2);
    expect(result.body.data.pagination.limit).toBe(10);
    expect(result.body.data.pagination.total).toBe(50);
    expect(result.body.data.pagination.total_pages).toBe(5);

    // Verify offset = (2-1)*10 = 10 was bound for data query
    const dataBindArgs = env._chains[1].bind.mock.calls[0];
    expect(dataBindArgs).toContain(10); // limit
    expect(dataBindArgs).toContain(10); // offset
  });

  it('filters by category', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'ec_pol',
          representative_title: 'Political Cluster',
          article_count: 4,
          source_count: 2,
          camp_distribution: '{"green":2,"white":1,"blue":1}',
          sources_json: '[]',
          article_ids: '["a1"]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: '政治新聞',
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      // unclustered queries (page 1)
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?category=政治新聞');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.clusters).toHaveLength(1);
    expect(result.body.data.clusters[0].category).toBe('政治新聞');

    // Verify WHERE clause includes category filter
    const countPrepareCall = env._prepare.mock.calls[0][0];
    expect(countPrepareCall).toContain('category = ?');
  });

  it('ignores "all" category (no filter applied)', async () => {
    env.setupChains([
      { first: { total: 5 } },
      { all: { results: [] } },
      // unclustered queries (page 1)
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?category=all');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);

    // No WHERE clause for 'all' category
    const countPrepareCall = env._prepare.mock.calls[0][0];
    expect(countPrepareCall).not.toContain('category = ?');
  });

  it('returns empty results successfully', async () => {
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
      // unclustered queries (page 1)
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl();
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.clusters).toHaveLength(0);
    expect(result.body.data.pagination.total).toBe(0);
    expect(result.body.data.pagination.total_pages).toBe(0);
  });

  it('handles malformed camp_distribution JSON gracefully', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'ec_bad',
          representative_title: 'Bad JSON',
          article_count: 2,
          source_count: 1,
          camp_distribution: 'not-valid-json',
          sources_json: '[]',
          article_ids: '[]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl();
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.clusters[0].camp_distribution).toEqual({ green: 0, white: 0, blue: 0 });
  });

  it('handles malformed sources_json JSON gracefully', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'ec_badsrc',
          representative_title: 'Bad Sources',
          article_count: 2,
          source_count: 1,
          camp_distribution: '{"green":1,"white":0,"blue":0}',
          sources_json: '{invalid}',
          article_ids: '[]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl();
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.clusters[0].sources_json).toEqual([]);
  });

  it('escapes HTML in representative_title', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'ec_xss',
          representative_title: '<script>xss</script>',
          article_count: 2,
          source_count: 1,
          camp_distribution: '{"green":1,"white":0,"blue":0}',
          sources_json: '[]',
          article_ids: '[]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl();
    await getClusters({}, env, {}, { url });

    expect(escapeHtml).toHaveBeenCalledWith('<script>xss</script>');
  });

  it('returns unclustered article IDs on page 1', async () => {
    env.setupChains([
      // count
      { first: { total: 1 } },
      // clusters
      { all: { results: [
        {
          cluster_id: 'ec_1',
          representative_title: 'Cluster 1',
          article_count: 2,
          source_count: 1,
          camp_distribution: '{"green":1,"white":1,"blue":0}',
          sources_json: '[]',
          article_ids: '["a1","a2"]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      // all cluster article_ids
      { all: { results: [{ article_ids: '["a1","a2"]' }] } },
      // recent articles
      { all: { results: [{ article_id: 'a1' }, { article_id: 'a3' }, { article_id: 'a4' }] } },
    ]);

    const url = createUrl('?page=1');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    // a1 is clustered, so only a3 and a4 should be unclustered
    expect(result.body.data.unclustered_article_ids).toEqual(['a3', 'a4']);
  });

  it('does NOT return unclustered article IDs on page 2+', async () => {
    env.setupChains([
      { first: { total: 30 } },
      { all: { results: [
        {
          cluster_id: 'ec_p2',
          representative_title: 'Page 2',
          article_count: 2,
          source_count: 1,
          camp_distribution: '{"green":1,"white":0,"blue":1}',
          sources_json: '[]',
          article_ids: '["a10"]',
          avg_controversy_score: null,
          max_controversy_level: null,
          category: null,
          is_blindspot: 0,
          blindspot_type: null,
          missing_camp: null,
          earliest_published_at: '2026-03-09T08:00:00+08:00',
          latest_published_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
      // No unclustered queries expected on page 2+
    ]);

    const url = createUrl('?page=2');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.unclustered_article_ids).toEqual([]);
    // Only 2 prepare calls (count + data), no unclustered queries
    expect(env._prepare).toHaveBeenCalledTimes(2);
  });

  it('clamps limit to max 50', async () => {
    env.setupChains([
      { first: { total: 100 } },
      { all: { results: [] } },
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?limit=999');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.pagination.limit).toBe(50);

    // Verify limit=50 was bound (not 999)
    const dataBindArgs = env._chains[1].bind.mock.calls[0];
    expect(dataBindArgs).toContain(50);
  });

  it('returns correct total_pages calculation', async () => {
    env.setupChains([
      { first: { total: 55 } },
      { all: { results: [] } },
      { all: { results: [] } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?limit=20');
    const result = await getClusters({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.pagination.total).toBe(55);
    expect(result.body.data.pagination.limit).toBe(20);
    // ceil(55/20) = 3
    expect(result.body.data.pagination.total_pages).toBe(3);
  });
});

// ══════════════════════════════════════════════════════
// GET /api/v1/clusters/:cluster_id
// ══════════════════════════════════════════════════════

describe('getClusterDetail', () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it('returns cluster detail with articles', async () => {
    env.setupChains([
      // cluster lookup
      { first: {
        cluster_id: 'ec_abc',
        representative_title: 'Major Political Event',
        article_count: 3,
        source_count: 2,
        camp_distribution: '{"green":2,"white":0,"blue":1}',
        sources_json: '[{"source":"自由時報","camp":"green","count":2}]',
        article_ids: '["a1","a2","a3"]',
        avg_controversy_score: 0.65,
        max_controversy_level: 'moderate',
        category: '政治新聞',
        is_blindspot: 1,
        blindspot_type: 'white_missing',
        missing_camp: 'pan_white',
        earliest_published_at: '2026-03-09T08:00:00+08:00',
        latest_published_at: '2026-03-10T12:00:00+08:00',
      }},
      // articles query
      { all: { results: [
        { article_id: 'a1', title: 'Article One', summary: 'Summary 1', source: '自由時報', published_at: '2026-03-10T12:00:00+08:00', bias_score: 25, controversy_score: 0.7, controversy_level: 'moderate', camp_ratio: '{"green":60,"white":20,"blue":10,"gray":10}' },
        { article_id: 'a2', title: 'Article Two', summary: 'Summary 2', source: '聯合報', published_at: '2026-03-10T10:00:00+08:00', bias_score: 72, controversy_score: 0.6, controversy_level: 'moderate', camp_ratio: null },
      ]}},
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_abc' } });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.cluster.cluster_id).toBe('ec_abc');
    expect(result.body.data.cluster.camp_distribution).toEqual({ green: 2, white: 0, blue: 1 });
    expect(result.body.data.cluster.is_blindspot).toBe(true);
    expect(result.body.data.articles).toHaveLength(2);
    expect(result.body.data.articles[0].article_id).toBe('a1');
  });

  it('returns 404 when cluster_id not found', async () => {
    env.setupChains([
      { first: null },
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'nonexistent' } });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('returns cluster with empty articles list', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_empty',
        representative_title: 'Empty Cluster',
        article_count: 0,
        source_count: 0,
        camp_distribution: '{"green":0,"white":0,"blue":0}',
        sources_json: '[]',
        article_ids: '[]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
      // No articles query because article_ids is empty
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_empty' } });

    expect(result.status).toBe(200);
    expect(result.body.data.articles).toHaveLength(0);
    expect(result.body.data.cluster.cluster_id).toBe('ec_empty');
  });

  it('handles malformed camp_distribution', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_bad',
        representative_title: 'Bad Data',
        article_count: 2,
        source_count: 1,
        camp_distribution: '{invalid}',
        sources_json: '[]',
        article_ids: '[]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_bad' } });

    expect(result.status).toBe(200);
    expect(result.body.data.cluster.camp_distribution).toEqual({ green: 0, white: 0, blue: 0 });
  });

  it('escapes HTML in cluster title and article titles', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_xss',
        representative_title: '<img onerror=alert(1)>',
        article_count: 1,
        source_count: 1,
        camp_distribution: '{"green":1,"white":0,"blue":0}',
        sources_json: '[]',
        article_ids: '["a1"]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
      { all: { results: [
        { article_id: 'a1', title: '<b>XSS</b>', summary: '<script>', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', bias_score: null, controversy_score: null, controversy_level: null, camp_ratio: null },
      ]}},
    ]);

    await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_xss' } });

    expect(escapeHtml).toHaveBeenCalledWith('<img onerror=alert(1)>');
    expect(escapeHtml).toHaveBeenCalledWith('<b>XSS</b>');
    expect(escapeHtml).toHaveBeenCalledWith('<script>');
  });

  it('parses camp_ratio JSON in articles', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_1',
        representative_title: 'Cluster',
        article_count: 1,
        source_count: 1,
        camp_distribution: '{"green":1,"white":0,"blue":0}',
        sources_json: '[]',
        article_ids: '["a1"]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
      { all: { results: [
        { article_id: 'a1', title: 'Article', summary: 'S', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', bias_score: 50, controversy_score: 0.5, controversy_level: 'moderate', camp_ratio: '{"green":60,"white":20,"blue":10,"gray":10}' },
      ]}},
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_1' } });

    expect(result.body.data.articles[0].camp_ratio).toEqual({ green: 60, white: 20, blue: 10, gray: 10 });
  });

  it('returns all expected cluster fields', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_full',
        representative_title: 'Full Cluster',
        article_count: 5,
        source_count: 3,
        camp_distribution: '{"green":2,"white":2,"blue":1}',
        sources_json: '[{"source":"自由時報","camp":"green","count":2}]',
        article_ids: '["a1"]',
        avg_controversy_score: 0.8,
        max_controversy_level: 'high',
        category: '科技新聞',
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: '2026-03-08T08:00:00+08:00',
        latest_published_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [] } },
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_full' } });

    const cluster = result.body.data.cluster;
    expect(cluster).toHaveProperty('cluster_id');
    expect(cluster).toHaveProperty('representative_title');
    expect(cluster).toHaveProperty('article_count');
    expect(cluster).toHaveProperty('source_count');
    expect(cluster).toHaveProperty('camp_distribution');
    expect(cluster).toHaveProperty('sources_json');
    expect(cluster).toHaveProperty('avg_controversy_score');
    expect(cluster).toHaveProperty('max_controversy_level');
    expect(cluster).toHaveProperty('category');
    expect(cluster).toHaveProperty('is_blindspot');
    expect(cluster).toHaveProperty('blindspot_type');
    expect(cluster).toHaveProperty('missing_camp');
    expect(cluster).toHaveProperty('earliest_published_at');
    expect(cluster).toHaveProperty('latest_published_at');
  });

  it('handles null controversy scores', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_null',
        representative_title: 'No Controversy',
        article_count: 2,
        source_count: 1,
        camp_distribution: '{"green":1,"white":1,"blue":0}',
        sources_json: '[]',
        article_ids: '["a1"]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
      { all: { results: [
        { article_id: 'a1', title: 'Article', summary: 'S', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', bias_score: null, controversy_score: null, controversy_level: null, camp_ratio: null },
      ]}},
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_null' } });

    expect(result.status).toBe(200);
    expect(result.body.data.cluster.avg_controversy_score).toBeNull();
    expect(result.body.data.cluster.max_controversy_level).toBeNull();
    expect(result.body.data.articles[0].controversy_score).toBeNull();
    expect(result.body.data.articles[0].controversy_level).toBeNull();
  });

  it('returns articles ordered by published_at DESC', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_ord',
        representative_title: 'Ordered Cluster',
        article_count: 3,
        source_count: 2,
        camp_distribution: '{"green":1,"white":1,"blue":1}',
        sources_json: '[]',
        article_ids: '["a1","a2","a3"]',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: '2026-03-08T08:00:00+08:00',
        latest_published_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [
        { article_id: 'a3', title: 'Newest', summary: 'S', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', bias_score: null, controversy_score: null, controversy_level: null, camp_ratio: null },
        { article_id: 'a2', title: 'Middle', summary: 'S', source: 'udn', published_at: '2026-03-09T12:00:00+08:00', bias_score: null, controversy_score: null, controversy_level: null, camp_ratio: null },
        { article_id: 'a1', title: 'Oldest', summary: 'S', source: 'udn', published_at: '2026-03-08T12:00:00+08:00', bias_score: null, controversy_score: null, controversy_level: null, camp_ratio: null },
      ]}},
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_ord' } });

    expect(result.status).toBe(200);
    // Verify the SQL query contains ORDER BY published_at DESC
    const articlesQuerySql = env._prepare.mock.calls[1][0];
    expect(articlesQuerySql).toContain('ORDER BY published_at DESC');

    // Verify articles returned in DESC order
    expect(result.body.data.articles[0].article_id).toBe('a3');
    expect(result.body.data.articles[2].article_id).toBe('a1');
  });

  it('handles article_ids JSON parse failure', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'ec_badids',
        representative_title: 'Bad IDs',
        article_count: 2,
        source_count: 1,
        camp_distribution: '{"green":1,"white":0,"blue":0}',
        sources_json: '[]',
        article_ids: 'not-json',
        avg_controversy_score: null,
        max_controversy_level: null,
        category: null,
        is_blindspot: 0,
        blindspot_type: null,
        missing_camp: null,
        earliest_published_at: null,
        latest_published_at: null,
      }},
      // No articles query expected since article_ids parse fails → empty array
    ]);

    const result = await getClusterDetail({}, env, {}, { params: { cluster_id: 'ec_badids' } });

    expect(result.status).toBe(200);
    // safeJsonParse returns [] fallback, so no articles fetched
    expect(result.body.data.articles).toHaveLength(0);
  });
});
