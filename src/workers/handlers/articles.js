/**
 * Articles Handlers
 *
 * T02 (Crawler) writes via POST endpoints.
 * T04 (Frontend) reads via GET endpoints.
 *
 * Storage: D1 (structured index) + R2 (full text markdown)
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { validateArticle, validateArticleBatch } from '../../../shared/validators.js';
import { ARTICLE_STATUS } from '../../../shared/enums.js';
import { nowISO, formatDate, escapeHtml } from '../../../shared/utils.js';
import { CLOUDFLARE, MODELS } from '../../../shared/config.js';

/**
 * GET /api/v1/articles — Paginated article list
 */
export async function getArticles(request, env, ctx, { url }) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  // Whitelist sort fields (SQL injection prevention!)
  const ALLOWED_SORT = ['published_at', 'bias_score', 'controversy_score'];
  const sortBy = ALLOWED_SORT.includes(url.searchParams.get('sort_by'))
    ? url.searchParams.get('sort_by')
    : 'published_at';
  const sortOrder = url.searchParams.get('sort_order') === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE clauses
  const conditions = [];
  const params = [];

  const source = url.searchParams.get('source');
  if (source) { conditions.push('source = ?'); params.push(source); }

  const status = url.searchParams.get('status');
  if (status) { conditions.push('status = ?'); params.push(status); }

  const category = url.searchParams.get('category');
  if (category) { conditions.push('matched_topic = ?'); params.push(category); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countQuery = `SELECT COUNT(*) AS total FROM articles ${whereClause}`;
  const countResult = await env.DB.prepare(countQuery).bind(...params).first();
  const total = countResult?.total || 0;

  // Fetch page
  const dataQuery = `SELECT article_id, primary_url, source, title, summary, published_at,
    bias_score, bias_category, controversy_score, controversy_level, status
    FROM articles ${whereClause} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;

  const rows = await env.DB.prepare(dataQuery)
    .bind(...params, limit, offset)
    .all();

  return jsonResponse(200, {
    success: true,
    data: {
      articles: (rows.results || []).map(sanitizeArticleRow),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    },
    error: null
  });
}

/**
 * GET /api/v1/articles/:article_id — Single article detail
 */
export async function getArticle(request, env, ctx, { params }) {
  const { article_id } = params;

  const row = await env.DB.prepare(
    'SELECT * FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!row) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  // Fetch full text from R2
  let content_markdown = null;
  if (row.r2_path) {
    const r2Object = await env.ARTICLES.get(row.r2_path);
    if (r2Object) {
      const r2Data = await r2Object.json();
      content_markdown = r2Data.content_markdown;
    }
  }

  return jsonResponse(200, {
    success: true,
    data: { ...sanitizeArticleRow(row), content_markdown },
    error: null
  });
}

/**
 * POST /api/v1/articles — Single article ingestion (Service Token)
 */
export async function createArticle(request, env, ctx, { params }) {
  const body = await request.json();
  const validation = validateArticle(body);

  if (!validation.valid) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors }
    });
  }

  // Check for duplicate content_hash
  const existing = await env.DB.prepare(
    'SELECT article_id FROM articles WHERE content_hash = ?'
  ).bind(body.content_hash).first();

  if (existing) {
    return jsonResponse(409, {
      success: false, data: null,
      error: { type: 'validation_error', message: 'Duplicate content_hash' }
    });
  }

  // Store full text in R2
  const r2Path = `${CLOUDFLARE.R2_ARTICLE_PATH_PREFIX}/${formatDate(body.published_at)}/${body.article_id}.json`;
  await env.ARTICLES.put(r2Path, JSON.stringify({
    article_id: body.article_id,
    content_hash: body.content_hash,
    title: body.title,
    summary: body.summary || null,
    author: body.author || null,
    content_markdown: body.content_markdown,
    char_count: body.char_count,
    source: body.source,
    primary_url: body.primary_url,
    duplicate_urls: body.duplicate_urls || [],
    published_at: body.published_at,
    crawled_at: body.crawled_at,
    filter_score: body.filter_score,
    matched_topic: body.matched_topic,
    dedup_metadata: body.dedup_metadata || null,
    stored_at: nowISO()
  }));

  // Knowledge query: embed title via Workers AI bge-m3, then Vectorize topK
  // This populates knowledge_ids for the knowledge transparency panel
  let knowledgeIds = [];
  try {
    const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [body.title] });
    if (embResult?.data?.[0]) {
      const matches = await env.KNOWLEDGE_INDEX.query(embResult.data[0], {
        topK: CLOUDFLARE.VECTORIZE_TOP_K,
        returnMetadata: true
      });
      knowledgeIds = (matches.matches || [])
        .filter(m => m.score >= CLOUDFLARE.VECTORIZE_MIN_SCORE)
        .map(m => m.id);
    }
  } catch {
    // Knowledge query failure is non-fatal — article is still stored
  }

  // Store index in D1
  await env.DB.prepare(`
    INSERT INTO articles (article_id, content_hash, title, summary, author, source,
      primary_url, duplicate_urls, published_at, crawled_at, char_count,
      filter_score, matched_topic, r2_path, knowledge_ids, status, status_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.article_id, body.content_hash, body.title, body.summary || null,
    body.author || null, body.source, body.primary_url,
    JSON.stringify(body.duplicate_urls || []),
    body.published_at, body.crawled_at, body.char_count,
    body.filter_score, body.matched_topic, r2Path,
    JSON.stringify(knowledgeIds),
    body.status || ARTICLE_STATUS.FILTERED, nowISO()
  ).run();

  return jsonResponse(201, {
    success: true,
    data: {
      article_id: body.article_id,
      r2_path: r2Path,
      knowledge_ids: knowledgeIds
    },
    error: null
  });
}

