/**
 * Analysis Feedback Handlers (B1)
 *
 * POST /api/v1/analyses/:analysis_id/feedback — Submit feedback on analysis
 * GET  /api/v1/analyses/:analysis_id/feedback/stats — Get analysis feedback stats
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateFeedback } from '../../../shared/validators.js';
import { nowISO } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * POST /api/v1/analyses/:analysis_id/feedback — Submit feedback on analysis
 * Auth: JWT required
 */
export async function submitAnalysisFeedback(request, env, ctx, { params, user }) {
  if (!user) {
    return jsonResponse(401, {
      success: false, data: null,
      error: { type: 'auth_required', message: '請先登入' },
    });
  }

  const body = await request.json();
  const validation = validateFeedback(body);

  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors },
    });
  }

  const { analysis_id } = params;
  const user_hash = user.user_hash;

  // Verify analysis exists
  const analysis = await env.DB.prepare(
    'SELECT id FROM analyses WHERE id = ?',
  ).bind(analysis_id).first();

  if (!analysis) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' },
    });
  }

  // Check if user already submitted feedback (one-time only, no retraction)
  const existing = await env.DB.prepare(
    'SELECT id FROM analysis_feedback WHERE analysis_id = ? AND user_hash = ?'
  ).bind(analysis_id, user_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false,
      data: null,
      error: { type: 'already_submitted', message: '您已提交過回饋' },
    });
  }

  const now = nowISO();
  await env.DB.prepare(`
    INSERT INTO analysis_feedback (analysis_id, user_hash, type, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(analysis_id, user_hash, body.type, now).run();

  return jsonResponse(200, {
    success: true,
    data: {
      analysis_id,
      type: body.type,
    },
    error: null,
  });
}

/**
 * GET /api/v1/analyses/:analysis_id/feedback/stats — Get analysis feedback stats
 * Auth: none (public), if JWT include user's feedback
 */
export async function getAnalysisFeedbackStats(request, env, ctx, { params, user }) {
  const { analysis_id } = params;

  // Aggregate counts by type
  const statsRows = await env.DB.prepare(
    'SELECT type, COUNT(*) AS count FROM analysis_feedback WHERE analysis_id = ? GROUP BY type',
  ).bind(analysis_id).all();

  const results = statsRows.results || [];
  const likes = results.find((r) => r.type === 'like')?.count || 0;
  const dislikes = results.find((r) => r.type === 'dislike')?.count || 0;

  // Fetch user's own feedback if authenticated
  let user_feedback = null;
  if (user) {
    const userRow = await env.DB.prepare(
      'SELECT type FROM analysis_feedback WHERE analysis_id = ? AND user_hash = ?',
    ).bind(analysis_id, user.user_hash).first();
    user_feedback = userRow?.type || null;
  }

  return jsonResponse(200, {
    success: true,
    data: {
      likes,
      dislikes,
      total: likes + dislikes,
      user_feedback,
    },
    error: null,
  });
}
