/**
 * Knowledge Handlers
 *
 * T03 maintains knowledge base entries (politician, media, topic, term, event).
 * Uses Vectorize for vector similarity search + D1 for metadata.
 *
 * Endpoints:
 *   GET  /api/v1/articles/:article_id/knowledge — Pre-matched knowledge for article
 *   POST /api/v1/knowledge/upsert               — Single entry upsert (Admin)
 *   POST /api/v1/knowledge/batch                 — Batch upsert (Admin)
 *   GET  /api/v1/knowledge/search?q=...          — Vector similarity search (Admin)
 *   GET  /api/v1/knowledge/list                  — List all entries from D1 (Admin)
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateKnowledge } from '../../../shared/validators.js';
import { CLOUDFLARE, MODELS } from '../../../shared/config.js';
import { nowISO, escapeHtml } from '../../../shared/utils.js';

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
    party: row.party,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));

  return jsonResponse(200, {
    success: true,
    data: { knowledge_entries: entries, total: entries.length },
    error: null
  });
}

/**
 * POST /api/v1/knowledge/upsert — Add/update single knowledge entry (Admin)
 * Embeds content via Workers AI bge-m3, stores in Vectorize + D1.
 */
export async function upsertKnowledge(request, env, ctx, { params }) {
  const body = await request.json();
  const validation = validateKnowledge(body);

  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors }
    });
  }

  const result = await embedAndStore(env, body);

  if (!result.success) {
    return jsonResponse(503, {
      success: false, data: null,
      error: { type: 'model_error', message: '系統錯誤,請稍後再試' }
    });
  }

  return jsonResponse(200, {
    success: true,
    data: result.data,
    error: null
  });
}

/**
 * POST /api/v1/knowledge/batch — Batch upsert knowledge entries (Admin)
 * Accepts array of entries, embeds each via bge-m3, stores in Vectorize + D1.
 * Max 50 entries per batch (Workers AI neuron budget).
 */
