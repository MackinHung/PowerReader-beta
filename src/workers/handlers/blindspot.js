/**
 * Blindspot Handlers
 *
 * GET /api/v1/blindspot/events — paginated blindspot events
 *
 * Blindspot = an event cluster where one or more camps have no coverage.
 * Populated by cron (see index.js scheduled handler).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { jsonResponse } from '../../../shared/response.js';
import { escapeHtml } from '../../../shared/utils.js';
import { scanBlindspots, updateSourceTendency } from './cron-blindspot.js';

// Valid blindspot types (whitelist for SQL injection prevention)
const VALID_TYPES = ['green_only', 'blue_only', 'white_missing', 'imbalanced'];

/**
 * GET /api/v1/blindspot/events — Paginated blindspot events
 */
export async function getBlindspotEvents(request, env, ctx, { url }) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  // Optional type filter
  const conditions = [];
  const params = [];

  const typeFilter = url.searchParams.get('type');
  if (typeFilter && VALID_TYPES.includes(typeFilter)) {
    conditions.push('blindspot_type = ?');
    params.push(typeFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM blindspot_events ${whereClause}`
  ).bind(...params).first();
  const total = countResult?.total || 0;

  // Fetch page (newest first)
  const rows = await env.DB.prepare(`
    SELECT id, cluster_id, representative_title, blindspot_type,
           camp_distribution, missing_camp, article_count, source_count, article_ids, detected_at
    FROM blindspot_events ${whereClause}
    ORDER BY detected_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const events = (rows.results || []).map(row => ({
    cluster_id: row.cluster_id,
    title: row.representative_title ? escapeHtml(row.representative_title) : '',
    blindspot_type: row.blindspot_type,
    camp_distribution: safeJsonParse(row.camp_distribution, { green: 0, white: 0, blue: 0 }),
    missing_camp: row.missing_camp,
    article_count: row.article_count,
    source_count: row.source_count,
    article_ids: safeJsonParse(row.article_ids, []),
    detected_at: row.detected_at
  }));

  return jsonResponse(200, {
    success: true,
    data: {
      blindspot_events: events,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    },
    error: null
  });
}

/**
 * POST /api/v1/blindspot/scan — Admin trigger for blindspot scan + source tendency
 */
export async function triggerBlindspotScan(request, env) {
  await scanBlindspots(env);
  await updateSourceTendency(env);

  return jsonResponse(200, {
    success: true,
    data: { message: 'Blindspot scan and source tendency update completed' },
    error: null
  });
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
