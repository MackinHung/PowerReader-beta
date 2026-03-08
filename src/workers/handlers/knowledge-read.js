/**
 * Knowledge Read Handlers (Public)
 *
 * Public endpoint for fetching pre-matched knowledge entries for an article.
 * Uses Vectorize for vector similarity search + D1 for metadata.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { escapeHtml } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * GET /api/v1/articles/:article_id/knowledge — Knowledge for an article
 * Pre-queried knowledge entries matched via Vectorize at ingestion time.
 */
export async function getArticleKnowledge(request, env, ctx, { params }) {
  const { article_id } = params;

  const article = await env.DB.prepare(
    'SELECT knowledge_ids, title FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  const knowledgeIds = JSON.parse(article.knowledge_ids || '[]');

  if (knowledgeIds.length === 0) {
    return jsonResponse(200, {
      success: true,
      data: { knowledge_entries: [], total: 0 },
      error: null
    });
  }

  // Fetch full content from D1 (richer than Vectorize metadata)
  const placeholders = knowledgeIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT id, type, title, content, party, metadata FROM knowledge_entries WHERE id IN (${placeholders})`
  ).bind(...knowledgeIds).all();

  const entries = (rows.results || []).map(row => ({
    id: row.id,
    type: row.type,
    title: escapeHtml(row.title),
    content: escapeHtml(row.content),
    snippet: escapeHtml((row.content || '').slice(0, 200)),
    party: row.party,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));

  return jsonResponse(200, {
    success: true,
    data: { knowledge_entries: entries, total: entries.length },
    error: null
  });
}
