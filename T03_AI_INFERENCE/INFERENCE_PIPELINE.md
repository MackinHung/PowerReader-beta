# Cloudflare Workers Inference Pipeline

## Navigation
- **Upstream**: CLAUDE.md (architecture overview), MASTER_ROADMAP.md (decisions), T01_SYSTEM_ARCHITECTURE/API_ROUTES.md (route SSOT), T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md (data SSOT)
- **Downstream**: T04_FRONTEND (client integration), T05_REWARD_SYSTEM (reward trigger), T06_COMPLIANCE/ERROR_HANDLING.md (error mapping)
- **Maintainer**: T03 (AI Inference Team)
- **Type**: Technical Specification
- **Last Updated**: 2026-03-08

---

## Purpose

Defines the **end-to-end inference pipeline** running on Cloudflare Workers, covering:
1. Article ingestion from Crawler
2. Article retrieval for client-side inference
3. Analysis submission with quality validation
4. Knowledge base management

All endpoints follow T01 API_ROUTES.md conventions (`/api/v1` prefix, unified response envelope, `shared/enums.js` error types).

---

## 1. Article Ingestion Pipeline (Crawler -> PowerReader)

### Endpoint

```
POST /api/v1/articles
Auth: X-API-Key header (Crawler service key)
Rate Limit: Per-source, persisted in D1 (crawler_rate_limits table)
```

### Flow

```
Crawler POST /api/v1/articles
  -> [1] Authenticate API key
  -> [2] Validate article against Crawler API schema (18 fields)
  -> [3] Deduplicate: check D1 for existing article_id
  -> [4] Embed title via Workers AI bge-m3 (1024d)
  -> [5] Query Vectorize for top-5 knowledge entries
  -> [6] Pre-compute Layer 2 prompt text
  -> [7] Store: R2 (content_markdown) + D1 (structured data + layer2_text)
  -> [8] Return: article_id, knowledge_entries_count
```

### Request Schema

All 18 fields from the Crawler API output format (CLAUDE.md):

```typescript
interface ArticleInput {
  article_id: string;           // sha256 of primary_url
  content_hash: string;         // sha256 of content_markdown
  title: string;                // article title
  summary: string;              // article summary
  author: string | null;        // reporter name (nullable)
  content_markdown: string;     // cleaned markdown full text
  char_count: number;           // character count of content_markdown
  source: string;               // NEWS_SOURCES enum value (e.g., "liberty_times")
  primary_url: string;          // canonical URL
  duplicate_urls: string[];     // syndication URLs
  published_at: string;         // ISO 8601 with timezone
  crawled_at: string;           // ISO 8601 with timezone
  filter_score: number;         // bge-small-zh relevance score (0-1)
  matched_topic: string;        // topic category matched by filter
  dedup_metadata: {
    total_found: number;
    unique_content: number;
    similarity_scores: number[];
  };
}
```

### Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `article_id` | SHA-256 hex string, 64 chars | `validation_error` |
| `content_hash` | SHA-256 hex string, 64 chars | `validation_error` |
| `title` | Non-empty, max 200 chars | `validation_error` |
| `summary` | Max 500 chars | `validation_error` |
| `content_markdown` | Non-empty, max 50,000 chars | `validation_error` |
| `char_count` | Positive integer, matches `content_markdown.length` | `validation_error` |
| `source` | Must exist in `NEWS_SOURCES` enum | `validation_error` |
| `primary_url` | Valid URL format | `validation_error` |
| `published_at` | ISO 8601 with timezone | `validation_error` |
| `crawled_at` | ISO 8601 with timezone | `validation_error` |
| `filter_score` | Number 0-1 | `validation_error` |

### Workers Handler

