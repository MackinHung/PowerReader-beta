# API Routes Definition

## Navigation
- **Upstream**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **Downstream**: T02 (write endpoints), T03 (analysis endpoints), T04 (read endpoints), T05 (points endpoints)
- **Maintainer**: T01 (System Architecture Team)
- **Type**: SSOT (Single Source of Truth)
- **Last Updated**: 2026-03-07

---

## Purpose
This is the **sole definition of all Cloudflare Workers API routes**.
All teams must follow this route design and must not define API endpoints independently.

**Notify when modifying this file**: T02, T03, T04, T05, T07

---

## Base URL & Versioning

```
Production: https://api.{project-domain}.pages.dev
Staging:    https://staging.{project-domain}.pages.dev
Base Path:  /api/v1
```

### Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `Authorization` | Per endpoint | `Bearer {JWT}` (RS256) |
| `X-Request-ID` | Auto-generated | Unique request tracking ID |

### Unified Response Format

```javascript
// Success
{ "success": true, "data": { ... }, "error": null }

// Failure (uses shared/enums.js ERROR_TYPES + getUserErrorMessage())
{
  "success": false,
  "data": null,
  "error": {
    "type": "validation_error",
    "message": "輸入資料格式錯誤,請檢查後重試",
    "request_id": "req_abc123"
  }
}
```

---

## Articles API (T02 writes, T04 reads)

### `GET /api/v1/articles`
**Purpose**: Get article list (paginated)
**Auth**: Not required
**Rate Limit**: 60/min (`SECURITY.API_RATE_LIMIT_PER_MINUTE`)

| Parameter | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `page` | number | No | Page number (default 1) | >= 1 |
| `limit` | number | No | Items per page (default 20, max 100) | 1-100 |
| `source` | string | No | Filter by news source | Must be in `NEWS_SOURCES` |
| `status` | string | No | Filter by status | Must be in `ARTICLE_STATUS` |
| `category` | string | No | Filter by news category | Must be in `NEWS_CATEGORIES` |
| `sort_by` | string | No | Sort field | Whitelist: `published_at`, `bias_score`, `controversy_score` |
| `sort_order` | string | No | Sort direction | `asc` or `desc` |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "articles": [
      {
        "article_id": "sha256...",
        "url": "https://news.ltn.com.tw/...",
        "source": "liberty_times",
        "title": "News Title",
        "summary": "Summary text",
        "published_at": "2026-03-07T10:00:00+08:00",
        "bias_score": 65,
        "bias_category": "center_right",
        "controversy_score": 12,
        "controversy_level": "moderate",
        "status": "published"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 150, "total_pages": 8 }
  },
  "error": null
}
```

### `GET /api/v1/articles/:article_id`
**Purpose**: Get single article details
**Auth**: Not required
**Storage**: D1 `articles` table + R2 full text

### `POST /api/v1/articles` (Internal)
**Purpose**: T02 Crawler writes a single new article
**Auth**: Service Token
**Storage**: D1 `articles` table + R2 `articles/{date}/{id}.json`

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `article_id` | string | Yes | SHA-256 of primary_url |
| `content_hash` | string | Yes | SHA-256 of content_markdown |
| `title` | string | Yes | Non-empty |
| `summary` | string | No | Max 500 chars |
| `author` | string | No | Nullable |
| `content_markdown` | string | Yes | Non-empty, full article text |
| `char_count` | number | Yes | >= 1 |
| `source` | string | Yes | `isValidNewsSource()` |
| `primary_url` | string | Yes | Valid URL |
| `duplicate_urls` | string[] | No | Array of valid URLs |
| `published_at` | string | Yes | ISO 8601 + timezone |
| `crawled_at` | string | Yes | ISO 8601 + timezone |
| `filter_score` | number | Yes | 0.0 - 1.0 (bge-small-zh relevance score) |
| `matched_topic` | string | Yes | Topic that passed filter |
| `status` | string | Yes | `ARTICLE_STATUS.FILTERED` or `ARTICLE_STATUS.DEDUPLICATED` |

### `POST /api/v1/articles/batch` (Internal)
**Purpose**: T02 Crawler batch writes articles (max 50 per request)
**Auth**: Service Token
**Storage**: D1 `articles` table + R2 `articles/{date}/{id}.json`

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `articles` | array | Yes | Array of article objects (same schema as single POST), max 50 items |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "accepted": 48,
    "rejected": 2,
    "errors": [
      { "article_id": "abc...", "reason": "Duplicate content_hash" },
      { "article_id": "def...", "reason": "Invalid source" }
    ]
  },
  "error": null
}
```

