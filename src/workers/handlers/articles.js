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
import { jsonResponse } from '../../../shared/response.js';

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
    bias_score, bias_category, controversy_score, controversy_level, status, analysis_count, camp_ratio
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
  // Strategy A+B: higher threshold (0.55) + metadata filter by matched_topic
  let knowledgeIds = [];
  try {
    const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [body.title] });
    if (embResult?.data?.[0]) {
      const queryOpts = {
        topK: CLOUDFLARE.VECTORIZE_TOP_K,
        returnMetadata: true
      };
      // Add metadata filter if article has a matched_topic
      if (body.matched_topic) {
        queryOpts.filter = { category: body.matched_topic };
      }
      const matches = await env.KNOWLEDGE_INDEX.query(embResult.data[0], queryOpts);
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
      // Strategy A+B: higher threshold (0.55) + metadata filter by matched_topic
      let knowledgeIds = [];
      try {
        const embResult = await env.AI.run(MODELS.EMBEDDING, { text: [article.title] });
        if (embResult?.data?.[0]) {
          const queryOpts = {
            topK: CLOUDFLARE.VECTORIZE_TOP_K,
            returnMetadata: true
          };
          if (article.matched_topic) {
            queryOpts.filter = { category: article.matched_topic };
          }
          const matches = await env.KNOWLEDGE_INDEX.query(embResult.data[0], queryOpts);
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
          feed_category, filter_score, matched_topic, r2_path, knowledge_ids, status, status_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        article.article_id, article.content_hash, article.title,
        article.summary || null, article.author || null, article.source,
        article.primary_url, JSON.stringify(article.duplicate_urls || []),
        article.published_at, article.crawled_at, article.char_count,
        article.feed_category || '綜合',
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
 * GET /api/v1/articles/:article_id/cluster — Similar articles from different sources
 *
 * Uses title bigram Jaccard similarity (CJK-friendly, zero neuron cost)
 * to find cross-media coverage of the same event.
 */
export async function getArticleCluster(request, env, ctx, { params }) {
  const { article_id } = params;

  const article = await env.DB.prepare(
    'SELECT content_hash, source, title, summary, published_at FROM articles WHERE article_id = ?'
  ).bind(article_id).first();

  if (!article) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  const pubDate = article.published_at || nowISO();

  // Fetch candidates within ±4 days from different sources.
  // datetime() normalizes ISO 8601 (+TZ) to 'YYYY-MM-DD HH:MM:SS' for correct comparison.
  const candidates = await env.DB.prepare(`
    SELECT article_id, source, title, summary, bias_score, bias_category, published_at
    FROM articles
    WHERE article_id != ?
      AND source != ?
      AND datetime(published_at) >= datetime(?, '-4 days')
      AND datetime(published_at) <= datetime(?, '+4 days')
    LIMIT 500
  `).bind(article_id, article.source, pubDate, pubDate).all();

  // Compute time-weighted title+summary bigram Jaccard similarity and filter
  const sourceBigrams = textBigrams(article.title + ' ' + (article.summary || ''));
  const sourceTime = new Date(pubDate).getTime();
  const similar = (candidates.results || [])
    .map(row => {
      const rawSim = jaccardSimilarity(sourceBigrams, textBigrams(row.title + ' ' + (row.summary || '')));
      const hoursApart = Math.abs(sourceTime - new Date(row.published_at).getTime()) / 3600000;
      return { ...row, _sim: rawSim * timeDecay(hoursApart) };
    })
    .filter(row => row._sim >= TITLE_SIMILARITY_THRESHOLD)
    .sort((a, b) => b._sim - a._sim)
    .slice(0, 10);

  // Strip internal similarity score before response
  const articles = similar.map(({ _sim, ...rest }) => sanitizeArticleRow(rest));

  return jsonResponse(200, {
    success: true,
    data: {
      source_article: { article_id, ...article },
      articles,
      total: articles.length
    },
    error: null
  });
}

// =============================================
// Text similarity helpers (CJK bigram Jaccard)
// =============================================

const TITLE_SIMILARITY_THRESHOLD = 0.10;

/**
 * Time decay multiplier for clustering.
 * Same day (≤24h): no decay. Linearly decays to 0.6 floor at 96h (4 days).
 */
function timeDecay(hoursApart) {
  if (hoursApart <= 24) return 1.0;
  if (hoursApart >= 96) return 0.6;
  return 1.0 - 0.4 * (hoursApart - 24) / 72;
}

/**
 * Extract character bigrams from text.
 * Strips whitespace and punctuation for cleaner comparison.
 */
function textBigrams(text) {
  if (!text) return new Set();
  const clean = text.replace(/[\s\p{P}\p{S}]/gu, '');
  const bigrams = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.add(clean.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Jaccard similarity between two sets.
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Sanitize article row for client response (XSS prevention).
 */
function sanitizeArticleRow(row) {
  const sanitized = {
    ...row,
    title: row.title ? escapeHtml(row.title) : row.title,
    summary: row.summary ? escapeHtml(row.summary) : row.summary,
    author: row.author ? escapeHtml(row.author) : row.author
  };

  // Parse JSON string columns from D1 into proper arrays (only if present in SELECT)
  if ('duplicate_urls' in row && typeof row.duplicate_urls === 'string') {
    try { sanitized.duplicate_urls = JSON.parse(row.duplicate_urls); } catch { sanitized.duplicate_urls = []; }
  }
  if ('knowledge_ids' in row && typeof row.knowledge_ids === 'string') {
    try { sanitized.knowledge_ids = JSON.parse(row.knowledge_ids); } catch { sanitized.knowledge_ids = []; }
  }
  if ('camp_ratio' in row && typeof row.camp_ratio === 'string') {
    try { sanitized.camp_ratio = JSON.parse(row.camp_ratio); } catch { sanitized.camp_ratio = null; }
  }

  return sanitized;
}

