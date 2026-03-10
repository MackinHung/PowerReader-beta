/**
 * Events Handlers (A1 + A2)
 *
 * A1: GET /api/v1/events — list blindspot event clusters
 * A2: GET /api/v1/events/:cluster_id — event detail with related articles
 *
 * Auth: none (public)
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { escapeHtml } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

// Valid blindspot types (whitelist for SQL injection prevention)
const VALID_TYPES = ['green_only', 'blue_only', 'white_missing', 'imbalanced'];

/**
 * Parse pagination params from URL with clamping.
 */
function parsePagination(url, maxLimit = 50) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Safe JSON parse with fallback.
 */
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Extract the first significant keyword from a title for related article search.
 * Skips common short/stop words.
 */
function extractSearchKeyword(title) {
  if (!title) return null;
  // Split on whitespace and punctuation, keep CJK and alphanumeric
  const words = title
    .replace(/[\s\p{P}\p{S}]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return words.length > 0 ? words[0] : null;
}

/**
 * GET /api/v1/events?page=1&limit=20&type=green_only
 */
export async function getEvents(request, env, ctx, { url }) {
  const { page, limit, offset } = parsePagination(url, 50);

  // Optional type filter (whitelisted)
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

  // Fetch page
  const rows = await env.DB.prepare(`
    SELECT cluster_id, representative_title, blindspot_type,
           camp_distribution, missing_camp, article_count, source_count, detected_at
    FROM blindspot_events ${whereClause}
    ORDER BY detected_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const items = (rows.results || []).map((row) => ({
    cluster_id: row.cluster_id,
    title: row.representative_title ? escapeHtml(row.representative_title) : '',
    blindspot_type: row.blindspot_type,
    camp_distribution: safeJsonParse(row.camp_distribution, { green: 0, white: 0, blue: 0 }),
    missing_camp: row.missing_camp,
    article_count: row.article_count,
    source_count: row.source_count,
    detected_at: row.detected_at,
  }));

  return jsonResponse(200, {
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    },
    error: null,
  });
}

/**
 * GET /api/v1/events/:cluster_id
 */
export async function getEventDetail(request, env, ctx, { params }) {
  const { cluster_id } = params;

  // Fetch the blindspot event
  const event = await env.DB.prepare(
    `SELECT cluster_id, representative_title, blindspot_type,
            camp_distribution, missing_camp, article_count, source_count, detected_at
     FROM blindspot_events WHERE cluster_id = ?`
  ).bind(cluster_id).first();

  if (!event) {
    return jsonResponse(404, {
      success: false,
      data: null,
      error: { type: 'not_found', message: '找不到請求的資源' },
    });
  }

  // Find related articles using a keyword from the representative title
  const keyword = extractSearchKeyword(event.representative_title);
  let articles = [];
  if (keyword) {
    const rows = await env.DB.prepare(
      `SELECT article_id, title, summary, source, published_at, camp_ratio
       FROM articles
       WHERE title LIKE ? AND status = 'published'
       ORDER BY published_at DESC
       LIMIT 50`
    ).bind(`%${keyword}%`).all();
    articles = (rows.results || []).map((row) => ({
      article_id: row.article_id,
      title: row.title ? escapeHtml(row.title) : row.title,
      summary: row.summary ? escapeHtml(row.summary) : row.summary,
      source: row.source,
      published_at: row.published_at,
      camp_ratio: typeof row.camp_ratio === 'string'
        ? safeJsonParse(row.camp_ratio, null)
        : row.camp_ratio,
    }));
  }

  return jsonResponse(200, {
    success: true,
    data: {
      event: {
        cluster_id: event.cluster_id,
        title: event.representative_title ? escapeHtml(event.representative_title) : '',
        blindspot_type: event.blindspot_type,
        camp_distribution: safeJsonParse(event.camp_distribution, { green: 0, white: 0, blue: 0 }),
        missing_camp: event.missing_camp,
        article_count: event.article_count,
        source_count: event.source_count,
        detected_at: event.detected_at,
      },
      articles,
    },
    error: null,
  });
}
