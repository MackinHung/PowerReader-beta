/**
 * Points Handler
 *
 * T05 (Reward System) provides points logic.
 * Vote endpoints deferred to Phase 2+.
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { nowISO } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * GET /api/v1/user/me/points — Get personal points and vote rights
 */
export async function getPoints(request, env, ctx, { user }) {
  const row = await env.DB.prepare(`
    SELECT total_points_cents, contribution_count, vote_rights,
      daily_analysis_count, last_contribution_at
    FROM users WHERE user_hash = ?
  `).bind(user.user_hash).first();

  if (!row) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  return jsonResponse(200, {
    success: true,
    data: {
      total_points_cents: row.total_points_cents,
      display_points: (row.total_points_cents / 100).toFixed(2),
      contribution_count: row.contribution_count,
      vote_rights: row.vote_rights,
      daily_analysis_count: row.daily_analysis_count,
      last_contribution_at: row.last_contribution_at
    },
    error: null
  });
}