### `GET /api/v1/articles/:article_id/cluster`
**Purpose**: Get all articles in the same similarity cluster (same event, different reports)
**Auth**: Not required

---

## Analysis API (T03 writes)

### `POST /api/v1/articles/:article_id/analysis`
**Purpose**: Submit Qwen analysis result
**Auth**: User JWT or Service Token

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `bias_score` | number | Yes | 0-100 (`isValidBiasScore()`) |
| `controversy_score` | number | Yes | 0-100 (`isValidControversyScore()`) |
| `reasoning` | string | Yes | Non-empty, Qwen's reasoning text explaining the scores |
| `key_phrases` | string[] | Yes | Non-empty array, key phrases extracted from analysis |
| `prompt_version` | string | Yes | Must match PROMPT_VERSIONS.md |
| `user_hash` | string | Yes | SHA-256 user hash |

**Server-Side Logic**:
1. `bias_category = getBiasCategory(bias_score)`
2. `controversy_level = getControversyLevel(controversy_score)`
3. Run 4-layer quality validation -> `quality_gate_result`
4. State transition: `deduplicated -> analyzed -> validated/rejected`

### `GET /api/v1/articles/:article_id/analyses`
**Purpose**: Get all analysis results for an article (multi-user analysis)

---

## Knowledge API (T03 maintains)

### `GET /api/v1/articles/:article_id/knowledge`
**Purpose**: Get knowledge entries associated with an article (pre-queried from Vectorize)
**Auth**: Not required

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "knowledge_entries": [
      {
        "id": "know_001",
        "type": "politician",
        "title": "Person Name",
        "snippet": "Brief description with political context",
        "score": 0.85
      }
    ],
    "total": 5
  },
  "error": null
}
```

### `POST /api/v1/knowledge/upsert` (Admin)
**Purpose**: Add or update knowledge base entries (stored in Vectorize + D1)
**Auth**: Admin API Key

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `id` | string | Yes | Unique knowledge ID |
| `type` | string | Yes | One of: `politician`, `media`, `topic`, `term`, `event` |
| `title` | string | Yes | Non-empty |
| `content` | string | Yes | Full knowledge text for embedding |
| `metadata` | object | No | Additional structured data |

### `POST /api/v1/knowledge/batch` (Admin)
**Purpose**: Batch upsert knowledge entries (max 50 per call)
**Auth**: Admin API Key

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `entries` | array | Yes | Array of knowledge entry objects (same schema as upsert) |
| `entries[].party` | string | No | Party tag: `[DPP]`, `[KMT]`, `[TPP]` — anchors for embedding disambiguation |

**Response (200)**:
```javascript
{
  "success": true,
  "data": { "imported": 25, "dimensions": 1024, "ids": ["know_001", ...] },
  "error": null
}
```

### `GET /api/v1/knowledge/search?q=...` (Admin)
**Purpose**: Dynamic Vectorize similarity search — test knowledge retrieval quality
**Auth**: Admin API Key

| Query Param | Type | Default | Description |
|------------|------|---------|-------------|
| `q` | string | (required) | Search text to embed and query |
| `topK` | integer | 5 | Max results (1-20) |
| `type` | string | null | Filter by knowledge type |
| `min_score` | float | 0.4 | Minimum cosine similarity |

### `GET /api/v1/knowledge/list` (Admin)
**Purpose**: List all knowledge entries from D1 (management/debugging)
**Auth**: Admin API Key

| Query Param | Type | Default | Description |
|------------|------|---------|-------------|
| `type` | string | null | Filter by knowledge type |
| `party` | string | null | Filter by party tag |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 100) |

---

## User API

### `POST /api/v1/auth/google`
**Purpose**: Google OAuth login
**Response**: JWT (RS256, TTL=30d) + session_id + user_hash

### `GET /api/v1/user/me`
**Purpose**: Get current user info
**Auth**: JWT + Session cross-verification

### `DELETE /api/v1/user/me`
**Purpose**: Delete account (Taiwan Personal Data Protection Act Article 11: Right to Deletion)

### `GET /api/v1/user/me/export`
**Purpose**: Export personal data (data portability)

---

## Points & Rewards API (T05)

### `GET /api/v1/user/me/points`
**Purpose**: Get personal points and vote rights
**Auth**: JWT

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "total_points_cents": 1230,
    "display_points": "12.30",
    "contribution_count": 123,
    "vote_rights": 1,
    "daily_analysis_count": 3,
    "last_contribution_at": "2026-03-07T10:00:00+08:00"
  },
  "error": null
}
```

