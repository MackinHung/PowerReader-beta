/**
 * Unit tests for events handlers (A1 + A2)
 *
 * A1: GET /api/v1/events — list event clusters (blindspot events)
 * A2: GET /api/v1/events/:cluster_id — event detail with related articles
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/utils.js', () => ({
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
}));

import { getEvents, getEventDetail } from '../handlers/events.js';
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
        const mockBind = vi.fn().mockReturnValue({
          first: config.first !== undefined ? vi.fn().mockResolvedValue(config.first) : vi.fn(),
          all: config.all !== undefined ? vi.fn().mockResolvedValue(config.all) : vi.fn(),
          run: config.run !== undefined ? vi.fn().mockResolvedValue(config.run) : vi.fn(),
        });
        prepareChains.push({
          prepareResult: { bind: mockBind },
          bind: mockBind,
        });
      }
    },
  };
}

function createUrl(queryString = '') {
  return new URL(`https://example.com/api/v1/events${queryString}`);
}

// ══════════════════════════════════════════════════════
// A1: GET /api/v1/events
// ══════════════════════════════════════════════════════

describe('getEvents', () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it('returns list of blindspot events', async () => {
    env.setupChains([
      { first: { total: 2 } },
      { all: { results: [
        {
          cluster_id: 'c1',
          representative_title: 'Major Political Event',
          blindspot_type: 'green_only',
          camp_distribution: '{"green":5,"white":0,"blue":0}',
          missing_camp: 'blue,white',
          article_count: 5,
          source_count: 3,
          detected_at: '2026-03-10T12:00:00+08:00',
        },
        {
          cluster_id: 'c2',
          representative_title: 'Another Event',
          blindspot_type: 'imbalanced',
          camp_distribution: '{"green":7,"white":1,"blue":2}',
          missing_camp: null,
          article_count: 10,
          source_count: 5,
          detected_at: '2026-03-09T08:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl();
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.items).toHaveLength(2);
    expect(result.body.data.items[0].cluster_id).toBe('c1');
    expect(result.body.data.items[0].camp_distribution).toEqual({ green: 5, white: 0, blue: 0 });
    expect(result.body.data.pagination.total).toBe(2);
  });

  it('supports pagination with page and limit', async () => {
    env.setupChains([
      { first: { total: 30 } },
      { all: { results: [
        {
          cluster_id: 'c11',
          representative_title: 'Page 2 Event',
          blindspot_type: 'blue_only',
          camp_distribution: '{"green":0,"white":0,"blue":8}',
          missing_camp: 'green,white',
          article_count: 8,
          source_count: 4,
          detected_at: '2026-03-08T10:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl('?page=2&limit=10');
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.pagination.page).toBe(2);
    expect(result.body.data.pagination.limit).toBe(10);
    expect(result.body.data.pagination.total).toBe(30);
    expect(result.body.data.pagination.total_pages).toBe(3);

    // Verify offset = (2-1)*10 = 10 was bound for data query
    const dataBindArgs = env._chains[1].bind.mock.calls[0];
    expect(dataBindArgs).toContain(10); // limit
    expect(dataBindArgs).toContain(10); // offset
  });

  it('filters by blindspot_type', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'c1',
          representative_title: 'Green Only Event',
          blindspot_type: 'green_only',
          camp_distribution: '{"green":6,"white":0,"blue":0}',
          missing_camp: 'blue,white',
          article_count: 6,
          source_count: 2,
          detected_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl('?type=green_only');
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.items[0].blindspot_type).toBe('green_only');

    // Verify the WHERE clause includes blindspot_type filter
    const prepareCall = env._prepare.mock.calls[0][0];
    expect(prepareCall).toContain('blindspot_type = ?');
  });

  it('ignores invalid blindspot_type filter', async () => {
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?type=invalid_type');
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);

    // No WHERE clause should be added for invalid type
    const countPrepareCall = env._prepare.mock.calls[0][0];
    expect(countPrepareCall).not.toContain('blindspot_type = ?');
  });

  it('returns empty results successfully', async () => {
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl();
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.items).toHaveLength(0);
    expect(result.body.data.pagination.total).toBe(0);
    expect(result.body.data.pagination.total_pages).toBe(0);
  });

  it('handles malformed camp_distribution JSON gracefully', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'c1',
          representative_title: 'Bad JSON Event',
          blindspot_type: 'green_only',
          camp_distribution: 'not-valid-json',
          missing_camp: 'blue',
          article_count: 3,
          source_count: 1,
          detected_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl();
    const result = await getEvents({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.items[0].camp_distribution).toEqual({ green: 0, white: 0, blue: 0 });
  });

  it('escapes HTML in representative_title', async () => {
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        {
          cluster_id: 'c1',
          representative_title: '<script>xss</script>',
          blindspot_type: 'green_only',
          camp_distribution: '{"green":1,"white":0,"blue":0}',
          missing_camp: 'blue',
          article_count: 1,
          source_count: 1,
          detected_at: '2026-03-10T12:00:00+08:00',
        },
      ]}},
    ]);

    const url = createUrl();
    await getEvents({}, env, {}, { url });

    expect(escapeHtml).toHaveBeenCalledWith('<script>xss</script>');
  });
});

// ══════════════════════════════════════════════════════
// A2: GET /api/v1/events/:cluster_id
// ══════════════════════════════════════════════════════

describe('getEventDetail', () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it('returns event detail with related articles', async () => {
    env.setupChains([
      // Event lookup
      { first: {
        cluster_id: 'c1',
        representative_title: 'Major Political Event',
        blindspot_type: 'green_only',
        camp_distribution: '{"green":5,"white":0,"blue":0}',
        missing_camp: 'blue,white',
        article_count: 5,
        source_count: 3,
        detected_at: '2026-03-10T12:00:00+08:00',
      }},
      // Related articles query
      { all: { results: [
        { article_id: 'a1', title: 'Related Article 1', summary: 'Summary 1', source: 'udn', published_at: '2026-03-10T11:00:00+08:00', camp_ratio: '{"green":80,"white":10,"blue":5,"gray":5}' },
        { article_id: 'a2', title: 'Related Article 2', summary: 'Summary 2', source: 'liberty_times', published_at: '2026-03-10T10:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    const result = await getEventDetail({}, env, {}, { params: { cluster_id: 'c1' } });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.event.cluster_id).toBe('c1');
    expect(result.body.data.event.camp_distribution).toEqual({ green: 5, white: 0, blue: 0 });
    expect(result.body.data.articles).toHaveLength(2);
  });

  it('returns 404 when cluster_id not found', async () => {
    env.setupChains([
      { first: null },
    ]);

    const result = await getEventDetail({}, env, {}, { params: { cluster_id: 'nonexistent' } });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('returns event with empty related articles', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'c-empty',
        representative_title: 'Lonely Event',
        blindspot_type: 'white_missing',
        camp_distribution: '{"green":2,"white":0,"blue":3}',
        missing_camp: 'white',
        article_count: 5,
        source_count: 2,
        detected_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [] } },
    ]);

    const result = await getEventDetail({}, env, {}, { params: { cluster_id: 'c-empty' } });

    expect(result.status).toBe(200);
    expect(result.body.data.articles).toHaveLength(0);
    expect(result.body.data.event.cluster_id).toBe('c-empty');
  });

  it('handles malformed camp_distribution in event', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'c-bad',
        representative_title: 'Bad Data',
        blindspot_type: 'green_only',
        camp_distribution: '{invalid}',
        missing_camp: 'blue',
        article_count: 1,
        source_count: 1,
        detected_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [] } },
    ]);

    const result = await getEventDetail({}, env, {}, { params: { cluster_id: 'c-bad' } });

    expect(result.status).toBe(200);
    expect(result.body.data.event.camp_distribution).toEqual({ green: 0, white: 0, blue: 0 });
  });

  it('escapes HTML in event title and article titles', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'c-xss',
        representative_title: '<img onerror=alert(1)>',
        blindspot_type: 'green_only',
        camp_distribution: '{"green":1,"white":0,"blue":0}',
        missing_camp: 'blue',
        article_count: 1,
        source_count: 1,
        detected_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [
        { article_id: 'a1', title: '<b>XSS</b>', summary: '<script>', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    await getEventDetail({}, env, {}, { params: { cluster_id: 'c-xss' } });

    expect(escapeHtml).toHaveBeenCalledWith('<img onerror=alert(1)>');
    expect(escapeHtml).toHaveBeenCalledWith('<b>XSS</b>');
    expect(escapeHtml).toHaveBeenCalledWith('<script>');
  });

  it('parses camp_ratio JSON in related articles', async () => {
    env.setupChains([
      { first: {
        cluster_id: 'c1',
        representative_title: 'Event',
        blindspot_type: 'green_only',
        camp_distribution: '{"green":3,"white":0,"blue":0}',
        missing_camp: 'blue',
        article_count: 3,
        source_count: 2,
        detected_at: '2026-03-10T12:00:00+08:00',
      }},
      { all: { results: [
        { article_id: 'a1', title: 'Article', summary: 'S', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: '{"green":60,"white":20,"blue":10,"gray":10}' },
      ]}},
    ]);

    const result = await getEventDetail({}, env, {}, { params: { cluster_id: 'c1' } });

    expect(result.body.data.articles[0].camp_ratio).toEqual({ green: 60, white: 20, blue: 10, gray: 10 });
  });
});
