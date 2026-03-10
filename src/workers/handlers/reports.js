/**
 * Report Handlers (B7)
 *
 * POST /api/v1/articles/:article_id/report — Report article data error
 * POST /api/v1/analyses/:analysis_id/report — Report problematic analysis
 *
 * Auth: JWT required for both endpoints.
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateReport } from '../../../shared/validators.js';
import { nowISO, escapeHtml } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * POST /api/v1/articles/:article_id/report — Report article data error
 * Auth: JWT required
 */
export async function reportArticle(request, env, ctx, { params, user }) {
  if (!user) {
    return jsonResponse(401, {
      success: false, data: null,
      error: { type: 'auth_required', message: '請先登入' },
    });
  }

  const body = await request.json();
  const validation = validateReport(body);

  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors },
    });
  }

  const { article_id } = params;
  const reporter_hash = user.user_hash;

  // Verify article exists
  const article = await env.DB.prepare(
    'SELECT article_id FROM articles WHERE article_id = ?',
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' },
    });
  }

  // Check duplicate report
  const existing = await env.DB.prepare(
    'SELECT id FROM reports WHERE target_type = ? AND target_id = ? AND reporter_hash = ?',
  ).bind('article', article_id, reporter_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'validation_error', message: '您已對此內容提交過檢舉' },
    });
  }

  const now = nowISO();
  const description = body.description != null ? escapeHtml(body.description) : null;

  await env.DB.prepare(`
    INSERT INTO reports (target_type, target_id, reporter_hash, reason, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind('article', article_id, reporter_hash, body.reason, description, now, now).run();

  return jsonResponse(201, {
    success: true,
    data: {
      target_type: 'article',
      target_id: article_id,
      reason: body.reason,
      status: 'pending',
    },
    error: null,
  });
}

/**
 * POST /api/v1/analyses/:analysis_id/report — Report problematic analysis
 * Auth: JWT required
 */
export async function reportAnalysis(request, env, ctx, { params, user }) {
  if (!user) {
    return jsonResponse(401, {
      success: false, data: null,
      error: { type: 'auth_required', message: '請先登入' },
    });
  }

  const body = await request.json();
  const validation = validateReport(body);

  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors },
    });
  }

  const { analysis_id } = params;
  const reporter_hash = user.user_hash;

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

  // Check duplicate report
  const existing = await env.DB.prepare(
    'SELECT id FROM reports WHERE target_type = ? AND target_id = ? AND reporter_hash = ?',
  ).bind('analysis', analysis_id, reporter_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'validation_error', message: '您已對此內容提交過檢舉' },
    });
  }

  const now = nowISO();
  const description = body.description != null ? escapeHtml(body.description) : null;

  await env.DB.prepare(`
    INSERT INTO reports (target_type, target_id, reporter_hash, reason, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind('analysis', analysis_id, reporter_hash, body.reason, description, now, now).run();

  return jsonResponse(201, {
    success: true,
    data: {
      target_type: 'analysis',
      target_id: analysis_id,
      reason: body.reason,
      status: 'pending',
    },
    error: null,
  });
}