### `POST /api/v1/rewards/submit` (Internal)
**Purpose**: Process valid analysis submission — award points if quality gate passed
**Auth**: Service Token
**Storage**: D1 `users` table (NOT KV)

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `article_id` | string | Yes | SHA-256 article ID (SSOT field name) |
| `user_hash` | string | Yes | SHA-256 user hash |
| `time_spent_ms` | number | No | >= `REWARD.MIN_ANALYSIS_TIME_MS` (5000ms) |
| `quality_gate_result` | string | Yes | `passed` or `failed` |

**Anti-cheat checks**: daily limit, cooldown, duplicate (article_id + user_hash), minimum analysis time.

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "article_id": "sha256...",
    "user_hash": "sha256...",
    "points_awarded_cents": 10,
    "total_points_cents": 1240,
    "display_points": "12.40",
    "vote_rights": 1,
    "daily_analysis_count": 4
  },
  "error": null
}
```

### `POST /api/v1/rewards/failure` (Internal)
**Purpose**: Record quality gate failure, apply cooldown after consecutive failures
**Auth**: Service Token
**Storage**: D1 `users` table (NOT KV)

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `user_hash` | string | Yes | SHA-256 user hash |
| `article_id` | string | No | For logging |
| `failure_reason` | string | No | For logging |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "user_hash": "sha256...",
    "consecutive_failures": 3,
    "cooldown_applied": true,
    "cooldown_until": "2026-03-07T11:30:00Z"
  },
  "error": null
}
```

### `GET /api/v1/rewards/me` (Internal)
**Purpose**: Get user's reward summary (T05's preferred route, same data as /user/me/points)
**Auth**: Service Token
**Query**: `?user_hash=sha256...` (required)
**Storage**: D1 `users` table (NOT KV)

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "user_hash": "sha256...",
    "total_points_cents": 1230,
    "display_points": "12.30",
    "contribution_count": 123,
    "vote_rights": 1,
    "daily_analysis_count": 3,
    "consecutive_failures": 0,
    "cooldown_until": null,
    "in_cooldown": false,
    "last_contribution_at": "2026-03-07T10:00:00+08:00"
  },
  "error": null
}
```

### Phase 2+ Deferred Endpoints

The following vote endpoints are **deferred to Phase 2+** and are not implemented in Phase 1:

### `POST /api/v1/votes` (Phase 2+)
**Purpose**: Create new vote round
**Auth**: Admin JWT

### `POST /api/v1/votes/:vote_id/cast` (Phase 2+)
**Purpose**: User casts vote
**Auth**: JWT + `vote_rights >= 1`

### `GET /api/v1/votes/:vote_id/results` (Phase 2+)
**Purpose**: Get vote results (publicly auditable)

### `GET /api/v1/votes/:vote_id/verify` (Phase 2+)
**Purpose**: Verify Fisher-Yates shuffle result

---

## Health & Monitoring API (T07)

> **Note**: T01 registers routes, T07 provides monitoring logic implementation.

### `GET /api/v1/health`
**Purpose**: Basic health check (no auth required)

### `GET /api/v1/health/ready`
**Purpose**: Deep readiness check (includes D1 + KV connectivity)

### `GET /api/v1/metrics` (Internal)
**Purpose**: Metrics export (Service Token)
**Metrics**: `d1_query_latency_ms`, `cdn_cache_hit_rate`, `crawler_success_rate`, `analysis_pass_rate`

### `GET /api/v1/monitoring/usage` (Internal)
**Purpose**: Usage tracking for Cloudflare free-tier resources (neurons, vectorize queries, storage)
**Auth**: Service Token
**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "workers_ai_neurons": { "used": 960, "limit": 10000, "pct": 9.6 },
    "vectorize_queries": { "used": 18000000, "limit": 30000000, "pct": 60.0 },
    "r2_storage_gb": { "used": 2.2, "limit": 10.0, "pct": 22.0 },
    "d1_storage_gb": { "used": 0.05, "limit": 5.0, "pct": 1.0 },
    "kv_writes_today": { "used": 120, "limit": 1000, "pct": 12.0 }
  },
  "error": null
}
```

