/**
 * Unit tests for analysis handler — global one-per-article limit
 *
 * Rule: Once ANY user has analyzed an article, NO ONE can analyze it again.
 * Race condition: UNIQUE(article_id) constraint → 409 on second insert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/validators.js', () => ({
  validateAnalysis: vi.fn(),
}));
vi.mock('../../../shared/enums.js', () => ({
  getBiasCategory: vi.fn(() => 'center'),
  getControversyLevel: vi.fn(() => 'general_policy'),
}));
vi.mock('../../../shared/state-machine.js', () => ({
  transitionStatus: vi.fn(),
}));
vi.mock('../../../shared/utils.js', () => ({
  nowISO: vi.fn(() => '2026-03-10T12:00:00+08:00'),
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/config.js', () => ({
  REWARD: {
    DAILY_ANALYSIS_LIMIT: 10,
    MIN_ANALYSIS_TIME_MS: 5000,
    POINTS_PER_VALID_ANALYSIS: 10,
    POINTS_PER_VOTE_RIGHT: 100,
    POINT_TIERS: [
      { cents: 10, weight: 20 },
      { cents: 20, weight: 10 },
      { cents: 30, weight: 6 },
      { cents: 40, weight: 3 },
      { cents: 50, weight: 1 },
    ],
  },
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
}));

import { createAnalysis, getAnalyses } from '../handlers/analysis.js';
import { validateAnalysis } from '../../../shared/validators.js';

// ── Helpers ────────────────────────────────────────────

function createMockEnv() {
  const prepareChains = [];
  let prepareIndex = 0;
  const batchResults = [];

  const mockPrepare = vi.fn().mockImplementation(() => {
    const chain = prepareChains[prepareIndex++];
    if (!chain) {
      return { bind: vi.fn().mockReturnValue({ first: vi.fn(), all: vi.fn(), run: vi.fn() }) };
    }
    return chain.prepareResult;
  });

  const mockBatch = vi.fn().mockImplementation(() => Promise.resolve(batchResults));

  function addPrepareChain({ first, all, run, runError } = {}) {
    const mockBind = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(first !== undefined ? first : null),
      all: vi.fn().mockResolvedValue(all !== undefined ? all : { results: [] }),
      run: runError
        ? vi.fn().mockRejectedValue(runError)
        : vi.fn().mockResolvedValue(run !== undefined ? run : {}),
    });
    prepareChains.push({ prepareResult: { bind: mockBind } });
    return mockBind;
  }

  return {
    DB: { prepare: mockPrepare, batch: mockBatch },
    _helpers: { addPrepareChain, prepareChains, batchResults },
  };
}

function createRequest(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

function validBody() {
  return {
    bias_score: 50,
    controversy_score: 30,
    reasoning: 'This is a test reasoning over ten chars',
    key_phrases: ['phrase1', 'phrase2'],
    prompt_version: 'v3.0.0',
    analysis_duration_ms: 7000,
  };
}

// ══════════════════════════════════════════════════════
// createAnalysis — Global One-Per-Article Limit
// ══════════════════════════════════════════════════════

describe('createAnalysis — global one-per-article', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns 409 when article already has analysis from ANY user', async () => {
    validateAnalysis.mockReturnValue({ valid: true, errors: [] });

    // 1. User row (daily count check)
    env._helpers.addPrepareChain({ first: { daily_analysis_count: 0, cooldown_until: null } });
    // 2. Article exists
    env._helpers.addPrepareChain({ first: { article_id: 'abc123', status: 'deduplicated' } });
    // 3. Global duplicate check: analysis EXISTS (from another user)
    env._helpers.addPrepareChain({ first: { id: 99 } });

    const request = createRequest(validBody());
    const result = await createAnalysis(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'different_user' },
    });

    expect(result.status).toBe(409);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('already_analyzed');
  });

  it('creates analysis successfully when no prior analysis exists', async () => {
    validateAnalysis.mockReturnValue({ valid: true, errors: [] });

    // 1. User row
    env._helpers.addPrepareChain({ first: { daily_analysis_count: 0, cooldown_until: null } });
    // 2. Article exists
    env._helpers.addPrepareChain({ first: { article_id: 'abc123', status: 'deduplicated' } });
    // 3. No existing analysis
    env._helpers.addPrepareChain({ first: null });
    // 4. INSERT analysis
    env._helpers.addPrepareChain({ run: {} });
    // 5+6. batch: UPDATE articles + UPDATE users (handled by batch mock)
    // 7. status update (deduplicated → analyzed)
    env._helpers.addPrepareChain({ run: {} });
    // 8. status update (analyzed → published, if quality passed)
    env._helpers.addPrepareChain({ run: {} });
    // 9. Award points
    env._helpers.addPrepareChain({ run: {} });
    // 10. Fetch updated user points
    env._helpers.addPrepareChain({ first: { total_points_cents: 10, vote_rights: 0, contribution_count: 1 } });

    const request = createRequest(validBody());
    const result = await createAnalysis(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data.article_id).toBe('abc123');
  });

  it('returns 409 on race condition (UNIQUE constraint violation during INSERT)', async () => {
    validateAnalysis.mockReturnValue({ valid: true, errors: [] });

    // 1. User row
    env._helpers.addPrepareChain({ first: { daily_analysis_count: 0, cooldown_until: null } });
    // 2. Article exists
    env._helpers.addPrepareChain({ first: { article_id: 'abc123', status: 'deduplicated' } });
    // 3. No existing analysis at check time (race: another user inserts between check and insert)
    env._helpers.addPrepareChain({ first: null });
    // 4. INSERT fails with UNIQUE constraint violation
    env._helpers.addPrepareChain({ runError: new Error('UNIQUE constraint failed: analyses.article_id') });

    const request = createRequest(validBody());
    const result = await createAnalysis(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user2' },
    });

    expect(result.status).toBe(409);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('already_analyzed');
  });

  it('duplicate check queries by article_id only (not user_hash)', async () => {
    validateAnalysis.mockReturnValue({ valid: true, errors: [] });

    // 1. User row
    env._helpers.addPrepareChain({ first: { daily_analysis_count: 0, cooldown_until: null } });
    // 2. Article exists
    env._helpers.addPrepareChain({ first: { article_id: 'abc123', status: 'deduplicated' } });
    // 3. Duplicate check returns existing analysis
    const dupBind = env._helpers.addPrepareChain({ first: { id: 1 } });

    const request = createRequest(validBody());
    await createAnalysis(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    // Verify: duplicate check bind is called with article_id ONLY (1 arg, not 2)
    expect(dupBind).toHaveBeenCalledWith('abc123');
  });

  it('returns 409 even when same user re-submits', async () => {
    validateAnalysis.mockReturnValue({ valid: true, errors: [] });

    // 1. User row
    env._helpers.addPrepareChain({ first: { daily_analysis_count: 1, cooldown_until: null } });
    // 2. Article exists
    env._helpers.addPrepareChain({ first: { article_id: 'abc123', status: 'published' } });
    // 3. Existing analysis (same user's own previous analysis)
    env._helpers.addPrepareChain({ first: { id: 1 } });

    const request = createRequest(validBody());
    const result = await createAnalysis(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'original_analyzer' },
    });

    expect(result.status).toBe(409);
    expect(result.body.error.type).toBe('already_analyzed');
  });
});

// ══════════════════════════════════════════════════════
// getArticles — analysis_count in response
// ══════════════════════════════════════════════════════

describe('getArticles — includes analysis_count', () => {
  it('SELECT includes analysis_count column', async () => {
    // This test validates that the SQL SELECT in getArticles includes analysis_count.
    // We import getArticles and check the SQL query contains analysis_count.
    const { getArticles } = await import('../handlers/articles.js');

    const mockBind = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ total: 0 }),
      all: vi.fn().mockResolvedValue({ results: [] }),
    });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const env = { DB: { prepare: mockPrepare } };

    const url = new URL('https://example.com/api/v1/articles');
    await getArticles({}, env, {}, { url });

    // Find the SELECT query (second prepare call, after COUNT)
    const selectCall = mockPrepare.mock.calls[1];
    expect(selectCall[0]).toContain('analysis_count');
  });
});
