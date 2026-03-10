/**
 * Unit tests for feedback handlers (A6 + A7)
 *
 * A6: POST /api/v1/articles/:article_id/feedback — submit like/dislike
 * A7: GET  /api/v1/articles/:article_id/feedback/stats — aggregated stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/validators.js', () => ({
  validateFeedback: vi.fn(),
}));
vi.mock('../../../shared/utils.js', () => ({
  nowISO: vi.fn(() => '2026-03-10T12:00:00+08:00'),
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
}));

import { submitArticleFeedback, getArticleFeedbackStats } from '../handlers/feedback.js';
import { validateFeedback } from '../../../shared/validators.js';
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
// A6: POST /api/v1/articles/:article_id/feedback
// ══════════════════════════════════════════════════════

describe('submitArticleFeedback', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns 400 when validation fails (invalid type)', async () => {
    validateFeedback.mockReturnValue({ valid: false, errors: ['type must be one of: like, dislike'] });

    const request = createRequest({ type: 'love' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 404 when article does not exist', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    // First DB call: article lookup returns null
    env._mocks.first.mockResolvedValueOnce(null);

    const request = createRequest({ type: 'like' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'nonexistent' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(404);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('not_found');
  });

  it('submits a like successfully', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    // Article exists
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    // No existing feedback
    env._mocks.first.mockResolvedValueOnce(null);
    // Insert succeeds
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'like' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.type).toBe('like');
    expect(result.body.data.article_id).toBe('abc123');
  });

  it('submits a dislike successfully', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    env._mocks.first.mockResolvedValueOnce(null);
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'dislike' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.type).toBe('dislike');
  });

  it('returns 409 when user already submitted feedback (no retraction)', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    // Article exists
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    // Existing feedback found
    env._mocks.first.mockResolvedValueOnce({ id: 1 });

    const request = createRequest({ type: 'dislike' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(409);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('already_submitted');
  });

  it('uses authenticated user_hash from JWT, not from body', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });
    env._mocks.first.mockResolvedValueOnce({ article_id: 'abc123' });
    env._mocks.first.mockResolvedValueOnce(null);
    env._mocks.run.mockResolvedValueOnce({});

    const request = createRequest({ type: 'like', user_hash: 'spoofed_hash' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'real_user_hash' },
    });

    // The bind call for INSERT should use 'real_user_hash', not 'spoofed_hash'
    const insertBindCall = env._mocks.bind.mock.calls.find(
      (args) => args.includes('real_user_hash')
    );
    expect(insertBindCall).toBeTruthy();
    expect(result.status).toBe(200);
  });

  it('returns 401 when user is missing (no JWT)', async () => {
    validateFeedback.mockReturnValue({ valid: true, errors: [] });

    const request = createRequest({ type: 'like' });
    const result = await submitArticleFeedback(request, env, {}, {
      params: { article_id: 'abc123' },
      user: null,
    });

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error.type).toBe('auth_required');
  });
});

// ══════════════════════════════════════════════════════
// A7: GET /api/v1/articles/:article_id/feedback/stats
// ══════════════════════════════════════════════════════

describe('getArticleFeedbackStats', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('returns zeroed stats for an article with no feedback', async () => {
    // Stats query returns empty results
    env._mocks.all.mockResolvedValueOnce({ results: [] });

    const result = await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'empty_article' },
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
        { type: 'like', count: 10 },
        { type: 'dislike', count: 3 },
      ],
    });

    const result = await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'popular_article' },
      user: null,
    });

    expect(result.status).toBe(200);
    expect(result.body.data.likes).toBe(10);
    expect(result.body.data.dislikes).toBe(3);
    expect(result.body.data.total).toBe(13);
    expect(result.body.data.user_feedback).toBeNull();
  });

  it('returns only likes when no dislikes exist', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [{ type: 'like', count: 5 }],
    });

    const result = await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'liked_article' },
      user: null,
    });

    expect(result.body.data.likes).toBe(5);
    expect(result.body.data.dislikes).toBe(0);
    expect(result.body.data.total).toBe(5);
  });

  it('includes user_feedback when authenticated user has feedback', async () => {
    // Stats query
    env._mocks.all.mockResolvedValueOnce({
      results: [
        { type: 'like', count: 7 },
        { type: 'dislike', count: 2 },
      ],
    });
    // User feedback query
    env._mocks.first.mockResolvedValueOnce({ type: 'like' });

    const result = await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.user_feedback).toBe('like');
    expect(result.body.data.likes).toBe(7);
    expect(result.body.data.dislikes).toBe(2);
    expect(result.body.data.total).toBe(9);
  });

  it('returns user_feedback as null when authenticated user has no feedback', async () => {
    env._mocks.all.mockResolvedValueOnce({
      results: [{ type: 'like', count: 1 }],
    });
    // User has no feedback for this article
    env._mocks.first.mockResolvedValueOnce(null);

    const result = await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'abc123' },
      user: { user_hash: 'user1' },
    });

    expect(result.body.data.user_feedback).toBeNull();
  });

  it('does not query user feedback when user is null (public access)', async () => {
    env._mocks.all.mockResolvedValueOnce({ results: [] });

    await getArticleFeedbackStats({}, env, {}, {
      params: { article_id: 'abc123' },
      user: null,
    });

    // Only one prepare call (stats), no user feedback query
    expect(env._mocks.prepare).toHaveBeenCalledTimes(1);
  });
});
