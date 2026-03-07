/**
 * Analysis Handlers
 *
 * T03 (AI Inference) submits Qwen analysis results.
 * Server-side: compute categories, run quality gates, transition status.
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateAnalysis } from '../../../shared/validators.js';
import { getBiasCategory, getControversyLevel } from '../../../shared/enums.js';
import { transitionStatus } from '../../../shared/state-machine.js';
import { nowISO, escapeHtml } from '../../../shared/utils.js';
import { REWARD } from '../../../shared/config.js';

/**
 * POST /api/v1/articles/:article_id/analysis — Submit analysis result
 */
export async function createAnalysis(request, env, ctx, { params, user }) {
  const { article_id } = params;
  const body = await request.json();

  // SECURITY: Use authenticated user_hash from JWT, NOT from request body!
  // OceanRAG lesson: never trust client-provided identity
  const user_hash = user.user_hash;

  // Validate input
  const validation = validateAnalysis(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors }
    });
  }

  // Anti-cheat: check daily limit + cooldown (from REWARD config)
  const userRow = await env.DB.prepare(
    'SELECT daily_analysis_count, cooldown_until FROM users WHERE user_hash = ?'
  ).bind(user_hash).first();

  if (userRow) {
    // Check cooldown
    if (userRow.cooldown_until && new Date(userRow.cooldown_until) > new Date()) {
      return jsonResponse(429, {
        success: false, data: null,
        error: { type: 'rate_limit_exceeded', message: '您已暫時被限制提交分析,請稍後再試' }
      });
    }

    // Check daily analysis limit
    if (userRow.daily_analysis_count >= REWARD.DAILY_ANALYSIS_LIMIT) {
      return jsonResponse(429, {
        success: false, data: null,
        error: { type: 'rate_limit_exceeded', message: '今日分析次數已達上限' }
      });
    }
  }

  // Anti-cheat: minimum analysis time (blocks instant automated submissions)
  // T05 spec: 5000ms aligns with Qwen3.5-4B inference (~6s)
  if (body.analysis_duration_ms != null && body.analysis_duration_ms < REWARD.MIN_ANALYSIS_TIME_MS) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '分析時間過短,請仔細閱讀文章後再提交' }
    });
  }

  // Verify article exists and is in correct state
  const article = await env.DB.prepare(
    'SELECT article_id, status FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  // Check duplicate analysis (one per user per article)
  const existing = await env.DB.prepare(
    'SELECT id FROM analyses WHERE article_id = ? AND user_hash = ?'
  ).bind(article_id, user_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'validation_error', message: '您已對此文章提交過分析' }
    });
  }

  // Server-side computation
  const bias_category = getBiasCategory(body.bias_score);
  const controversy_level = getControversyLevel(body.controversy_score);

  // Quality gate validation (T03 provides full logic; stub here)
  // 4-layer: format, range, consistency, duplicate
  const quality_gate_result = 'passed'; // TODO: T03 implements full gate logic
  const quality_scores = {
    format_valid: true,
    range_valid: true,
    consistency_valid: true,
    duplicate_valid: true
  };

  // Insert analysis (using authenticated user_hash, not body.user_hash)
  await env.DB.prepare(`
    INSERT INTO analyses (article_id, user_hash, bias_score, bias_category,
      controversy_score, controversy_level, reasoning, key_phrases,
      quality_gate_result, quality_scores, prompt_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    article_id, user_hash, body.bias_score, bias_category,
    body.controversy_score, controversy_level, body.reasoning,
    JSON.stringify(body.key_phrases), quality_gate_result,
    JSON.stringify(quality_scores), body.prompt_version
  ).run();

  // Update article analysis count + user daily count (batch for efficiency)
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE articles SET
        analysis_count = analysis_count + 1,
        bias_score = ?, bias_category = ?,
        controversy_score = ?, controversy_level = ?,
        updated_at = ?
      WHERE article_id = ?
    `).bind(
      body.bias_score, bias_category,
      body.controversy_score, controversy_level,
      nowISO(), article_id
    ),
    env.DB.prepare(`
      UPDATE users SET
        daily_analysis_count = daily_analysis_count + 1,
        contribution_count = contribution_count + 1,
        last_contribution_at = ?,
        updated_at = ?
      WHERE user_hash = ?
    `).bind(nowISO(), nowISO(), user_hash)
  ]);

  // Award points for valid analysis (T05: integer cents, 10 cents = 0.1 points)
  if (quality_gate_result === 'passed') {
    try {
      await env.DB.prepare(`
        UPDATE users SET
          total_points_cents = total_points_cents + ?,
          vote_rights = (total_points_cents + ?) / ?
        WHERE user_hash = ?
      `).bind(
        REWARD.POINTS_PER_VALID_ANALYSIS,
        REWARD.POINTS_PER_VALID_ANALYSIS,
        REWARD.POINTS_PER_VOTE_RIGHT,
        user_hash
      ).run();
    } catch {
      // Points awarding failure is non-fatal
    }
  }

  // State transition: deduplicated → analyzed → validated → published (auto)
  try {
    if (article.status === 'deduplicated') {
      await env.DB.prepare(
        'UPDATE articles SET status = ?, status_updated_at = ? WHERE article_id = ?'
      ).bind('analyzed', nowISO(), article_id).run();
    }

    if (quality_gate_result === 'passed') {
      // analyzed → validated → published (auto-publish, Decision #003 Method A)
      await env.DB.prepare(
        'UPDATE articles SET status = ?, status_updated_at = ? WHERE article_id = ?'
      ).bind('published', nowISO(), article_id).run();
    }
  } catch {
    // Status transition failure is non-fatal; analysis is still recorded
  }

  return jsonResponse(201, {
    success: true,
    data: {
      article_id,
      bias_score: body.bias_score,
      bias_category,
      controversy_score: body.controversy_score,
      controversy_level,
      quality_gate_result
    },
    error: null
  });
}

/**
 * GET /api/v1/articles/:article_id/analyses — All analyses for an article
 */
export async function getAnalyses(request, env, ctx, { params }) {
  const { article_id } = params;

  const rows = await env.DB.prepare(`
    SELECT bias_score, bias_category, controversy_score, controversy_level,
      reasoning, key_phrases, quality_gate_result, prompt_version, created_at
    FROM analyses WHERE article_id = ? ORDER BY created_at DESC
  `).bind(article_id).all();

  return jsonResponse(200, {
    success: true,
    data: {
      analyses: (rows.results || []).map(row => ({
        ...row,
        reasoning: row.reasoning ? escapeHtml(row.reasoning) : row.reasoning,
        key_phrases: JSON.parse(row.key_phrases || '[]').map(kp =>
          typeof kp === 'string' ? escapeHtml(kp) : kp
        )
      })),
      total: rows.results?.length || 0
    },
    error: null
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
