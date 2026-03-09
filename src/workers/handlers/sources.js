/**
 * Source Transparency Handlers
 *
 * GET /api/v1/sources — all source tendency profiles
 * GET /api/v1/sources/:source — detailed source transparency panel
 *
 * Tendency = 30-day rolling AVG(bias_score) per source.
 * Populated by cron (see index.js scheduled handler).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { jsonResponse } from '../../../shared/response.js';
import { escapeHtml } from '../../../shared/utils.js';

/**
 * GET /api/v1/sources — All source tendency profiles
 */
export async function getSources(request, env, ctx) {
  const rows = await env.DB.prepare(`
    SELECT source, avg_bias_score, camp, sample_count, confidence, last_updated
    FROM source_tendency
    ORDER BY sample_count DESC
  `).all();

  const sources = (rows.results || []).map(row => ({
    source: row.source,
    avg_bias_score: round2(row.avg_bias_score),
    camp: row.camp,
    sample_count: row.sample_count,
    confidence: row.confidence,
    last_updated: row.last_updated
  }));

  return jsonResponse(200, {
    success: true,
    data: { sources },
    error: null
  });
}

/**
 * GET /api/v1/sources/:source — Detailed source transparency
 */
export async function getSource(request, env, ctx, { params }) {
  const { source } = params;

  // Get tendency from pre-computed table
  const tendency = await env.DB.prepare(
    'SELECT * FROM source_tendency WHERE source = ?'
  ).bind(source).first();

  if (!tendency) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  // Camp distribution: count articles by camp (using bias_score boundaries)
  // GREEN_MAX=40, BLUE_MIN=60
  const distResult = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN bias_score <= 40 THEN 1 ELSE 0 END) AS green,
      SUM(CASE WHEN bias_score > 40 AND bias_score < 60 THEN 1 ELSE 0 END) AS white,
      SUM(CASE WHEN bias_score >= 60 THEN 1 ELSE 0 END) AS blue
    FROM articles
    WHERE source = ? AND bias_score IS NOT NULL
      AND datetime(published_at) >= datetime('now', '-30 days')
  `).bind(source).first();

  const campDistribution = {
    green: distResult?.green || 0,
    white: distResult?.white || 0,
    blue: distResult?.blue || 0
  };

  // Monthly trend (up to 6 months)
  const trendRows = await env.DB.prepare(`
    SELECT
      strftime('%Y-%m', published_at) AS month,
      AVG(bias_score) AS avg_bias,
      COUNT(*) AS count
    FROM articles
    WHERE source = ? AND bias_score IS NOT NULL
      AND datetime(published_at) >= datetime('now', '-180 days')
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).bind(source).all();

  const monthlyTrend = (trendRows.results || []).map(row => ({
    month: row.month,
    avg_bias: round2(row.avg_bias),
    count: row.count
  }));

  // Recent articles (top 10)
  const recentRows = await env.DB.prepare(`
    SELECT article_id, title, bias_score, published_at
    FROM articles
    WHERE source = ? AND bias_score IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 10
  `).bind(source).all();

  const recentArticles = (recentRows.results || []).map(row => ({
    article_id: row.article_id,
    title: row.title ? escapeHtml(row.title) : '',
    bias_score: row.bias_score,
    published_at: row.published_at
  }));

  return jsonResponse(200, {
    success: true,
    data: {
      source: tendency.source,
      tendency: {
        avg_bias_score: round2(tendency.avg_bias_score),
        camp: tendency.camp,
        sample_count: tendency.sample_count,
        window_days: tendency.window_days,
        confidence: tendency.confidence
      },
      camp_distribution: campDistribution,
      monthly_trend: monthlyTrend,
      recent_articles: recentArticles
    },
    error: null
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