export async function batchUpsertKnowledge(request, env, ctx, { params }) {
  const body = await request.json();

  if (!body || !Array.isArray(body.entries)) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: 'entries must be an array' }
    });
  }

  if (body.entries.length > 50) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: 'Max 50 entries per batch' }
    });
  }

  // Validate all entries first
  const validationErrors = [];
  for (let i = 0; i < body.entries.length; i++) {
    const v = validateKnowledge(body.entries[i]);
    if (!v.valid) {
      validationErrors.push({ index: i, id: body.entries[i].id, errors: v.errors });
    }
  }

  if (validationErrors.length > 0) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '部分資料格式錯誤', details: validationErrors }
    });
  }

  // Batch embed all content texts in one Workers AI call
  const texts = body.entries.map(e => e.content);
  let vectors;
  try {
    const embResult = await env.AI.run(MODELS.EMBEDDING, { text: texts });
    if (!embResult?.data || embResult.data.length !== texts.length) {
      return jsonResponse(503, {
        success: false, data: null,
        error: { type: 'model_error', message: '嵌入模型回應異常' }
      });
    }
    vectors = embResult.data;
  } catch (err) {
    return jsonResponse(503, {
      success: false, data: null,
      error: { type: 'model_error', message: '系統錯誤,請稍後再試' }
    });
  }

  // Batch upsert into Vectorize
  const vectorizeEntries = body.entries.map((entry, i) => ({
    id: entry.id,
    values: vectors[i],
    metadata: {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      party: entry.party || null,
      snippet: (entry.content || '').slice(0, 200)
    }
  }));

  await env.KNOWLEDGE_INDEX.upsert(vectorizeEntries);

  // Batch upsert into D1
  const stmt = env.DB.prepare(`
    INSERT OR REPLACE INTO knowledge_entries (id, type, title, content, party, metadata, vectorize_synced, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const d1Batch = body.entries.map(entry =>
    stmt.bind(
      entry.id, entry.type, entry.title, entry.content,
      entry.party || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    )
  );

  await env.DB.batch(d1Batch);

  return jsonResponse(200, {
    success: true,
    data: {
      imported: body.entries.length,
      dimensions: vectors[0]?.length || 0,
      ids: body.entries.map(e => e.id)
    },
    error: null
  });
}

/**
 * GET /api/v1/knowledge/search?q=...&topK=5&type=politician
 * Dynamic Vectorize similarity search. For testing knowledge retrieval quality.
 */
export async function searchKnowledge(request, env, ctx, { url }) {
  const query = url.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: 'q parameter is required' }
    });
  }

  const topK = Math.min(20, Math.max(1, parseInt(url.searchParams.get('topK') || '5', 10)));
  const filterType = url.searchParams.get('type') || null;
  const minScore = parseFloat(url.searchParams.get('min_score') || String(CLOUDFLARE.VECTORIZE_MIN_SCORE));

  // Embed query text via Workers AI bge-m3
  let queryVector;
  try {
    const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [query] });
    if (!embResult?.data?.[0]) {
      return jsonResponse(503, {
        success: false, data: null,
        error: { type: 'model_error', message: '系統錯誤,請稍後再試' }
      });
    }
    queryVector = embResult.data[0];
  } catch {
    return jsonResponse(503, {
      success: false, data: null,
      error: { type: 'model_error', message: '系統錯誤,請稍後再試' }
    });
  }

  // Query Vectorize
  const queryOptions = {
    topK,
    returnMetadata: true
  };

  // Vectorize filter by metadata.type if specified
  if (filterType) {
    queryOptions.filter = { type: filterType };
  }

  const matches = await env.KNOWLEDGE_INDEX.query(queryVector, queryOptions);

  // Enrich with full content from D1
  const results = [];
  for (const match of (matches.matches || [])) {
    if (match.score < minScore) continue;

    const meta = match.metadata || {};
    // Try to get full content from D1
    let fullContent = null;
    try {
      const row = await env.DB.prepare(
        'SELECT content, party, metadata FROM knowledge_entries WHERE id = ?'
      ).bind(match.id).first();
      if (row) {
        fullContent = row.content;
      }
    } catch {
      // D1 lookup failure is non-fatal
    }

    results.push({
      id: match.id,
      score: Math.round(match.score * 10000) / 10000,
      type: meta.type,
      title: meta.title,
      party: meta.party || null,
      snippet: meta.snippet,
      content: fullContent
    });
  }

  return jsonResponse(200, {
    success: true,
    data: {
      query,
      results,
      total: results.length,
      topK,
      min_score: minScore,
      filter_type: filterType
    },
    error: null
  });
}

/**
 * GET /api/v1/knowledge/list?type=politician&page=1&limit=20
 * List all knowledge entries from D1 (for management UI).
 */
export async function listKnowledge(request, env, ctx, { url }) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;
  const filterType = url.searchParams.get('type') || null;
  const filterParty = url.searchParams.get('party') || null;

  let whereClause = '';
  const params = [];

  if (filterType) {
    whereClause = 'WHERE type = ?';
    params.push(filterType);
    if (filterParty) {
      whereClause += ' AND party = ?';
      params.push(filterParty);
    }
  } else if (filterParty) {
    whereClause = 'WHERE party = ?';
    params.push(filterParty);
  }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM knowledge_entries ${whereClause}`
  ).bind(...params).first();

  const rows = await env.DB.prepare(
    `SELECT id, type, title, party, updated_at FROM knowledge_entries ${whereClause} ORDER BY type, title LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  return jsonResponse(200, {
    success: true,
    data: {
      entries: (rows.results || []).map(row => ({
        ...row,
        title: escapeHtml(row.title)
      })),
      pagination: {
        page, limit,
        total: countResult?.total || 0,
        total_pages: Math.ceil((countResult?.total || 0) / limit)
      }
    },
    error: null
  });
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Embed a single knowledge entry and store in Vectorize + D1.
 */
async function embedAndStore(env, entry) {
  // Embed content via Workers AI bge-m3
  let vector;
  try {
    const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [entry.content] });
    if (!embResult?.data?.[0]) {
      return { success: false };
    }
    vector = embResult.data[0];
  } catch {
    return { success: false };
  }

  // Upsert into Vectorize
  await env.KNOWLEDGE_INDEX.upsert([{
    id: entry.id,
    values: vector,
    metadata: {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      party: entry.party || null,
      snippet: (entry.content || '').slice(0, 200)
    }
  }]);

  // Upsert into D1
  await env.DB.prepare(`
    INSERT OR REPLACE INTO knowledge_entries (id, type, title, content, party, metadata, vectorize_synced, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).bind(
    entry.id, entry.type, entry.title, entry.content,
    entry.party || null,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  ).run();

  return {
    success: true,
    data: {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      party: entry.party || null,
      embedded: true,
      dimensions: vector.length
    }
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
