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
        "status": "published",
        "thumbnail_url": "https://..."
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
| `model_name` | string | No | Optional model identifier (e.g., `Qwen3-4B-q4f16_1-MLC`) |

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

## Feedback API (v2.0 — 回饋機制)

### `POST /api/v1/articles/:article_id/feedback`
**Purpose**: Submit user feedback on analysis quality
**Auth**: JWT required
**Rate Limit**: 10/min per user

| Body Field | Type | Required | Validation |
|-----------|------|----------|------------|
| `type` | string | Yes | `thumbs_up` or `thumbs_down` |
| `comment` | string | No | Max 500 chars, optional text feedback |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "feedback_id": "fb_abc123",
    "article_id": "sha256...",
    "user_hash": "sha256...",
    "type": "thumbs_up",
    "created_at": "2026-03-08T10:00:00+08:00"
  },
  "error": null
}
```

**Duplicate check**: One feedback per user per article (upsert — latest wins).

### `GET /api/v1/articles/:article_id/feedback/stats`
**Purpose**: Get aggregated feedback stats for an article
**Auth**: Not required

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "article_id": "sha256...",
    "thumbs_up": 15,
    "thumbs_down": 3,
    "total": 18
  },
  "error": null
}
```

---

## Events API (v2.0 — 事件聚合 + 三營陣)

### `GET /api/v1/events`
**Purpose**: Get event (cluster) list with three-camp distribution
**Auth**: Not required
**Rate Limit**: 60/min

| Parameter | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `page` | number | No | Page number (default 1) | >= 1 |
| `limit` | number | No | Items per page (default 20, max 50) | 1-50 |
| `sort_by` | string | No | Sort field | Whitelist: `controversy_avg`, `article_count`, `created_at` |
| `sort_order` | string | No | Sort direction | `asc` or `desc` (default `desc`) |
| `blindspot_only` | boolean | No | Only return events with blindspot | `true` or `false` |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "events": [
      {
        "cluster_id": "evt_abc123",
        "title": "立法院審議前瞻計畫",        // Representative title (highest controversy article)
        "article_count": 12,
        "source_count": 5,
        "sources": ["liberty_times", "cna", "united_daily_news", "china_times", "newtalk"],
        "controversy_avg": 72,
        "camp_distribution": {
          "green": 4,                           // Article count per camp
          "white": 2,
          "blue": 6
        },
        "camp_pct": {
          "green": 33.3,                        // Percentage
          "white": 16.7,
          "blue": 50.0
        },
        "blindspot": "imbalanced",              // BLINDSPOT_TYPES value, or null
        "consensus_score": 45,                  // 100 - std(bias_scores)*3
        "created_at": "2026-03-08T10:00:00+08:00",
        "updated_at": "2026-03-08T14:00:00+08:00"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 35, "total_pages": 2 }
  },
  "error": null
}
```

**⚠️ REUSES EXISTING**: `articles.bias_score` → `getCampFromScore()` per cluster member → aggregate counts

### `GET /api/v1/events/:cluster_id`
**Purpose**: Get event detail with member articles and three-camp analysis
**Auth**: Not required

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "cluster_id": "evt_abc123",
    "title": "立法院審議前瞻計畫",
    "camp_distribution": { "green": 4, "white": 2, "blue": 6 },
    "camp_pct": { "green": 33.3, "white": 16.7, "blue": 50.0 },
    "blindspot": "imbalanced",
    "consensus_score": 45,
    "controversy_avg": 72,
    "articles": [
      {
        "article_id": "sha256...",
        "title": "Article Title",
        "source": "liberty_times",
        "bias_score": 28,
        "camp": "pan_green",                    // getCampFromScore() result
        "camp_weights": { "green": 1.0, "white": 0.0, "blue": 0.0 },
        "controversy_score": 68,
        "published_at": "2026-03-08T10:00:00+08:00"
      }
      // ... more articles, sorted by bias_score ascending
    ],
    "three_way_summary": {                      // Phase 5, null before implementation
      "green_summary": "泛綠方觀點摘要...",
      "white_summary": "中立方觀點摘要...",
      "blue_summary": "泛藍方觀點摘要...",
      "subscriber_only": false                  // true if user not subscribed
    }
  },
  "error": null
}
```

---

## Blindspot API (v2.0 — 報導盲區)

### `GET /api/v1/blindspot/events`
**Purpose**: Get events with blindspot detection results
**Auth**: Not required
**Rate Limit**: 60/min

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default 1) |
| `limit` | number | No | Items per page (default 20) |
| `type` | string | No | Filter by blindspot type | Must be in `BLINDSPOT_TYPES` |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "blindspot_events": [
      {
        "cluster_id": "evt_abc123",
        "title": "環境保護法修正案",
        "blindspot_type": "green_only",          // BLINDSPOT_TYPES value
        "camp_distribution": { "green": 5, "white": 1, "blue": 0 },
        "camp_pct": { "green": 83.3, "white": 16.7, "blue": 0.0 },
        "missing_camp": "pan_blue",              // Which camp is missing
        "article_count": 6,
        "source_count": 3,
        "detected_at": "2026-03-08T12:00:00+08:00"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 8, "total_pages": 1 }
  },
  "error": null
}
```

**⚠️ DERIVED**: Cron Worker 每小時掃描 `event_clusters` → `detectBlindspot(campCounts)` → 結果存 `blindspot_events` D1 表

---

## Source Transparency API (v2.0 — 來源透明度)

### `GET /api/v1/sources`
**Purpose**: Get all source tendency profiles
**Auth**: Not required

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "sources": [
      {
        "source": "liberty_times",
        "display_name": "自由時報",
        "avg_bias_score": 32.5,
        "camp": "pan_green",
        "sample_count": 45,
        "confidence": "high",                    // high (>=30) / mid (>=10) / low (<10)
        "last_updated": "2026-03-08T00:00:00+08:00"
      }
    ]
  },
  "error": null
}
```