/**
 * POST /api/v1/articles/batch — Batch article ingestion (Service Token, max 50)
 */
export async function createArticleBatch(request, env, ctx, { params }) {
  const body = await request.json();
  const validation = validateArticleBatch(body);

  if (!validation.valid && validation.errors.length > 0) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試', details: validation.errors }
    });
  }

  let accepted = 0;
  let rejected = 0;
  const errors = [];

  // Process article-level validation errors
  if (validation.articleErrors && validation.articleErrors.length > 0) {
    for (const ae of validation.articleErrors) {
      rejected++;
      errors.push({ article_id: ae.article_id || `index_${ae.index}`, reason: ae.errors.join('; ') });
    }
  }

  // Process valid articles
  for (const article of body.articles) {
    const singleValidation = validateArticle(article);
    if (!singleValidation.valid) continue; // Already counted in articleErrors

    try {
      // Check duplicate
      const existing = await env.DB.prepare(
        'SELECT article_id FROM articles WHERE content_hash = ?'
      ).bind(article.content_hash).first();

      if (existing) {
        rejected++;
        errors.push({ article_id: article.article_id, reason: 'Duplicate content_hash' });
        continue;
      }

      // R2 + D1 write (same logic as single create)
      const r2Path = `${CLOUDFLARE.R2_ARTICLE_PATH_PREFIX}/${formatDate(article.published_at)}/${article.article_id}.json`;

      await env.ARTICLES.put(r2Path, JSON.stringify({
        ...article,
        duplicate_urls: article.duplicate_urls || [],
        stored_at: nowISO()
      }));

      // Knowledge query (non-fatal, best-effort)
      let knowledgeIds = [];
      try {
        const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [article.title] });
        if (embResult?.data?.[0]) {
          const matches = await env.KNOWLEDGE_INDEX.query(embResult.data[0], {
            topK: CLOUDFLARE.VECTORIZE_TOP_K,
            returnMetadata: true
          });
          knowledgeIds = (matches.matches || [])
            .filter(m => m.score >= CLOUDFLARE.VECTORIZE_MIN_SCORE)
            .map(m => m.id);
        }
      } catch {
        // Knowledge query failure is non-fatal
      }

      await env.DB.prepare(`
        INSERT INTO articles (article_id, content_hash, title, summary, author, source,
          primary_url, duplicate_urls, published_at, crawled_at, char_count,
          filter_score, matched_topic, r2_path, knowledge_ids, status, status_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        article.article_id, article.content_hash, article.title,
        article.summary || null, article.author || null, article.source,
        article.primary_url, JSON.stringify(article.duplicate_urls || []),
        article.published_at, article.crawled_at, article.char_count,
        article.filter_score, article.matched_topic, r2Path,
        JSON.stringify(knowledgeIds),
        article.status || ARTICLE_STATUS.FILTERED, nowISO()
      ).run();

      accepted++;
    } catch (err) {
      rejected++;
      errors.push({ article_id: article.article_id, reason: 'Storage error' });
    }
  }

  return jsonResponse(200, {
    success: true,
    data: { accepted, rejected, errors },
    error: null
  });
}

/**
 * GET /api/v1/articles/:article_id/cluster — Similar articles
 */
export async function getArticleCluster(request, env, ctx, { params }) {
  const { article_id } = params;

  // Find the article's content_hash, then find others with similar content
  const article = await env.DB.prepare(
    'SELECT content_hash, source, title FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  // For now, return articles with same matched_topic published within 24h
  // Full similarity cluster will use MinHash from T02
  const cluster = await env.DB.prepare(`
    SELECT article_id, source, title, bias_score, bias_category, published_at
    FROM articles
    WHERE article_id != ? AND matched_topic = (
      SELECT matched_topic FROM articles WHERE article_id = ?
    )
    AND published_at >= datetime(?, '-1 day')
    ORDER BY published_at DESC
    LIMIT 10
  `).bind(article_id, article_id, article.published_at || nowISO()).all();

  return jsonResponse(200, {
    success: true,
    data: {
      source_article: { article_id, ...article },
      cluster: (cluster.results || []).map(sanitizeArticleRow),
      total: cluster.results?.length || 0
    },
    error: null
  });
}

/**
 * Sanitize article row for client response (XSS prevention).
 */
function sanitizeArticleRow(row) {
  return {
    ...row,
    title: row.title ? escapeHtml(row.title) : row.title,
    summary: row.summary ? escapeHtml(row.summary) : row.summary,
    author: row.author ? escapeHtml(row.author) : row.author
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
