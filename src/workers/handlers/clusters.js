/**
 * Clusters Handlers
 *
 * GET /api/v1/clusters          — list pre-computed event clusters
 * GET /api/v1/clusters/:cluster_id — cluster detail with articles
 *
 * Auth: none (public)
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { escapeHtml } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

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
 * GET /api/v1/clusters?page=1&limit=20&category=政治
 *
 * Returns pre-computed event clusters ordered by latest_published_at DESC.
 * Also includes unclustered article_ids from last 48h for the "other articles" section.
 */
export async function getClusters(request, env, ctx, { url }) {
  const { page, limit, offset } = parsePagination(url, 50);

  const conditions = [];
  const params = [];

  // Optional category filter
  const category = url.searchParams.get('category');
  if (category && category !== 'all') {
    conditions.push('category = ?');
    params.push(category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM event_clusters ${whereClause}`
  ).bind(...params).first();
  const total = countResult?.total || 0;

  // Fetch clusters page
  const rows = await env.DB.prepare(`
    SELECT cluster_id, representative_title, article_count, source_count,
           camp_distribution, sources_json, article_ids,
           avg_controversy_score, max_controversy_level, category,
           is_blindspot, blindspot_type, missing_camp,
           earliest_published_at, latest_published_at
    FROM event_clusters ${whereClause}
    ORDER BY latest_published_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const clusters = (rows.results || []).map(row => ({
    cluster_id: row.cluster_id,
    representative_title: row.representative_title ? escapeHtml(row.representative_title) : '',
    article_count: row.article_count,
    source_count: row.source_count,
    camp_distribution: safeJsonParse(row.camp_distribution, { green: 0, white: 0, blue: 0 }),
    sources_json: safeJsonParse(row.sources_json, []),
    article_ids: safeJsonParse(row.article_ids, []),
    avg_controversy_score: row.avg_controversy_score,
    max_controversy_level: row.max_controversy_level,
    category: row.category,
    is_blindspot: row.is_blindspot === 1,
    blindspot_type: row.blindspot_type,
    missing_camp: row.missing_camp,
    earliest_published_at: row.earliest_published_at,
    latest_published_at: row.latest_published_at,
  }));

  // Collect all clustered article IDs for the "unclustered" query
  const allClusteredIds = new Set();
  for (const c of clusters) {
    for (const id of c.article_ids) {
      allClusteredIds.add(id);
    }
  }

  // Find unclustered articles from last 48h (not in any cluster)
  // Only compute on page 1 to avoid redundant queries
  let unclusteredArticleIds = [];
  if (page === 1) {
    const allClusterArticleRows = await env.DB.prepare(`
      SELECT article_ids FROM event_clusters
    `).all();

    const globalClusteredIds = new Set();
    for (const r of (allClusterArticleRows.results || [])) {
      const ids = safeJsonParse(r.article_ids, []);
      for (const id of ids) globalClusteredIds.add(id);
    }

    const recentRows = await env.DB.prepare(`
      SELECT article_id FROM articles
      WHERE datetime(published_at) >= datetime('now', '-2 days')
      ORDER BY published_at DESC
      LIMIT 200
    `).all();

    unclusteredArticleIds = (recentRows.results || [])
      .map(r => r.article_id)
      .filter(id => !globalClusteredIds.has(id));
  }

  return jsonResponse(200, {
    success: true,
    data: {
      clusters,
      unclustered_article_ids: unclusteredArticleIds,
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
 * GET /api/v1/clusters/:cluster_id
 *
 * Returns cluster detail with full article data for each article in the cluster.
 */
export async function getClusterDetail(request, env, ctx, { params }) {
  const { cluster_id } = params;

  const row = await env.DB.prepare(`
    SELECT cluster_id, representative_title, article_count, source_count,
           camp_distribution, sources_json, article_ids,
           avg_controversy_score, max_controversy_level, category,
           is_blindspot, blindspot_type, missing_camp,
           earliest_published_at, latest_published_at
    FROM event_clusters WHERE cluster_id = ?
  `).bind(cluster_id).first();

  if (!row) {
    return jsonResponse(404, {
      success: false,
      data: null,
      error: { type: 'not_found', message: '找不到請求的事件集群' },
    });
  }

  const articleIds = safeJsonParse(row.article_ids, []);

  // Fetch full article data for each article in the cluster
  let articles = [];
  if (articleIds.length > 0) {
    const placeholders = articleIds.map(() => '?').join(',');
    const articleRows = await env.DB.prepare(`
      SELECT article_id, title, summary, source, published_at,
             bias_score, controversy_score, controversy_level, camp_ratio
      FROM articles
      WHERE article_id IN (${placeholders})
      ORDER BY published_at DESC
    `).bind(...articleIds).all();

    articles = (articleRows.results || []).map(a => ({
      article_id: a.article_id,
      title: a.title ? escapeHtml(a.title) : a.title,
      summary: a.summary ? escapeHtml(a.summary) : a.summary,
      source: a.source,
      published_at: a.published_at,
      bias_score: a.bias_score,
      controversy_score: a.controversy_score,
      controversy_level: a.controversy_level,
      camp_ratio: typeof a.camp_ratio === 'string'
        ? safeJsonParse(a.camp_ratio, null)
        : a.camp_ratio,
    }));
  }

  return jsonResponse(200, {
    success: true,
    data: {
      cluster: {
        cluster_id: row.cluster_id,
        representative_title: row.representative_title ? escapeHtml(row.representative_title) : '',
        article_count: row.article_count,
        source_count: row.source_count,
        camp_distribution: safeJsonParse(row.camp_distribution, { green: 0, white: 0, blue: 0 }),
        sources_json: safeJsonParse(row.sources_json, []),
        avg_controversy_score: row.avg_controversy_score,
        max_controversy_level: row.max_controversy_level,
        category: row.category,
        is_blindspot: row.is_blindspot === 1,
        blindspot_type: row.blindspot_type,
        missing_camp: row.missing_camp,
        earliest_published_at: row.earliest_published_at,
        latest_published_at: row.latest_published_at,
      },
      articles,
    },
    error: null,
  });
}
