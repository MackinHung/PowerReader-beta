/**
 * Unit tests for report + analysis feedback handlers (B7 + B1)
 *
 * B7a: POST /api/v1/articles/:article_id/report — report article
 * B7b: POST /api/v1/analyses/:analysis_id/report — report analysis
 * B1a: POST /api/v1/analyses/:analysis_id/feedback — submit like/dislike
 * B1b: GET  /api/v1/analyses/:analysis_id/feedback/stats — aggregated stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/validators.js', () => ({
  validateReport: vi.fn(),
  validateFeedback: vi.fn(),
}));
vi.mock('../../../shared/utils.js', () => ({
  nowISO: vi.fn(() => '2026-03-10T12:00:00+08:00'),
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
  successResponse: vi.fn((data, status = 200) => ({
    status,
    body: { success: true, data, error: null },
  })),
  errorResponse: vi.fn((status, type, message) => ({
    status,
    body: { success: false, data: null, error: { type, message } },
  })),
}));

import { reportArticle, reportAnalysis } from '../handlers/reports.js';
import {
  submitAnalysisFeedback,
  getAnalysisFeedbackStats,
} from '../handlers/analysis-feedback.js';
import { validateReport, validateFeedback } from '../../../shared/validators.js';
import { jsonResponse } from '../../../shared/response.js';

// ── Helpers ────────────────────────────────────────────

function createMockEnv() {
  const mockFirst = vi.fn();
  const mockAll = vi.fn();
  const mockRun = vi.fn();
  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    all: mockAll,
    run: mockRun,
  });
  const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

  return {
    DB: { prepare: mockPrepare },
    _mocks: { prepare: mockPrepare, bind: mockBind, first: mockFirst, all: mockAll, run: mockRun },
  };
}

function createRequest(body) {
  return { json: vi.fn().mockResolvedValue(body) };
}

// ══════════════════════════════════════════════════════
// B7a: POST /api/v1/articles/:article_id/report
// ══════════════════════════════════════════════════════

describe('reportArticle', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns 401 when user is missing (no JWT)', async () => {
    const request = createRequest({ reason: 'inaccurate' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: null,
    });

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('auth_required');
  });

  it('returns 400 when validation fails (invalid reason)', async () => {
    validateReport.mockReturnValue({
      valid: false,
      errors: ['reason must be one of: inaccurate, biased, spam, offensive, other'],
    });

    const request = createRequest({ reason: 'boring' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 404 when article does not exist', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce(null);

    const request = createRequest({ reason: 'inaccurate' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'nonexistent' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('returns 409 when duplicate report from same user', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    // Article exists
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    // Duplicate check finds existing report
    env._mocks.first.mockResolvedValueOnce({ id: 1 });

    const request = createRequest({ reason: 'inaccurate' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(409);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('submits report successfully with valid reason', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    // Article exists
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    // No duplicate
    env._mocks.first.mockResolvedValueOnce(null);
    // Insert succeeds
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ reason: 'biased', description: 'Very biased article' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data.target_type).toBe('article');
    expect(result.body.data.target_id).toBe('abc123');
    expect(result.body.data.reason).toBe('biased');
  });

  it('submits report without optional description', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    env._mocks.first.mockResolvedValueOnce(null);
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ reason: 'spam' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data.reason).toBe('spam');
  });

  it('uses authenticated user_hash from JWT, not from body', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    env._mocks.first.mockResolvedValueOnce(null);
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ reason: 'inaccurate', user_hash: 'spoofed' });
    const result = await reportArticle(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'real_user' },
    });

    const insertBindCall = env._mocks.bind.mock.calls.find(
      (args) => args.includes('real_user'),
    );
    expect(insertBindCall).toBeTruthy();
    expect(result.status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════
// B7b: POST /api/v1/analyses/:analysis_id/report
// ══════════════════════════════════════════════════════

describe('reportAnalysis', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns 401 when user is missing (no JWT)', async () => {
    const request = createRequest({ reason: 'inaccurate' });
    const result = await reportAnalysis(request, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('auth_required');
  });

  it('returns 400 when validation fails (invalid reason)', async () => {
    validateReport.mockReturnValue({
      valid: false,
      errors: ['reason must be one of: inaccurate, biased, spam, offensive, other'],
    });

    const request = createRequest({ reason: 'invalid_reason' });
    const result = await reportAnalysis(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 404 when analysis does not exist', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce(null);

    const request = createRequest({ reason: 'inaccurate' });
    const result = await reportAnalysis(request, env, {}, {
      params: { analysis_id: '999' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('returns 409 when duplicate report from same user', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    // Analysis exists
    env._mocks.first.mockResolvedValueOnce({ id: 42 });
    // Duplicate check finds existing
    env._mocks.first.mockResolvedValueOnce({ id: 1 });

    const request = createRequest({ reason: 'biased' });
    const result = await reportAnalysis(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(409);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('submits analysis report successfully', async () => {
    validateReport.mockReturnValue({ valid: true, errors: [] });
    // Analysis exists
    env._mocks.first.mockResolvedValueOnce({ id: 42 });
    // No duplicate
    env._mocks.first.mockResolvedValueOnce(null);
    // Insert succeeds
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ reason: 'offensive', description: 'Contains hate speech' });
    const result = await reportAnalysis(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data.target_type).toBe('analysis');
    expect(result.body.data.target_id).toBe('42');
    expect(result.body.data.reason).toBe('offensive');
  });
});

// ══════════════════════════════════════════════════════
// B1a: POST /api/v1/analyses/:analysis_id/feedback
// ══════════════════════════════════════════════════════

describe('submitAnalysisFeedback', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns 401 when user is missing (no JWT)', async () => {
    const request = createRequest({ type: 'like' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('auth_required');
  });

  it('returns 400 when validation fails (invalid type)', async () => {
    validateFeedback.mockReturnValue({
      valid: false,
      errors: ['type must be one of: like, dislike'],
    });

    const request = createRequest({ type: 'love' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 404 when analysis does not exist', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce(null);

    const request = createRequest({ type: 'like' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '999' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('submits a like successfully', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    // Analysis exists
    env._mocks.first.mockResolvedValueOnce({ id: 42 });
    // Upsert succeeds
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'like' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.type).toBe('like');
    expect(result.body.data.analysis_id).toBe('42');
  });

  it('upserts when changing from like to dislike', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ id: 42 });
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'dislike' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    // Should use INSERT OR REPLACE for upsert
    const sqlCall = env._mocks.prepare.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE'),
    );
    expect(sqlCall).toBeTruthy();
    expect(result.status).toBe(200);
    expect(result.body.data.type).toBe('dislike');
  });

  it('uses authenticated user_hash from JWT, not from body', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ id: 42 });
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'like', user_hash: 'spoofed' });
    const result = await submitAnalysisFeedback(request, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'real_user' },
    });

    const insertBindCall = env._mocks.bind.mock.calls.find(
      (args) => args.includes('real_user'),
    );
    expect(insertBindCall).toBeTruthy();
    expect(result.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════
// B1b: GET /api/v1/analyses/:analysis_id/feedback/stats
// ══════════════════════════════════════════════════════

describe('getAnalysisFeedbackStats', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns zeroed stats when no feedback exists', async () => {
    env._mocks.all.mockResolvedValueOnce({ results: [] });

    const result = await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.likes).toBe(0);
    expect(result.body.data.dislikes).toBe(0);
    expect(result.body.data.total).toBe(0);
    expect(result.body.data.user_feedback).toBeNull();
  });

  it('returns correct aggregated counts', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [
        { type: 'like', count: 15 },
        { type: 'dislike', count: 4 },
      ],
    });

    const result = await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    expect(result.status).toBe(200);
    expect(result.body.data.likes).toBe(15);
    expect(result.body.data.dislikes).toBe(4);
    expect(result.body.data.total).toBe(19);
    expect(result.body.data.user_feedback).toBeNull();
  });

  it('returns only likes when no dislikes exist', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [{ type: 'like', count: 8 }],
    });

    const result = await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    expect(result.body.data.likes).toBe(8);
    expect(result.body.data.dislikes).toBe(0);
    expect(result.body.data.total).toBe(8);
  });

  it('includes user_feedback when authenticated user has feedback', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [
        { type: 'like', count: 10 },
        { type: 'dislike', count: 2 },
      ],
    });
    // User feedback query
    env._mocks.first.mockResolvedValueOnce({ type: 'dislike' });

    const result = await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.user_feedback).toBe('dislike');
    expect(result.body.data.likes).toBe(10);
    expect(result.body.data.dislikes).toBe(2);
    expect(result.body.data.total).toBe(12);
  });

  it('returns user_feedback as null when authenticated user has no feedback', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [{ type: 'like', count: 3 }],
    });
    env._mocks.first.mockResolvedValueOnce(null);

    const result = await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: { user_hash: 'user1' },
    });

    expect(result.body.data.user_feedback).toBeNull();
  });

  it('does not query user feedback when user is null (public access)', async () => {
    env._mocks.all.mockResolvedValueOnce({ results: [] });

    await getAnalysisFeedbackStats({}, env, {}, {
      params: { analysis_id: '42' },
      user: null,
    });

    // Only one prepare call (stats), no user feedback query
    expect(env._mocks.prepare).toHaveBeenCalledTimes(1);
  });
});