### `GET /api/v1/sources/:source`
**Purpose**: Get detailed source transparency panel
**Auth**: Not required

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string (path) | Yes | Source key (e.g., `liberty_times`) |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "source": "liberty_times",
    "display_name": "自由時報",
    "metadata": {
      "type": "傳統紙媒",
      "founded": 1980,
      "owner": "聯邦企業集團"
    },
    "tendency": {
      "avg_bias_score": 32.5,
      "camp": "pan_green",
      "sample_count": 45,
      "window_days": 30,
      "confidence": "high"
    },
    "camp_distribution": { "green": 33, "white": 8, "blue": 4 },
    "monthly_trend": [
      { "month": "2026-02", "avg_bias": 34.2, "count": 38 },
      { "month": "2026-01", "avg_bias": 31.8, "count": 42 }
      // ... up to 6 months
    ],
    "recent_articles": [
      {
        "article_id": "sha256...",
        "title": "Article Title",
        "bias_score": 28,
        "camp": "pan_green",
        "published_at": "2026-03-08T10:00:00+08:00"
      }
      // ... top 10 recent
    ]
  },
  "error": null
}
```

**⚠️ REUSES EXISTING**: `articles.bias_score`, `articles.source`, `articles.published_at` — 全部已有欄位
**⚠️ DERIVED**: tendency = `SELECT AVG(bias_score), COUNT(*) FROM articles WHERE source=? AND published_at > DATE('now', '-30 days')`

---

## Reading Bias API (v2.0 — 個人閱讀偏見)

### `GET /api/v1/user/me/reading-bias`
**Purpose**: Get personal reading bias analysis
**Auth**: JWT required

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | number | No | Analysis window (default 30, max 90) |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "period_days": 30,
    "total_articles_read": 85,
    "camp_distribution": { "green": 53, "white": 15, "blue": 17 },
    "camp_pct": { "green": 62.4, "white": 17.6, "blue": 20.0 },
    "bias_level": "skewed_green",                // balanced / skewed_green / skewed_blue / skewed_white
    "suggestion": {
      "text": "reading_bias.skewed",             // i18n key
      "recommended_camp": "pan_blue",
      "recommended_articles": [
        { "article_id": "sha256...", "title": "...", "source": "united_daily_news", "camp": "pan_blue" }
      ]
    },
    "badges": [
      { "badge_type": "cross_media_expert", "earned_at": "2026-03-05T10:00:00+08:00" }
    ],
    "streaks": {
      "current_streak_days": 5,
      "longest_streak_days": 12
    }
  },
  "error": null
}
```

---

## Subscription API (v2.0 — 訂閱)

### `POST /api/v1/subscribe`
**Purpose**: Create or manage subscription
**Auth**: JWT required

| Body Field | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `subscribe` or `unsubscribe` |
| `email` | string | Conditional | Required for `subscribe` |
| `notifications` | object | No | `{ daily_digest: true, blindspot_alert: true, analysis_result: true }` |

**Response (200)**:
```javascript
{
  "success": true,
  "data": {
    "user_hash": "sha256...",
    "tier": "supporter",                         // SUBSCRIBER_TIERS value
    "email_verified": true,
    "notifications": {
      "daily_digest": true,
      "blindspot_alert": true,
      "analysis_result": true
    },
    "subscribed_at": "2026-03-08T10:00:00+08:00"
  },
  "error": null
}
```

### `GET /api/v1/subscribe/status`
**Purpose**: Check subscription status
**Auth**: JWT required

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
| `/events` GET | T01 | Cron Worker | T04 |
| `/events/:cluster_id` GET | T01 | Cron Worker | T04 |
| `/blindspot/events` GET | T01 | Cron Worker | T04 |
| `/sources` GET | T01 | Cron Worker | T04 |
| `/sources/:source` GET | T01 | Cron Worker | T04 |
| `/user/me/reading-bias` GET | T01 | T04 (track) | T04 |
| `/subscribe` POST | T01 | T04 | - |
| `/subscribe/status` GET | T01 | - | T04 |
| `/articles/:id/feedback` POST | T01 | T04 (user) | - |
| `/articles/:id/feedback/stats` GET | T01 | - | T04 |

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
| v3.0 | 2026-03-08 | v2.0 Three-Camp: Events API (GET /events, /events/:id), Blindspot API (GET /blindspot/events), Source Transparency API (GET /sources, /sources/:source), Reading Bias API (GET /user/me/reading-bias), Subscription API (POST /subscribe, GET /subscribe/status) | T04, All teams |
| v3.1 | 2026-03-08 | Added Feedback API (POST/GET feedback), articles.thumbnail_url, analyses.model_name; v2.0 UX feasibility decisions #017-#020 | T04 |

---

**Document Maintainer**: T01 (System Architecture Team)
**Last Updated**: 2026-03-08
**Status**: Complete (v3.1 — Feedback API + thumbnail_url + model_name)
