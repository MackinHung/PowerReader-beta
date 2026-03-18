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
import { jsonResponse } from '../../../shared/response.js';

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
  // T05 spec: 5000ms aligns with Qwen3-4B WebLLM inference (~6s)
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

  // Check duplicate analysis — global one-per-article limit
  // Once ANY user has analyzed an article, NO ONE can analyze it again.
  const existing = await env.DB.prepare(
    'SELECT id FROM analyses WHERE article_id = ?'
  ).bind(article_id).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'already_analyzed', message: '此文章已被分析過' }
    });
  }

  // Server-side computation
  const bias_category = getBiasCategory(body.bias_score);
  const controversy_level = getControversyLevel(body.controversy_score);

  // Quality gate validation (4-layer: format, range, consistency, duplicate)
  const { result: quality_gate_result, scores: quality_scores } = runQualityGates(body);

  // Serialize JSON fields
  const campRatioJson = body.camp_ratio ? JSON.stringify(body.camp_ratio) : null;
  const narrativePointsJson = Array.isArray(body.narrative_points) ? JSON.stringify(body.narrative_points) : null;
  const inferenceMode = body.inference_mode || null;

  // Insert analysis (using authenticated user_hash, not body.user_hash)
  // Race condition guard: UNIQUE(article_id) constraint catches concurrent inserts.
  try {
    await env.DB.prepare(`
      INSERT INTO analyses (article_id, user_hash, bias_score, bias_category,
        controversy_score, controversy_level, reasoning, key_phrases,
        quality_gate_result, quality_scores, prompt_version, camp_ratio,
        narrative_points, inference_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      article_id, user_hash, body.bias_score, bias_category,
      body.controversy_score, controversy_level, body.reasoning,
      JSON.stringify(body.key_phrases), quality_gate_result,
      JSON.stringify(quality_scores), body.prompt_version, campRatioJson,
      narrativePointsJson, inferenceMode
    ).run();
  } catch (err) {
    // UNIQUE constraint violation = another user submitted first (race condition)
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return jsonResponse(409, {
        success: false, data: null,
        error: { type: 'already_analyzed', message: '此文章已被分析過' }
      });
    }
    throw err; // Re-throw unexpected errors
  }

  // Update article analysis count + user daily count (batch for efficiency)
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE articles SET
        analysis_count = analysis_count + 1,
        bias_score = ?, bias_category = ?,
        controversy_score = ?, controversy_level = ?,
        camp_ratio = COALESCE(?, camp_ratio),
        updated_at = ?
      WHERE article_id = ?
    `).bind(
      body.bias_score, bias_category,
      body.controversy_score, controversy_level,
      campRatioJson, nowISO(), article_id
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

  // Award random points for valid analysis (T05: weighted tiers, 10-50 cents)
  let pointsAwardedCents = 0;
  if (quality_gate_result === 'passed') {
    try {
      pointsAwardedCents = rollPointRewardInline(REWARD.POINT_TIERS);
      await env.DB.prepare(`
        UPDATE users SET
          total_points_cents = total_points_cents + ?
        WHERE user_hash = ?
      `).bind(
        pointsAwardedCents,
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

  // Fetch updated points for response feedback
  let pointsData = null;
  if (quality_gate_result === 'passed') {
    try {
      const updatedUser = await env.DB.prepare(
        'SELECT total_points_cents, vote_rights, contribution_count FROM users WHERE user_hash = ?'
      ).bind(user_hash).first();
      if (updatedUser) {
        pointsData = {
          points_awarded_cents: pointsAwardedCents,
          total_points_cents: updatedUser.total_points_cents,
          display_points: (updatedUser.total_points_cents / 100).toFixed(2),
          contribution_count: updatedUser.contribution_count
        };
      }
    } catch {
      // Points fetch failure is non-fatal
    }
  }

  return jsonResponse(201, {
    success: true,
    data: {
      article_id,
      bias_score: body.bias_score,
      bias_category,
      controversy_score: body.controversy_score,
      controversy_level,
      camp_ratio: body.camp_ratio || null,
      quality_gate_result,
      reward: pointsData
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
      reasoning, key_phrases, quality_gate_result, prompt_version, camp_ratio, created_at
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
        ),
        camp_ratio: row.camp_ratio ? JSON.parse(row.camp_ratio) : null
      })),
      total: rows.results?.length || 0
    },
    error: null
  });
}

/**
 * Quality Gates — 4-layer validation for analysis submissions.
 * Layer 1 (Format): Type checks on all fields
 * Layer 2 (Range): Value range validation
 * Layer 3 (Consistency): Skipped — requires historical data
 * Layer 4 (Duplicate): Handled upstream (L81-89)
 *
 * @param {object} body - Analysis submission body
 * @returns {{ result: string, scores: object }}
 */
/**
 * Roll a random point reward using weighted tiers.
 * Inline version for Workers environment (can't import T05 path).
 * Uses crypto.getRandomValues() for secure randomness.
 *
 * @param {Array<{cents: number, weight: number}>} tiers
 * @returns {number} cents value
 */
function rollPointRewardInline(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return 10; // fallback to 0.1 pt
  }
  const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0);
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const roll = arr[0] % totalWeight;
  let cumulative = 0;
  for (const tier of tiers) {
    cumulative += tier.weight;
    if (roll < cumulative) {
      return tier.cents;
    }
  }
  return tiers[tiers.length - 1].cents;
}

function runQualityGates(body) {
  const scores = {
    format_valid: true,
    range_valid: true,
    consistency_valid: true,  // Layer 3: skipped, needs historical data
    duplicate_valid: true     // Layer 4: handled upstream
  };

  // Layer 1: Format validation
  if (typeof body.bias_score !== 'number' ||
      typeof body.controversy_score !== 'number' ||
      typeof body.reasoning !== 'string' ||
      !Array.isArray(body.key_phrases)) {
    scores.format_valid = false;
    return { result: 'failed_format', scores };
  }

  // Layer 2: Range validation
  const biasInRange = Number.isInteger(body.bias_score) &&
    body.bias_score >= 0 && body.bias_score <= 100;
  const contInRange = Number.isInteger(body.controversy_score) &&
    body.controversy_score >= 0 && body.controversy_score <= 100;
  const reasoningLen = body.reasoning.length >= 10 && body.reasoning.length <= 500;
  const phrasesValid = body.key_phrases.length >= 1 &&
    body.key_phrases.length <= 10 &&
    body.key_phrases.every(p => typeof p === 'string');

  if (!biasInRange || !contInRange || !reasoningLen || !phrasesValid) {
    scores.range_valid = false;
    return { result: 'failed_range', scores };
  }

  return { result: 'passed', scores };
}

