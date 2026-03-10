/**
 * Unit tests for search handler (B9)
 *
 * B9: GET /api/v1/search?q=keyword — search articles by title/summary
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/validators.js', () => ({
  validateSearchQuery: vi.fn(),
}));
vi.mock('../../../shared/utils.js', () => ({
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
}));

import { searchArticles } from '../handlers/search.js';
import { validateSearchQuery } from '../../../shared/validators.js';
import { escapeHtml } from '../../../shared/utils.js';

// ── Helpers ────────────────────────────────────────────

/**
 * Creates a mock env where each prepare() call returns an independent chain.
 * Use setupDbChain to configure sequential prepare() calls with their results.
 */
function createMockEnv() {
  const prepareChains = [];
  let prepareIndex = 0;

  const mockPrepare = vi.fn().mockImplementation(() => {
    const chain = prepareChains[prepareIndex++];
    if (!chain) {
      // Fallback: return a chain with no-op bind
      return { bind: vi.fn().mockReturnValue({ first: vi.fn(), all: vi.fn(), run: vi.fn() }) };
    }
    return chain.prepareResult;
  });

  return {
    DB: { prepare: mockPrepare },
    _prepare: mockPrepare,
    _chains: prepareChains,
    /**
     * Set up sequential prepare().bind() chains.
     * @param {{ first?: any, all?: any, run?: any }[]} configs
     */
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

function createUrl(queryString) {
  return new URL(`https://example.com/api/v1/search${queryString}`);
}

// ══════════════════════════════════════════════════════
// B9: GET /api/v1/search?q=keyword
// ══════════════════════════════════════════════════════

describe('searchArticles', () => {
  let env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = createMockEnv();
  });

  it('returns 400 when query is missing', async () => {
    validateSearchQuery.mockReturnValue({ valid: false, errors: ['Search query (q) is required'] });

    const url = createUrl('');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 400 when query is too short (<2 chars)', async () => {
    validateSearchQuery.mockReturnValue({ valid: false, errors: ['Search query must be at least 2 characters'] });

    const url = createUrl('?q=a');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 400 when query is too long (>100 chars)', async () => {
    validateSearchQuery.mockReturnValue({ valid: false, errors: ['Search query must be 100 characters or less'] });

    const url = createUrl(`?q=${'x'.repeat(101)}`);
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns matching articles (happy path)', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 2 } },
      { all: { results: [
        { article_id: 'a1', title: 'Test Article', summary: 'Summary', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: '{"green":30,"white":40,"blue":20,"gray":10}' },
        { article_id: 'a2', title: 'Another Test', summary: 'Summary 2', source: 'liberty_times', published_at: '2026-03-09T10:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    const url = createUrl('?q=test');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.items).toHaveLength(2);
    expect(result.body.data.pagination.total).toBe(2);
    expect(result.body.data.pagination.page).toBe(1);
    expect(result.body.data.pagination.limit).toBe(20);
    expect(result.body.data.pagination.total_pages).toBe(1);
  });

  it('parses camp_ratio JSON string in results', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        { article_id: 'a1', title: 'Article', summary: 'S', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: '{"green":30,"white":40,"blue":20,"gray":10}' },
      ]}},
    ]);

    const url = createUrl('?q=test');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.body.data.items[0].camp_ratio).toEqual({ green: 30, white: 40, blue: 20, gray: 10 });
  });

  it('filters by type=articles', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        { article_id: 'a1', title: 'Filtered', summary: 'S', source: 'cna', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    const url = createUrl('?q=test&type=articles');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.items).toHaveLength(1);
  });

  it('returns empty results successfully', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?q=nonexistent');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.items).toHaveLength(0);
    expect(result.body.data.pagination.total).toBe(0);
    expect(result.body.data.pagination.total_pages).toBe(0);
  });

  it('supports pagination (page=2, limit=10)', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 25 } },
      { all: { results: [
        { article_id: 'a11', title: 'Page 2 item', summary: null, source: 'tvbs', published_at: '2026-03-08T10:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    const url = createUrl('?q=news&page=2&limit=10');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.status).toBe(200);
    expect(result.body.data.pagination.page).toBe(2);
    expect(result.body.data.pagination.limit).toBe(10);
    expect(result.body.data.pagination.total).toBe(25);
    expect(result.body.data.pagination.total_pages).toBe(3);

    // Verify offset = (2-1)*10 = 10 was passed to bind for data query
    const dataBindArgs = env._chains[1].bind.mock.calls[0];
    expect(dataBindArgs).toContain(10); // limit
    expect(dataBindArgs).toContain(10); // offset
  });

  it('clamps limit to max 50', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?q=test&limit=999');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.body.data.pagination.limit).toBe(50);
  });

  it('clamps page to minimum 1', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?q=test&page=-5');
    const result = await searchArticles({}, env, {}, { url });

    expect(result.body.data.pagination.page).toBe(1);
  });

  it('escapes SQL LIKE special characters in query', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?q=100%25_test');
    await searchArticles({}, env, {}, { url });

    // Verify the bound parameters contain escaped LIKE pattern
    const countBindArgs = env._chains[0].bind.mock.calls[0];
    expect(countBindArgs[0]).toContain('\\%');
    expect(countBindArgs[0]).toContain('\\_');
  });

  it('escapes HTML in title and summary of results', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 1 } },
      { all: { results: [
        { article_id: 'a1', title: '<script>alert(1)</script>', summary: '<b>bold</b>', source: 'udn', published_at: '2026-03-10T12:00:00+08:00', camp_ratio: null },
      ]}},
    ]);

    const url = createUrl('?q=test');
    await searchArticles({}, env, {}, { url });

    expect(escapeHtml).toHaveBeenCalledWith('<script>alert(1)</script>');
    expect(escapeHtml).toHaveBeenCalledWith('<b>bold</b>');
  });

  it('does not filter by status (articles may be published or deduplicated)', async () => {
    validateSearchQuery.mockReturnValue({ valid: true, errors: [] });
    env.setupChains([
      { first: { total: 0 } },
      { all: { results: [] } },
    ]);

    const url = createUrl('?q=test');
    await searchArticles({}, env, {}, { url });

    // No status filter — all articles should be searchable
    const prepareCall = env._prepare.mock.calls[0][0];
    expect(prepareCall).not.toContain("status =");
  });
});
