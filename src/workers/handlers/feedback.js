/**
 * Feedback Handlers (A6 + A7)
 *
 * A6: POST /api/v1/articles/:article_id/feedback — submit like/dislike
 * A7: GET  /api/v1/articles/:article_id/feedback/stats — aggregated stats
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateFeedback } from '../../../shared/validators.js';
import { nowISO } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * POST /api/v1/articles/:article_id/feedback
 * Auth: JWT required
 * Upsert: if user already gave feedback, update the type
 */
export async function submitArticleFeedback(request, env, ctx, { params, user }) {
  // Auth check
  if (!user || !user.user_hash) {
    return jsonResponse(401, {
      success: false,
      data: null,
      error: { type: 'auth_required', message: '請先登入' },
    });
  }

  const { article_id } = params;
  const body = await request.json();
  const user_hash = user.user_hash;

  // Validate input
  const validation = validateFeedback(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      success: false,
      data: null,
      error: { type: 'validation_error', message: validation.errors.join(', ') },
    });
  }

  // Verify article exists
  const article = await env.DB.prepare(
    'SELECT article_id FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false,
      data: null,
      error: { type: 'not_found', message: '找不到請求的資源' },
    });
  }

  // Check if user already submitted feedback (one-time only, no retraction)
  const existing = await env.DB.prepare(
    'SELECT id FROM article_feedback WHERE article_id = ? AND user_hash = ?'
  ).bind(article_id, user_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false,
      data: null,
      error: { type: 'already_submitted', message: '您已提交過回饋' },
    });
  }

  await env.DB.prepare(
    `INSERT INTO article_feedback (article_id, user_hash, type, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(article_id, user_hash, body.type, nowISO()).run();

  return jsonResponse(200, {
    success: true,
    data: { article_id, type: body.type },
    error: null,
  });
}

/**
 * GET /api/v1/articles/:article_id/feedback/stats
 * Auth: none (public), but if JWT present, include user's own feedback
 * Returns: { likes, dislikes, total, user_feedback }
 */
export async function getArticleFeedbackStats(request, env, ctx, { params, user }) {
  const { article_id } = params;

  // Aggregate counts by type
  const statsRows = await env.DB.prepare(
    'SELECT type, COUNT(*) as count FROM article_feedback WHERE article_id = ? GROUP BY type'
  ).bind(article_id).all();

  let likes = 0;
  let dislikes = 0;
  for (const row of (statsRows.results || [])) {
    if (row.type === 'like') likes = row.count;
    if (row.type === 'dislike') dislikes = row.count;
  }

  // If authenticated, fetch user's own feedback
  let user_feedback = null;
  if (user && user.user_hash) {
    const userRow = await env.DB.prepare(
      'SELECT type FROM article_feedback WHERE article_id = ? AND user_hash = ?'
    ).bind(article_id, user.user_hash).first();
    user_feedback = userRow ? userRow.type : null;
  }

  return jsonResponse(200, {
    success: true,
    data: {
      article_id,
      likes,
      dislikes,
      total: likes + dislikes,
      user_feedback,
    },
    error: null,
  });
}