```typescript
import { Env } from './types';

export async function handleArticleIngestion(
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;

  // [1] Authenticate
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey !== env.CRAWLER_API_KEY) {
    return errorResponse(401, 'unauthorized', requestId);
  }

  // [2] Validate input
  const body: ArticleInput = await request.json();
  const validationError = validateArticleInput(body);
  if (validationError) {
    return errorResponse(400, 'validation_error', requestId, validationError);
  }

  // [3] Deduplicate
  const existing = await env.DB.prepare(
    'SELECT article_id FROM articles WHERE article_id = ?'
  ).bind(body.article_id).first();

  if (existing) {
    return errorResponse(409, 'failed_duplicate', requestId, 'Article already exists');
  }

  // [4] Embed title via Workers AI bge-m3
  const embeddingResult = await env.AI.run('@cf/baai/bge-m3', {
    text: [body.title]
  });
  const titleVector = embeddingResult.data[0];

  // [5] Query Vectorize for top-5 knowledge entries
  const vectorResults = await env.VECTORIZE.query(titleVector, {
    topK: 5,
    returnValues: false,
    returnMetadata: 'all'
  });

  // [6] Pre-compute Layer 2 prompt text
  const { layer2Text, entries } = formatLayer2(vectorResults);

  // [7a] Store content_markdown in R2
  await env.R2.put(`articles/${body.article_id}.md`, body.content_markdown, {
    customMetadata: {
      content_hash: body.content_hash,
      source: body.source,
      created_at: new Date().toISOString()
    }
  });

  // [7b] Store structured data + layer2_text in D1
  await env.DB.prepare(`
    INSERT INTO articles (
      article_id, content_hash, title, summary, author,
      char_count, source, primary_url, duplicate_urls,
      published_at, crawled_at, filter_score, matched_topic,
      dedup_total_found, dedup_unique_content, dedup_similarity_scores,
      layer2_text, layer2_entries, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ingested', ?)
  `).bind(
    body.article_id, body.content_hash, body.title, body.summary,
    body.author, body.char_count, body.source, body.primary_url,
    JSON.stringify(body.duplicate_urls), body.published_at, body.crawled_at,
    body.filter_score, body.matched_topic,
    body.dedup_metadata.total_found, body.dedup_metadata.unique_content,
    JSON.stringify(body.dedup_metadata.similarity_scores),
    layer2Text, JSON.stringify(entries), new Date().toISOString()
  ).run();

  // [8] Return result
  return successResponse({
    article_id: body.article_id,
    knowledge_entries_count: entries.length
  }, requestId);
}
```

### Response

```json
{
  "success": true,
  "data": {
    "article_id": "a1b2c3d4e5f6...",
    "knowledge_entries_count": 5
  },
  "error": null
}
```

### Rate Limiting (Crawler)

Per-source daily limits persisted in D1 `crawler_rate_limits` table (not in-memory, not KV):

```typescript
async function checkCrawlerRateLimit(
  source: string,
  env: Env
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const nowISO = new Date().toISOString();

  const MAX_PER_SOURCE_PER_DAY = 200;
  const MIN_INTERVAL_MS = 2000;

  // Query current rate limit state from D1
  const current = await env.DB.prepare(
    'SELECT request_count, last_request_at FROM crawler_rate_limits WHERE source = ? AND date_key = ?'
  ).bind(source, today).first<{ request_count: number; last_request_at: string }>();

  if (current) {
    if (current.request_count >= MAX_PER_SOURCE_PER_DAY) {
      return { allowed: false, retryAfter: 86400 };
    }
    const elapsed = Date.now() - new Date(current.last_request_at).getTime();
    if (elapsed < MIN_INTERVAL_MS) {
      return { allowed: false, retryAfter: Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000) };
    }
  }

  // Upsert rate limit counter (INSERT...ON CONFLICT DO UPDATE, immutable pattern)
  await env.DB.prepare(`
    INSERT INTO crawler_rate_limits (source, date_key, request_count, last_request_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(source, date_key) DO UPDATE SET
      request_count = request_count + 1,
      last_request_at = ?
  `).bind(source, today, nowISO, nowISO).run();

  return { allowed: true };
}
```

---

## 2. Article Retrieval Pipeline (Client -> PowerReader)

### Endpoint

```
GET /api/v1/articles/:article_id
Auth: None (public)
Rate Limit: 60/min per IP
```

### Flow

```
Client GET /api/v1/articles/:article_id
  -> [1] Fetch structured data from D1
  -> [2] Fetch content_markdown from R2
  -> [3] Return: metadata + pre-computed Layer 2 + content
  -> Client assembles 3-layer prompt locally
  -> Client runs Qwen3-4B via WebLLM (WebGPU browser-based)
```

### Workers Handler

```typescript
export async function handleArticleRetrieval(
  articleId: string,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;

  // [1] Fetch from D1
  const article = await env.DB.prepare(`
    SELECT article_id, content_hash, title, summary, author,
           source, primary_url, published_at, char_count,
           layer2_text, layer2_entries, status,
           analysis_count, created_at
    FROM articles WHERE article_id = ?
  `).bind(articleId).first<ArticleRow>();

  if (!article) {
    return errorResponse(404, 'not_found', requestId);
  }

  // [2] Fetch content from R2
  const r2Object = await env.R2.get(`articles/${articleId}.md`);
  const contentMarkdown = r2Object ? await r2Object.text() : null;

  if (!contentMarkdown) {
    // Degraded response: article summary only
    return successResponse({
      ...formatArticleResponse(article),
      content_markdown: null,
      degraded: true,
      degraded_reason: '全文暫時無法載入'
    }, requestId);
  }

  // [3] Return full response
  return successResponse({
    ...formatArticleResponse(article),
    content_markdown: contentMarkdown,
    layer2_text: article.layer2_text,
    layer2_entries: JSON.parse(article.layer2_entries || '[]'),
    inference_config: {
      prompt_version: 'v2.0.0',
      model: 'Qwen3-4B-q4f16_1-MLC',
      think: false,
      temperature: 0.5,
      top_p: 0.95,
      presence_penalty: 1.5,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    }
  }, requestId);
}

function formatArticleResponse(article: ArticleRow): ArticleResponse {
  return {
    article_id: article.article_id,
    content_hash: article.content_hash,
    title: article.title,
    summary: article.summary,
    author: article.author,
    source: article.source,
    primary_url: article.primary_url,
    published_at: article.published_at,
    char_count: article.char_count,
    analysis_count: article.analysis_count ?? 0,
    status: article.status,
    created_at: article.created_at
  };
}
```

### Response

```json
{
  "success": true,
  "data": {
    "article_id": "a1b2c3d4...",
    "title": "New article title",
    "summary": "Article summary...",
    "author": "Reporter Name",
    "source": "liberty_times",
    "primary_url": "https://...",
    "published_at": "2026-03-07T14:00:00+08:00",
    "char_count": 1847,
    "content_markdown": "Full article markdown...",
    "layer2_text": "[Background Knowledge]\n- [Person] ...\n- [Topic] ...",
    "layer2_entries": [
      { "id": "pol_lai_ching_te", "type": "politician", "name": "Lai Ching-te", "score": 0.82 }
    ],
    "inference_config": {
      "prompt_version": "v2.0.0",
      "model": "Qwen3-4B-q4f16_1-MLC",
      "think": false,
      "temperature": 0.5,
      "top_p": 0.95,
      "presence_penalty": 1.5,
      "max_tokens": 4096,
      "response_format": { "type": "json_object" }
    },
    "analysis_count": 3,
    "status": "ingested",
    "created_at": "2026-03-07T14:35:00+08:00"
  },
  "error": null
}
```

### Client-Side Prompt Assembly

The client receives all 3 layers and assembles the prompt locally:

```
Layer 1 (System Prompt):
  - Cached locally in IndexedDB
  - Updated when prompt_version changes
  - Source: PROMPT_VERSIONS.md v2.0.0

Layer 2 (RAG Knowledge):
  - From API response: data.layer2_text
  - User can expand to view entries + similarity scores

Layer 3 (Article Input):
  - From API response: title, summary, content_markdown, source, author, published_at
  - Formatted as JSON per PROMPT_VERSIONS.md Input Format
```

---

## 3. Analysis Submission Pipeline (Client -> PowerReader)

### Endpoint

```
POST /api/v1/articles/:article_id/analysis
Auth: User JWT or anonymous user_hash
Rate Limit: Per-user, persisted in D1 (api_rate_limits table)
```

### Flow

```
Client POST /api/v1/articles/:article_id/analysis
  -> [1] Validate request body (6 analysis fields + metadata)
  -> [2] T05 Pre-Check: daily limit + min analysis time
  -> [3] T03 Quality Gates Layer 1: Format validation
  -> [4] T03 Quality Gates Layer 2: Range validation
  -> [5] T03 Quality Gates Layer 3: Consistency validation (D1 history)
  -> [6] T03 Quality Gates Layer 4: Duplicate validation (D1 lookup)
  -> [7] Store in D1: analysis result + quality_gate_result + quality_scores
  -> [8] If passed: trigger T05 reward (0.1 points)
  -> [9] Return: quality_gate_result, points_earned
```

### Request Schema

```typescript
interface AnalysisSubmission {
  user_hash: string;              // SHA-256 anonymous user identifier
  prompt_version: string;         // Must match current version (v2.0.0)
  analysis_time_ms: number;       // Time taken for local inference (anti-cheat)
  analysis: {
    bias_score: number;           // 0-100 integer
    bias_category: string;        // 7 values from BIAS_CATEGORIES enum
    controversy_score: number;    // 0-100 integer
    controversy_level: string;    // 4 values from CONTROVERSY_LEVELS enum
    reasoning: string;            // 10-200 chars, references article text
    key_phrases: string[];        // 1-10 items from article text
  };
}
```

### Workers Handler

```typescript
export async function handleAnalysisSubmission(
  articleId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;

  const body: AnalysisSubmission = await request.json();

  // [1] Basic validation
  const validationError = validateAnalysisInput(body);
  if (validationError) {
    return errorResponse(400, 'validation_error', requestId, validationError);
  }

  // Fetch article data from D1
  const article = await env.DB.prepare(
    'SELECT * FROM articles WHERE article_id = ?'
  ).bind(articleId).first<ArticleRow>();

  if (!article) {
    return errorResponse(404, 'not_found', requestId);
  }

  // [2] T05 Pre-Check
  const preCheckResult = await preCheckAnalysis(body, env);
  if (!preCheckResult.passed) {
    return errorResponse(preCheckResult.httpStatus, preCheckResult.errorType, requestId, preCheckResult.reason);
  }

  // [3-6] T03 Quality Gates (4 layers, short-circuit on failure)
  const qualityResult = await runQualityGates(
    JSON.stringify(body.analysis),
    body.user_hash,
    articleId,
    article,
    env
  );

  // [7] Store analysis in D1 (both pass and fail, for audit)
  const analysisId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO analyses (
      analysis_id, article_id, user_hash,
      bias_score, bias_category,
      controversy_score, controversy_level,
      reasoning, key_phrases,
      quality_gate_result, quality_scores,
      prompt_version, analysis_time_ms,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    analysisId, articleId, body.user_hash,
    body.analysis.bias_score, body.analysis.bias_category,
    body.analysis.controversy_score, body.analysis.controversy_level,
    body.analysis.reasoning, JSON.stringify(body.analysis.key_phrases),
    qualityResult.result, JSON.stringify(qualityResult.quality_scores),
    body.prompt_version, body.analysis_time_ms,
    new Date().toISOString()
  ).run();

  // Update article analysis_count and analyzed_by_users
  if (qualityResult.result === 'passed') {
    await env.DB.prepare(`
      UPDATE articles
      SET analysis_count = COALESCE(analysis_count, 0) + 1,
          analyzed_by_users = json_insert(
            COALESCE(analyzed_by_users, '[]'),
            '$[#]', ?
          ),
          updated_at = ?
      WHERE article_id = ?
    `).bind(body.user_hash, new Date().toISOString(), articleId).run();
  }

  // [8] Trigger reward if passed
  let pointsEarned = 0;
  if (qualityResult.result === 'passed') {
    const rewardResult = await processReward(body.user_hash, env);
    pointsEarned = rewardResult.points_earned;
  }

  // [9] Return result
  const responseData: AnalysisResult = {
    analysis_id: analysisId,
    quality_gate_result: qualityResult.result,
    quality_scores: qualityResult.quality_scores,
    points_earned: pointsEarned,
    reason: qualityResult.reason ?? null
  };

  const httpStatus = qualityResult.result === 'passed' ? 201 : 422;
  return new Response(JSON.stringify({
    success: qualityResult.result === 'passed',
    data: responseData,
    error: qualityResult.result !== 'passed' ? {
      type: qualityResult.result,
      message: getQualityGateUserMessage(qualityResult.result),
      request_id: requestId
    } : null
  }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### T05 Pre-Check

Anti-abuse checks before entering quality gates:

```typescript
interface PreCheckConfig {
  MAX_ANALYSES_PER_USER_PER_DAY: number;  // 50
  MIN_ANALYSIS_TIME_MS: number;            // 3000 (3 seconds)
}

async function preCheckAnalysis(
  body: AnalysisSubmission,
  env: Env
): Promise<{ passed: boolean; httpStatus?: number; errorType?: string; reason?: string }> {
  // Check 1: Daily limit per user (D1 query on analyses table)
  const today = new Date().toISOString().slice(0, 10);
  const dailyResult = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM analyses WHERE user_hash = ? AND created_at >= ?'
  ).bind(body.user_hash, today + 'T00:00:00').first<{ cnt: number }>();
  const dailyCount = dailyResult?.cnt ?? 0;

  if (dailyCount >= 50) {
    return {
      passed: false,
      httpStatus: 429,
      errorType: 'rate_limit_exceeded',
      reason: `Daily analysis limit reached (${dailyCount}/50)`
    };
  }

  // Check 2: Minimum analysis time (anti-bot)
  if (body.analysis_time_ms < 3000) {
    return {
      passed: false,
      httpStatus: 422,
      errorType: 'validation_error',
      reason: `Analysis completed too quickly (${body.analysis_time_ms}ms < 3000ms minimum)`
    };
  }

  // No counter increment needed -- analyses are counted from D1 directly
  return { passed: true };
}
```

### Quality Gate User Messages

Maps quality gate failures to user-facing messages (per T06 ERROR_HANDLING.md):

```typescript
function getQualityGateUserMessage(result: string): string {
  const messages: Record<string, string> = {
    'failed_format':      '分析結果格式異常，請重新分析',
    'failed_range':       '分析結果包含無效數值，請重新分析',
    'failed_consistency': '您的分析與過往紀錄差異較大，請重新審視後再提交',
    'failed_duplicate':   '此文章已完成分析，或已達分析次數上限'
  };
  return messages[result] ?? '系統錯誤，請稍後再試';
}
```

### Response (Passed)

```json
{
  "success": true,
  "data": {
    "analysis_id": "uuid-here",
    "quality_gate_result": "passed",
    "quality_scores": {
      "format_valid": true,
      "range_valid": true,
      "consistency_valid": true,
      "duplicate_valid": true
    },
    "points_earned": 0.1,
    "reason": null
  },
  "error": null
}
```

### Response (Failed)

```json
{
  "success": false,
  "data": {
    "analysis_id": "uuid-here",
    "quality_gate_result": "failed_consistency",
    "quality_scores": {
      "format_valid": true,
      "range_valid": true,
      "consistency_valid": false,
      "duplicate_valid": false
    },
    "points_earned": 0,
    "reason": null
  },
  "error": {
    "type": "failed_consistency",
    "message": "您的分析與過往紀錄差異較大，請重新審視後再提交",
    "request_id": "req_abc123def456"
  }
}
```

---

## 4. Knowledge Management (Admin)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/knowledge` | Admin API Key | Add a knowledge entry |
| `GET` | `/api/v1/knowledge` | None | List all entries |
| `GET` | `/api/v1/knowledge/:id` | None | Get single entry |
| `PUT` | `/api/v1/knowledge/:id` | Admin API Key | Update entry |
| `DELETE` | `/api/v1/knowledge/:id` | Admin API Key | Remove entry |

### POST /api/v1/knowledge -- Add Entry

```typescript
export async function handleAddKnowledge(
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const body: KnowledgeEntry = await request.json();

  // Validate entry
  const validationError = validateKnowledgeEntry(body);
  if (validationError) {
    return errorResponse(400, 'validation_error', requestId, validationError);
  }

  // Check for duplicate ID
  const existing = await env.DB.prepare(
    'SELECT id FROM knowledge_entries WHERE id = ?'
  ).bind(body.id).first();
  if (existing) {
    return errorResponse(409, 'failed_duplicate', requestId, `Entry ${body.id} already exists`);
  }

  // Embed text via Workers AI bge-m3
  const embeddingResult = await env.AI.run('@cf/baai/bge-m3', {
    text: [body.text]
  });
  const vector = embeddingResult.data[0];

  // Insert into Vectorize
  await env.VECTORIZE.insert([{
    id: body.id,
    values: vector,
    metadata: {
      type: body.type,
      text: body.text,
      name: body.metadata.name,
      ...flattenMetadata(body.metadata),
      updated_at: new Date().toISOString().slice(0, 10)
    }
  }]);

  // Store in D1 for admin queries
  await env.DB.prepare(`
    INSERT INTO knowledge_entries (id, type, text, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    body.id, body.type, body.text,
    JSON.stringify(body.metadata),
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return successResponse({ id: body.id, embedded: true }, requestId, 201);
}
```

### PUT /api/v1/knowledge/:id -- Update Entry (with re-embedding)

```typescript
export async function handleUpdateKnowledge(
  id: string,
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const body: Partial<KnowledgeEntry> = await request.json();

  // Fetch existing
  const existing = await env.DB.prepare(
    'SELECT * FROM knowledge_entries WHERE id = ?'
  ).bind(id).first<KnowledgeEntryRow>();

  if (!existing) {
    return errorResponse(404, 'not_found', requestId);
  }

  const updatedText = body.text ?? existing.text;
  const updatedMetadata = body.metadata
    ? { ...JSON.parse(existing.metadata), ...body.metadata }
    : JSON.parse(existing.metadata);

  // Re-embed if text changed
  let reEmbedded = false;
  if (body.text && body.text !== existing.text) {
    const embeddingResult = await env.AI.run('@cf/baai/bge-m3', {
      text: [body.text]
    });
    const vector = embeddingResult.data[0];

    // Vectorize upsert (delete + insert)
    await env.VECTORIZE.deleteByIds([id]);
    await env.VECTORIZE.insert([{
      id,
      values: vector,
      metadata: {
        type: body.type ?? existing.type,
        text: updatedText,
        name: updatedMetadata.name,
        ...flattenMetadata(updatedMetadata),
        updated_at: new Date().toISOString().slice(0, 10)
      }
    }]);
    reEmbedded = true;
  }

  // Update D1
  await env.DB.prepare(`
    UPDATE knowledge_entries
    SET text = ?, type = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    updatedText,
    body.type ?? existing.type,
    JSON.stringify(updatedMetadata),
    new Date().toISOString(),
    id
  ).run();

  return successResponse({ id, re_embedded: reEmbedded }, requestId);
}
```

### DELETE /api/v1/knowledge/:id -- Remove Entry

```typescript
export async function handleDeleteKnowledge(
  id: string,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;

  const existing = await env.DB.prepare(
    'SELECT id FROM knowledge_entries WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse(404, 'not_found', requestId);
  }

  // Remove from Vectorize
  await env.VECTORIZE.deleteByIds([id]);

  // Remove from D1
  await env.DB.prepare('DELETE FROM knowledge_entries WHERE id = ?')
    .bind(id).run();

  return successResponse({ id, deleted: true }, requestId);
}
```

### GET /api/v1/knowledge -- List All

```typescript
export async function handleListKnowledge(
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  const url = new URL(request.url);
  const typeFilter = url.searchParams.get('type');

  let query = 'SELECT id, type, text, metadata, updated_at FROM knowledge_entries';
  const params: string[] = [];

  if (typeFilter) {
    const VALID_TYPES = ['politician', 'media', 'topic', 'term', 'event'];
    if (!VALID_TYPES.includes(typeFilter)) {
      return errorResponse(400, 'validation_error', requestId, `Invalid type filter: ${typeFilter}`);
    }
    query += ' WHERE type = ?';
    params.push(typeFilter);
  }

  query += ' ORDER BY type, id';

  const stmt = params.length > 0
    ? env.DB.prepare(query).bind(...params)
    : env.DB.prepare(query);

  const results = await stmt.all<KnowledgeEntryRow>();

  return successResponse({
    entries: results.results.map(row => ({
      id: row.id,
      type: row.type,
      text: row.text,
      metadata: JSON.parse(row.metadata),
      updated_at: row.updated_at
    })),
    total: results.results.length
  }, requestId);
}
```

---

## 5. TypeScript Interfaces

### Environment Bindings

```typescript
interface Env {
  // Cloudflare bindings
  DB: D1Database;                    // D1 SQL database (primary storage for all structured data)
  R2: R2Bucket;                      // R2 object storage
  VECTORIZE: VectorizeIndex;         // Vectorize vector search
  AI: Ai;                           // Workers AI

  // Secrets
  CRAWLER_API_KEY: string;           // Crawler service API key
  ADMIN_API_KEY: string;             // Admin API key
  JWT_SECRET: string;                // JWT signing key
}
```

### Article Types

```typescript
interface ArticleInput {
  article_id: string;
  content_hash: string;
  title: string;
  summary: string;
  author: string | null;
  content_markdown: string;
  char_count: number;
  source: string;
  primary_url: string;
  duplicate_urls: string[];
  published_at: string;
  crawled_at: string;
  filter_score: number;
  matched_topic: string;
  dedup_metadata: {
    total_found: number;
    unique_content: number;
    similarity_scores: number[];
  };
}

interface ArticleResponse {
  article_id: string;
  content_hash: string;
  title: string;
  summary: string;
  author: string | null;
  source: string;
  primary_url: string;
  published_at: string;
  char_count: number;
  analysis_count: number;
  status: string;
  created_at: string;
}

interface ArticleRetrievalResponse extends ArticleResponse {
  content_markdown: string | null;
  layer2_text: string;
  layer2_entries: KnowledgeMatch[];
  inference_config: InferenceConfig;
  degraded?: boolean;
  degraded_reason?: string;
}

interface ArticleRow {
  article_id: string;
  content_hash: string;
  title: string;
  summary: string;
  author: string | null;
  char_count: number;
  source: string;
  primary_url: string;
  duplicate_urls: string;          // JSON string
  published_at: string;
  crawled_at: string;
  filter_score: number;
  matched_topic: string;
  dedup_total_found: number;
  dedup_unique_content: number;
  dedup_similarity_scores: string; // JSON string
  layer2_text: string;
  layer2_entries: string;          // JSON string
  status: string;
  analysis_count: number | null;
  analyzed_by_users: string | null; // JSON string
  created_at: string;
  updated_at: string | null;
}
```

### Analysis Types

```typescript
interface AnalysisSubmission {
  user_hash: string;
  prompt_version: string;
  analysis_time_ms: number;
  analysis: AnalysisPayload;
}

interface AnalysisPayload {
  bias_score: number;
  bias_category: string;
  controversy_score: number;
  controversy_level: string;
  reasoning: string;
  key_phrases: string[];
}

interface AnalysisResult {
  analysis_id: string;
  quality_gate_result: string;
  quality_scores: QualityScores;
  points_earned: number;
  reason: string | null;
}

interface QualityScores {
  format_valid: boolean;
  range_valid: boolean;
  consistency_valid: boolean;
  duplicate_valid: boolean;
}
```

### Knowledge Types

```typescript
interface KnowledgeEntry {
  id: string;                        // e.g., "pol_lai_ching_te"
  type: 'politician' | 'media' | 'topic' | 'term' | 'event';
  text: string;                      // Natural language for embedding + L2 injection
  metadata: PoliticianMeta | MediaMeta | TopicMeta | TermMeta | EventMeta;
}

interface PoliticianMeta {
  name: string;
  party: 'DPP' | 'KMT' | 'TPP' | 'IND';
  position: string;
  stance_tags: string[];
  bias_hint: 'green' | 'blue' | 'neutral' | 'mixed';
  active: boolean;
}

interface MediaMeta {
  name: string;
  tendency: string;
  tendency_score: number;
  description: string;
  tier: 'major' | 'minor' | 'niche';
}

interface TopicMeta {
  name: string;
  green_stance: string;
  blue_stance: string;
  controversy_level: 'low' | 'moderate' | 'high' | 'very_high';
  category: string;
}

interface TermMeta {
  name: string;
  full_name?: string;
  political_context: string;
  category: string;
}

interface EventMeta {
  name: string;
  date_range: string;
  parties_involved: string[];
  controversy_level: 'low' | 'moderate' | 'high' | 'very_high';
  category: string;
  expires_at?: string;
}

interface KnowledgeMatch {
  id: string;
  type: string;
  name: string;
  score: number;                     // cosine similarity
}

interface KnowledgeEntryRow {
  id: string;
  type: string;
  text: string;
  metadata: string;                  // JSON string
  created_at: string;
  updated_at: string;
}
```

### Inference Config

```typescript
interface InferenceConfig {
  prompt_version: string;
  model: string;
  think: boolean;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  max_tokens: number;
  response_format: { type: string };
}
```

---

## 6. Error Handling

All error handling follows T06_COMPLIANCE/ERROR_HANDLING.md (SSOT).

### Error Response Helper

```typescript
function errorResponse(
  httpStatus: number,
  errorType: string,
  requestId: string,
  internalReason?: string
): Response {
  // Log internal details (never expose to client)
  if (internalReason) {
    console.error(`[${requestId}] ${errorType}: ${internalReason}`);
  }

  const userMessage = getUserErrorMessage(errorType);

  return new Response(JSON.stringify({
    success: false,
    data: null,
    error: {
      type: errorType,
      message: userMessage,
      request_id: requestId
    }
  }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' }
  });
}

function getUserErrorMessage(errorType: string): string {
  const messages: Record<string, string> = {
    'validation_error':     '輸入資料格式錯誤，請檢查後重試',
    'not_found':            '找不到請求的資源',
    'rate_limit_exceeded':  '請求過於頻繁，請稍後再試',
    'unauthorized':         '未授權，請先登入',
    'failed_format':        '分析結果格式異常，請重新分析',
    'failed_range':         '分析結果包含無效數值，請重新分析',
    'failed_consistency':   '您的分析與過往紀錄差異較大，請重新審視後再提交',
    'failed_duplicate':     '此文章已完成分析，或已達分析次數上限',
    'internal_error':       '系統錯誤，請稍後再試'
  };
  return messages[errorType] ?? '系統錯誤，請稍後再試';
}

function successResponse(
  data: unknown,
  requestId: string,
  httpStatus: number = 200
): Response {
  return new Response(JSON.stringify({
    success: true,
    data,
    error: null
  }), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    }
  });
}
```

### Cloudflare-Specific Error Recovery

| Error Scenario | Internal Log Code | Recovery | User Message |
|---------------|-------------------|----------|--------------|
| Workers AI quota exhausted | `workers_ai_quota_exceeded` | Skip embedding, store article without Layer 2 | N/A (internal) |
| Workers AI inference failed | `workers_ai_inference_failed` | Retry 2x with exponential backoff | N/A (internal) |
| Vectorize dimension mismatch | `vectorize_dimension_mismatch` | CRITICAL alert, do not proceed | `系統錯誤，請稍後再試` |
| Vectorize quota exceeded | `vectorize_quota_exceeded` | Degrade: no knowledge injection | N/A (internal) |
| R2 write failed | `r2_write_failed` | Retry 2x (500ms interval), return error if still failing | N/A (internal) |
| R2 read failed | `r2_read_failed` | Return degraded response (summary only) | `全文暫時無法載入` |
| D1 write failed | `d1_write_failed` | Retry 1x, then return error | `系統錯誤，請稍後再試` |

### Graceful Degradation

When Workers AI or Vectorize is unavailable during article ingestion:

```typescript
async function embedAndQueryWithFallback(
  title: string,
  env: Env
): Promise<{ layer2Text: string; entries: KnowledgeMatch[] }> {
  try {
    const embeddingResult = await env.AI.run('@cf/baai/bge-m3', {
      text: [title]
    });

    const vectorResults = await env.VECTORIZE.query(embeddingResult.data[0], {
      topK: 5,
      returnValues: false,
      returnMetadata: 'all'
    });

    return formatLayer2(vectorResults);
  } catch (err) {
    console.error('[embedAndQuery] Degraded mode:', err);
    // Return empty Layer 2 -- article still gets stored, just without knowledge context
    return {
      layer2Text: '',
      entries: []
    };
  }
}
```

---

## 7. Rate Limiting

All rate limits are persisted in Cloudflare D1 (never in-memory). This avoids KV's 1000 writes/day free tier limit, which would be easily exhausted by rate limit operations.

### Rate Limit Configuration

| Scope | Limit | D1 Table | Cleanup |
|-------|-------|----------|---------|
| Crawler per source per day | 200 requests | `crawler_rate_limits` | Daily purge (rows older than 7 days) |
| Crawler per source min interval | 2000ms | `crawler_rate_limits` (check `last_request_at`) | Same table |
| Analysis per user per day | 50 submissions | `analyses` (COUNT query, no separate table needed) | N/A (analyses are permanent records) |
| Public API per IP per minute | 60 requests | `api_rate_limits` | Periodic purge (rows older than 1 hour) |
| Knowledge admin per minute | 10 requests | `api_rate_limits` (scope = 'admin') | Same table |

### Rate Limit Middleware

```typescript
async function rateLimitMiddleware(
  request: Request,
  env: Env,
  scope: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
  const nowISO = new Date().toISOString();

  // Query current count from D1
  const current = await env.DB.prepare(
    'SELECT request_count FROM api_rate_limits WHERE scope = ? AND identifier = ? AND window_key = ?'
  ).bind(scope, identifier, windowKey).first<{ request_count: number }>();

  const currentCount = current?.request_count ?? 0;

  if (currentCount >= maxRequests) {
    const retryAfter = windowSeconds - Math.floor(
      (Date.now() % (windowSeconds * 1000)) / 1000
    );
    return { allowed: false, remaining: 0, retryAfter };
  }

  // Upsert rate limit counter (INSERT...ON CONFLICT DO UPDATE, immutable pattern)
  await env.DB.prepare(`
    INSERT INTO api_rate_limits (scope, identifier, window_key, request_count, created_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(scope, identifier, window_key) DO UPDATE SET
      request_count = request_count + 1
  `).bind(scope, identifier, windowKey, nowISO).run();

  return { allowed: true, remaining: maxRequests - currentCount - 1 };
}
```

### D1 Rate Limit Cleanup

Stale rate limit rows are periodically purged to prevent unbounded table growth. This runs as a Cloudflare Cron Trigger (e.g., every hour):

```typescript
async function cleanupRateLimits(env: Env): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  await env.DB.prepare(
    'DELETE FROM api_rate_limits WHERE created_at < ?'
  ).bind(oneHourAgo).run();

  await env.DB.prepare(
    'DELETE FROM crawler_rate_limits WHERE date_key < ?'
  ).bind(sevenDaysAgo.slice(0, 10)).run();
}
```

---

## 8. Layer 2 Formatting Helper

Shared utility for formatting Vectorize results into Layer 2 prompt text:

```typescript
function formatLayer2(
  vectorResults: VectorizeQueryResult
): { layer2Text: string; entries: KnowledgeMatch[] } {
  if (!vectorResults.matches || vectorResults.matches.length === 0) {
    return { layer2Text: '', entries: [] };
  }

  const typeLabels: Record<string, string> = {
    politician: '人物',
    media:      '媒體',
    topic:      '議題',
    term:       '名詞',
    event:      '事件'
  };

  const lines = vectorResults.matches.map(match => {
    const m = match.metadata;
    const tag = typeLabels[m.type as string] ?? '其他';
    return `- [${tag}] ${m.text}`;
  });

  const entries: KnowledgeMatch[] = vectorResults.matches.map(match => ({
    id: match.id,
    type: match.metadata.type as string,
    name: match.metadata.name as string,
    score: match.score
  }));

  return {
    layer2Text: '[背景知識]\n' + lines.join('\n'),
    entries
  };
}
```

---

## 9. D1 Schema (SQL)

Required tables for this pipeline:

```sql
-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  article_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  char_count INTEGER NOT NULL,
  source TEXT NOT NULL,
  primary_url TEXT NOT NULL,
  duplicate_urls TEXT DEFAULT '[]',
  published_at TEXT NOT NULL,
  crawled_at TEXT NOT NULL,
  filter_score REAL,
  matched_topic TEXT,
  dedup_total_found INTEGER DEFAULT 0,
  dedup_unique_content INTEGER DEFAULT 0,
  dedup_similarity_scores TEXT DEFAULT '[]',
  layer2_text TEXT DEFAULT '',
  layer2_entries TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ingested',
  analysis_count INTEGER DEFAULT 0,
  analyzed_by_users TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published ON articles(published_at);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
  analysis_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  bias_score INTEGER NOT NULL,
  bias_category TEXT NOT NULL,
  controversy_score INTEGER NOT NULL,
  controversy_level TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  key_phrases TEXT NOT NULL,
  quality_gate_result TEXT NOT NULL,
  quality_scores TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  analysis_time_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);

CREATE INDEX idx_analyses_article ON analyses(article_id);
CREATE INDEX idx_analyses_user ON analyses(user_hash);
CREATE INDEX idx_analyses_quality ON analyses(quality_gate_result);

-- Knowledge entries (mirror of Vectorize for admin CRUD)
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_knowledge_type ON knowledge_entries(type);

-- User points (integer cents, not float -- per KV_SCHEMA.md v2.0)
CREATE TABLE IF NOT EXISTS users (
  user_hash TEXT PRIMARY KEY,
  total_points_cents INTEGER DEFAULT 0,  -- 1230 = 12.30 display points
  contribution_count INTEGER DEFAULT 0,
  vote_rights INTEGER DEFAULT 0,         -- floor(total_points_cents / 1000)
  last_contribution_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Crawler rate limits (replaces KV RATE_LIMITS namespace)
CREATE TABLE IF NOT EXISTS crawler_rate_limits (
  source TEXT NOT NULL,
  date_key TEXT NOT NULL,                -- YYYY-MM-DD
  request_count INTEGER DEFAULT 0,
  last_request_at TEXT NOT NULL,
  PRIMARY KEY (source, date_key)
);

-- API rate limits (replaces KV ratelimit:api:* and ratelimit:admin:* keys)
CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,                   -- 'api' | 'admin'
  identifier TEXT NOT NULL,              -- IP address or api_key_hash
  window_key INTEGER NOT NULL,           -- time-window key (epoch / window_seconds)
  request_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, identifier, window_key)
);
```

---

## 10. Workers Router

Main entry point wiring all handlers:

```typescript
import { Router } from 'itty-router';

const router = Router();

// Article endpoints
router.post('/api/v1/articles', async (request, env) => {
  return handleArticleIngestion(request, env);
});

router.get('/api/v1/articles/:article_id', async (request, env) => {
  return handleArticleRetrieval(request.params.article_id, env);
});

// Analysis endpoint
router.post('/api/v1/articles/:article_id/analysis', async (request, env) => {
  return handleAnalysisSubmission(request.params.article_id, request, env);
});

// Knowledge CRUD
router.post('/api/v1/knowledge', async (request, env) => {
  return withAdminAuth(request, env, () => handleAddKnowledge(request, env));
});

router.get('/api/v1/knowledge', async (request, env) => {
  return handleListKnowledge(request, env);
});

router.get('/api/v1/knowledge/:id', async (request, env) => {
  return handleGetKnowledge(request.params.id, env);
});

router.put('/api/v1/knowledge/:id', async (request, env) => {
  return withAdminAuth(request, env, () => handleUpdateKnowledge(request.params.id, request, env));
});

router.delete('/api/v1/knowledge/:id', async (request, env) => {
  return withAdminAuth(request, env, () => handleDeleteKnowledge(request.params.id, env));
});

// Health
router.get('/api/v1/health', () => {
  return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// 404 fallback
router.all('*', () => {
  return new Response(JSON.stringify({
    success: false,
    data: null,
    error: { type: 'not_found', message: '找不到請求的資源' }
  }), { status: 404, headers: { 'Content-Type': 'application/json' } });
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await router.handle(request, env);
    } catch (err) {
      const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
      console.error(`[${requestId}] Unhandled error:`, err);
      return errorResponse(500, 'internal_error', requestId);
    }
  }
};
```

### Admin Auth Middleware

```typescript
async function withAdminAuth(
  request: Request,
  env: Env,
  handler: () => Promise<Response>
): Promise<Response> {
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey !== env.ADMIN_API_KEY) {
    const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
    return errorResponse(401, 'unauthorized', requestId);
  }
  return handler();
}
```

---

## Common Mistakes

### Mistake 1: Re-querying Vectorize on every client request

- **Problem**: Each client article fetch triggers a Vectorize query, exhausting the 30M dimensions/month quota
- **Correct**: Pre-compute Layer 2 at ingestion time, store in D1, serve pre-computed text to clients
- **Impact**: 600 articles/day x 1024d = 614K dims/day at ingestion only, vs 614K x N clients

### Mistake 2: Storing content_markdown in D1

- **Problem**: D1 has a 5GB free tier limit; full article text quickly fills it
- **Correct**: Store content_markdown in R2 (10GB free, unlimited egress), keep only metadata in D1
- **Size estimate**: 600 articles/day x 5KB avg = 3MB/day = ~90MB/month in R2

### Mistake 3: Using in-memory rate limiting

- **Problem**: Workers are stateless; in-memory counters reset on every request
- **Correct**: Always persist rate limits in D1 with periodic cleanup (KV's 1000 writes/day free tier is too low for rate limit counters)
- **OceanRAG lesson**: Attackers just wait for restart to reset limits

### Mistake 4: Exposing quality gate internal details to users

- **Problem**: Returning threshold values, comparison algorithms, or specific failure data to clients
- **Correct**: Map all quality gate failures to generic user-facing messages via `getQualityGateUserMessage()`
- **Reference**: T06 ERROR_HANDLING.md v1.1

### Mistake 5: Mixing bge-m3 and bge-small-zh in the same pipeline

- **Problem**: bge-m3 (1024d) and bge-small-zh (512d) produce incompatible vector spaces
- **Correct**: bge-small-zh is ONLY for Crawler-side topic filtering; knowledge base uses ONLY bge-m3
- **Detection**: Vectorize will throw dimension mismatch error -- log as CRITICAL

### Mistake 6: Not handling R2 read failures gracefully

- **Problem**: If R2 is temporarily unavailable, the entire article fetch fails
- **Correct**: Return degraded response with article summary from D1 + `degraded: true` flag
- **Reference**: T06 ERROR_HANDLING.md degradation strategy

---

## Change Log

| Version | Date | Changes | Affected Teams |
|---------|------|---------|---------------|
| v1.0 | 2026-03-07 | Initial pipeline spec: 4 pipelines, TypeScript interfaces, D1 schema, error handling | T01, T04, T05, T06, T07 |
| v1.1 | 2026-03-07 | Complete KV→D1 migration: `checkCrawlerRateLimit()` migrated to D1 `crawler_rate_limits` table, `preCheckAnalysis()` migrated to D1 COUNT query on `analyses`, `rateLimitMiddleware()` migrated to D1 `api_rate_limits` table, `Env` interface removed `KV` binding, R2 fallback removed KV temp storage, users table fixed to `total_points_cents` INTEGER, added `crawler_rate_limits` and `api_rate_limits` D1 schemas, added cleanup cron trigger, updated Common Mistake 3 to reference D1 | T01, T04, T05, T06, T07 |
| v1.2 | 2026-03-08 | 推理引擎 Ollama → WebLLM; 模型更新 Qwen3.5-4B (`qwen3.5:4b`) → Qwen3-4B (`Qwen3-4B-q4f16_1-MLC`); `num_predict` → `max_tokens` (OpenAI-compatible API via WebLLM); client inference 改為 WebGPU browser-based | T03, T04 |

---

**Maintainer**: T03 (AI Inference Team)
**Last Updated**: 2026-03-08
**Next Review**: After T04 client integration begins
