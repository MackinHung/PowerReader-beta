/**
 * Rewards Handlers (T05 Integration)
 *
 * T05 (Reward System) defines the reward logic.
 * T01 provides D1-backed endpoints following T05's API contract.
 *
 * IMPORTANT: All reward data lives in D1 `users` table (NOT KV).
 * Decision #008: KV is cache-only, D1 is primary storage.
 *
 * Navigation:
 * - Upstream: shared/config.js (REWARD section), T05/REWARD_MECHANISM.md
 * - Downstream: T04 (reads points), T07 (monitors usage)
 * - Maintainer: T01 (route + storage) + T05 (business logic)
 * - Last Updated: 2026-03-07
 */

import { REWARD } from '../../../shared/config.js';
import { nowISO } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * POST /api/v1/rewards/submit — Process valid analysis submission
 * Called internally after quality gate passes.
 *
 * Body: { article_id, user_hash, time_spent_ms, quality_gate_result }
 * Note: field is `article_id` (SSOT), NOT `article_hash`.
 */
export async function submitReward(request, env, ctx, { params }) {
  const body = await request.json();
  const { article_id, user_hash, time_spent_ms, quality_gate_result } = body;

  // Validate required fields
  if (!article_id || !user_hash) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '缺少必要欄位' }
    });
  }

  // Anti-cheat: minimum analysis time (5000ms per T05 spec)
  if (time_spent_ms != null && time_spent_ms < REWARD.MIN_ANALYSIS_TIME_MS) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '分析時間過短' }
    });
  }

  // Check if user exists
  const userRow = await env.DB.prepare(
    'SELECT user_hash, total_points_cents, daily_analysis_count, cooldown_until FROM users WHERE user_hash = ?'
  ).bind(user_hash).first();

  if (!userRow) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到使用者' }
    });
  }

  // Check cooldown
  if (userRow.cooldown_until && new Date(userRow.cooldown_until) > new Date()) {
    return jsonResponse(429, {
      success: false, data: null,
      error: { type: 'rate_limit_exceeded', message: '冷卻中,請稍後再試' }
    });
  }

  // Check daily limit
  if (userRow.daily_analysis_count >= REWARD.DAILY_ANALYSIS_LIMIT) {
    return jsonResponse(429, {
      success: false, data: null,
      error: { type: 'rate_limit_exceeded', message: '今日分析次數已達上限' }
    });
  }

  // Check duplicate (article_id + user_hash already analyzed)
  const existing = await env.DB.prepare(
    'SELECT id FROM analyses WHERE article_id = ? AND user_hash = ?'
  ).bind(article_id, user_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'validation_error', message: '已對此文章提交過分析' }
    });
  }

  // Award random points if quality gate passed (weighted tiers)
  const pointsAwarded = quality_gate_result === 'passed'
    ? rollPointRewardInline(REWARD.POINT_TIERS)
    : 0;

  const newTotalCents = userRow.total_points_cents + pointsAwarded;

  // Update user record (D1, NOT KV)
  await env.DB.prepare(`
    UPDATE users SET
      total_points_cents = ?,
      contribution_count = contribution_count + 1,
      daily_analysis_count = daily_analysis_count + 1,
      consecutive_failures = 0,
      last_contribution_at = ?,
      updated_at = ?
    WHERE user_hash = ?
  `).bind(
    newTotalCents,
    nowISO(), nowISO(), user_hash
  ).run();

  return jsonResponse(200, {
    success: true,
    data: {
      article_id,
      user_hash,
      points_awarded_cents: pointsAwarded,
      total_points_cents: newTotalCents,
      display_points: (newTotalCents / 100).toFixed(2),
      daily_analysis_count: userRow.daily_analysis_count + 1
    },
    error: null
  });
}

/**
 * Roll a random point reward using weighted tiers.
 * Inline for Workers environment (can't import T05 path).
 */
function rollPointRewardInline(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 10;
  const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0);
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const roll = arr[0] % totalWeight;
  let cumulative = 0;
  for (const tier of tiers) {
    cumulative += tier.weight;
    if (roll < cumulative) return tier.cents;
  }
  return tiers[tiers.length - 1].cents;
}

/**
 * POST /api/v1/rewards/failure — Record quality gate failure
 * Increments consecutive_failures, applies cooldown after threshold.
 *
 * Body: { user_hash, article_id, failure_reason }
 */
export async function recordFailure(request, env, ctx, { params }) {
  const body = await request.json();
  const { user_hash, article_id, failure_reason } = body;

  if (!user_hash) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '缺少 user_hash' }
    });
  }

  const userRow = await env.DB.prepare(
    'SELECT consecutive_failures FROM users WHERE user_hash = ?'
  ).bind(user_hash).first();

  if (!userRow) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到使用者' }
    });
  }

  const newFailures = userRow.consecutive_failures + 1;
  let cooldownUntil = null;

  // Apply cooldown if consecutive failures exceed threshold
  if (newFailures >= REWARD.CONSECUTIVE_FAILURE_COOLDOWN) {
    const cooldownMs = REWARD.COOLDOWN_DURATION_MIN * 60 * 1000;
    cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  }

  await env.DB.prepare(`
    UPDATE users SET
      consecutive_failures = ?,
      cooldown_until = ?,
      updated_at = ?
    WHERE user_hash = ?
  `).bind(newFailures, cooldownUntil, nowISO(), user_hash).run();

  return jsonResponse(200, {
    success: true,
    data: {
      user_hash,
      consecutive_failures: newFailures,
      cooldown_applied: cooldownUntil !== null,
      cooldown_until: cooldownUntil
    },
    error: null
  });
}

/**
 * GET /api/v1/rewards/me — Get user's reward summary
 * Same data as /user/me/points but via T05's preferred route.
 *
 * Note: Uses Service Token auth (internal), NOT JWT.
 * Query param: user_hash (required)
 */
export async function getRewardsSummary(request, env, ctx, { url }) {
  const user_hash = url.searchParams.get('user_hash');

  if (!user_hash) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '缺少 user_hash 參數' }
    });
  }

  const row = await env.DB.prepare(`
    SELECT total_points_cents, contribution_count, vote_rights,
      daily_analysis_count, consecutive_failures, cooldown_until,
      last_contribution_at
    FROM users WHERE user_hash = ?
  `).bind(user_hash).first();

  if (!row) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到使用者' }
    });
  }

  return jsonResponse(200, {
    success: true,
    data: {
      user_hash,
      total_points_cents: row.total_points_cents,
      display_points: (row.total_points_cents / 100).toFixed(2),
      contribution_count: row.contribution_count,
      vote_rights: row.vote_rights,
      daily_analysis_count: row.daily_analysis_count,
      consecutive_failures: row.consecutive_failures,
      cooldown_until: row.cooldown_until,
      in_cooldown: row.cooldown_until ? new Date(row.cooldown_until) > new Date() : false,
      last_contribution_at: row.last_contribution_at
    },
    error: null
  });
}

