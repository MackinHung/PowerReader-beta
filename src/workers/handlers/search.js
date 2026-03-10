/**
 * Search Handler (B9)
 *
 * GET /api/v1/search?q=keyword — full-text search on article title/summary
 *
 * Auth: none (public)
 * Uses D1 LIKE for text search.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateSearchQuery } from '../../../shared/validators.js';
import { escapeHtml } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * Escape SQL LIKE special characters in user input.
 * Prevents `%` and `_` from acting as wildcards.
 */
function escapeLikePattern(str) {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

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
 * GET /api/v1/search?q=keyword&type=articles&page=1&limit=20
 */
export async function searchArticles(request, env, ctx, { url }) {
  const query = url.searchParams.get('q') || '';

  const validation = validateSearchQuery(query);
  if (!validation.valid) {
    return jsonResponse(400, {
      success: false,
      data: null,
      error: { type: 'validation_error', message: validation.errors[0], details: validation.errors },
    });
  }

  const { page, limit, offset } = parsePagination(url, 50);
  const escapedKeyword = escapeLikePattern(query.trim());
  const likePattern = `%${escapedKeyword}%`;

  // Count total matches
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM articles
     WHERE (title LIKE ?1 ESCAPE '\\' OR summary LIKE ?1 ESCAPE '\\')
     AND status = 'published'`
  ).bind(likePattern).first();
  const total = countResult?.total || 0;

  // Fetch matching articles
  const rows = await env.DB.prepare(
    `SELECT article_id, title, summary, source, published_at, camp_ratio
     FROM articles
     WHERE (title LIKE ?1 ESCAPE '\\' OR summary LIKE ?1 ESCAPE '\\')
     AND status = 'published'
     ORDER BY published_at DESC
     LIMIT ? OFFSET ?`
  ).bind(likePattern, limit, offset).all();

  const items = (rows.results || []).map((row) => ({
    article_id: row.article_id,
    title: row.title ? escapeHtml(row.title) : row.title,
    summary: row.summary ? escapeHtml(row.summary) : row.summary,
    source: row.source,
    published_at: row.published_at,
    camp_ratio: typeof row.camp_ratio === 'string'
      ? safeJsonParse(row.camp_ratio, null)
      : row.camp_ratio,
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