---

## Rate Limiting

| Endpoint Category | Limit | Source |
|-------------------|-------|--------|
| Public API | 60/min, 1000/hour | `SECURITY.API_RATE_LIMIT_PER_MINUTE/HOUR` |
| Authenticated API | 120/min | Logged-in users doubled |
| Health | No limit | Monitoring use |

**Response (429)**:
```javascript
{ "success": false, "error": { "type": "rate_limit_exceeded", "message": "請求過於頻繁,請稍後再試", "retry_after": 60 } }
```

---

## Team Interface Contracts

| Endpoint | Defined By | Writer | Reader |
|----------|------------|--------|--------|
| `/articles` POST | T01 | T02 | - |
| `/articles/batch` POST | T01 | T02 | - |
| `/articles` GET | T01 | - | T04 |
| `/articles/:id/analysis` POST | T01 | T03 | - |
| `/articles/:id/analyses` GET | T01 | - | T04 |
| `/articles/:id/knowledge` GET | T01 | - | T04 |
| `/knowledge/upsert` POST | T01 | T03 | - |
| `/auth/google` | T01 | T01 | T04 |
| `/user/me/points` | T01 | T05 | T04 |
| `/rewards/submit` POST | T01 | T05 (internal) | - |
| `/rewards/failure` POST | T01 | T05 (internal) | - |
| `/rewards/me` GET | T01 | - | T05 (internal) |
| `/votes/*` (Phase 2+) | T01 | T05 | T04 |
| `/health`, `/metrics` | T01 | - | T07 |
| `/monitoring/usage` | T01 | - | T07 |

---

## Common Mistakes

### Mistake 1: sort_by without whitelist validation
```javascript
// BAD - SQL Injection risk
const sortBy = request.query.sort_by;

// GOOD - Whitelist
const ALLOWED = ['published_at', 'bias_score', 'controversy_score'];
if (!ALLOWED.includes(sortBy)) return error(400);
```

### Mistake 2: Returning raw email
```javascript
// BAD: { "email": "user@gmail.com" }
// GOOD: { "user_hash": "sha256..." }
```

### Mistake 3: Skipping state transitions
```javascript
// BAD: article.status = ARTICLE_STATUS.PUBLISHED;
// GOOD: if (canTransitionStatus(current, target)) { ... }
```

### Mistake 4: Hardcoded API paths
```javascript
// BAD: fetch('/api/articles')
// GOOD: fetch('/api/v1/articles')
```

---

## Change Log

| Version | Date | Changes | Affected Teams |
|---------|------|---------|----------------|
| v0.1 | 2026-03-06 | Skeleton version | - |
| v1.0 | 2026-03-06 | Full API route definitions | All teams |
| v2.0 | 2026-03-07 | Crawler API fields (replace tokens/minhash), batch endpoint, Knowledge API, monitoring/usage, reasoning+key_phrases in analysis, vote endpoints deferred to Phase 2+, points uses total_points_cents integer, health route note (T01 routes + T07 logic) | All teams |
| v2.1 | 2026-03-07 | Added T05 reward endpoints (POST /rewards/submit, POST /rewards/failure, GET /rewards/me) — all D1-backed, Service Token auth, field name `article_id` (not `article_hash`) | T05, T03 |
| v2.2 | 2026-03-07 | Added knowledge batch/search/list endpoints, D1 knowledge_entries table, party tag for DPP/KMT/TPP disambiguation | T03 |

---

**Document Maintainer**: T01 (System Architecture Team)
**Last Updated**: 2026-03-07
**Status**: Complete
