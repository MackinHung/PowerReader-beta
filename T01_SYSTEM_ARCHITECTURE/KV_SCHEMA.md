# PowerReader Storage Schema

## Navigation
- **Upstream**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **Downstream**: T02 (article ingestion), T03 (analysis + knowledge), T04 (read/display), T05 (points)
- **Maintainer**: T01 (System Architecture Team)
- **Type**: SSOT (Single Source of Truth)
- **Last Updated**: 2026-03-07

---

## Purpose

This is the **sole definition of all PowerReader storage structures** across the 4 storage layers:
D1 (primary relational), R2 (object storage), Vectorize (vector search), KV (cache only).

All teams must follow this schema. Do not define data structures independently.

**Notify when modifying this file**: T02, T03, T04, T05, T07

---

## Architecture Overview

| Layer | Role | Free Tier Limit | Usage |
|-------|------|-----------------|-------|
| **D1** | Primary relational storage (SSOT for all structured data) | 5GB, 5M reads/day | Articles index, analyses, users, crawler runs |
| **R2** | Object storage for full-text content | 10GB, egress free | Article markdown, knowledge snapshots |
| **Vectorize** | Vector similarity search for knowledge base | 30M query dimensions/month | Knowledge entries (politician/media/topic/term/event) |
| **KV** | Cache layer only (NOT primary storage) | 1GB, 100K reads/day, 1000 writes/day | Config cache, API response cache, rate limit counters |

**Key Design Decision**: KV is cache-only. All primary data lives in D1 + R2. This avoids KV's 1000 writes/day limit being a bottleneck and ensures strong consistency via D1.

---

## Layer 1: D1 Tables (Primary Storage)

### `articles` table

```sql
CREATE TABLE articles (
  article_id TEXT PRIMARY KEY,        -- SHA-256 of primary_url
  content_hash TEXT NOT NULL,         -- SHA-256 of content_markdown (dedup check)
  title TEXT NOT NULL,
  summary TEXT,                       -- Max 500 chars
  author TEXT,                        -- Nullable
  source TEXT NOT NULL,               -- Must be in NEWS_SOURCES enum
  primary_url TEXT NOT NULL,
  duplicate_urls TEXT,                -- JSON array of string URLs
  published_at TEXT NOT NULL,         -- ISO 8601 + timezone
  crawled_at TEXT NOT NULL,           -- ISO 8601 + timezone
  char_count INTEGER NOT NULL,       -- >= 1
  filter_score REAL,                 -- 0.0 - 1.0 (bge-small-zh relevance score)
  matched_topic TEXT,                -- Topic that passed filter threshold
  r2_path TEXT NOT NULL,             -- R2 object key: articles/{date}/{id}.json
  status TEXT NOT NULL DEFAULT 'crawled', -- ARTICLE_STATUS enum (state machine)
  status_updated_at TEXT,
  embedding_status TEXT DEFAULT 'pending', -- pending | completed | failed
  knowledge_ids TEXT,                -- JSON array of matched knowledge IDs from Vectorize
  bias_score INTEGER,                -- 0-100, set after analysis consensus
  bias_category TEXT,                -- BIAS_CATEGORIES enum
  controversy_score INTEGER,         -- 0-100
  controversy_level TEXT,            -- CONTROVERSY_LEVELS enum
  analysis_count INTEGER DEFAULT 0,  -- Number of completed analyses
  consensus_reached INTEGER DEFAULT 0, -- Boolean: 0 or 1
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_content_hash ON articles(content_hash);
```

### `analyses` table

```sql
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,           -- SHA-256 anonymized user ID
  bias_score INTEGER NOT NULL,       -- 0-100
  bias_category TEXT NOT NULL,       -- Computed from bias_score
  controversy_score INTEGER NOT NULL, -- 0-100
  controversy_level TEXT NOT NULL,   -- Computed from controversy_score
  reasoning TEXT NOT NULL,           -- Qwen's reasoning text explaining the scores
  key_phrases TEXT NOT NULL,         -- JSON array of key phrases extracted from analysis
  quality_gate_result TEXT NOT NULL, -- passed | failed | partial
  quality_scores TEXT,               -- JSON: { format_valid, range_valid, consistency_valid, duplicate_valid }
  prompt_version TEXT NOT NULL,      -- Must match T03 PROMPT_VERSIONS.md
  analysis_duration_ms INTEGER,      -- Time taken for Qwen inference
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(article_id),
  UNIQUE(article_id, user_hash)     -- One analysis per user per article
);

CREATE INDEX idx_analyses_article ON analyses(article_id);
CREATE INDEX idx_analyses_user ON analyses(user_hash);
```

### `users` table

```sql
CREATE TABLE users (
  user_hash TEXT PRIMARY KEY,        -- SHA-256 of Google UID (anonymized)
  total_points_cents INTEGER DEFAULT 0, -- Integer cents: 1230 = 12.30 points
  contribution_count INTEGER DEFAULT 0,
  vote_rights INTEGER DEFAULT 0,     -- floor(total_points_cents / 1000)
  daily_analysis_count INTEGER DEFAULT 0, -- Reset daily, max REWARD.DAILY_ANALYSIS_LIMIT
  consecutive_failures INTEGER DEFAULT 0, -- Track for anti-cheat cooldown
  cooldown_until TEXT,               -- ISO 8601, null if not in cooldown
  last_contribution_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Points system**: All point values stored as integer cents to avoid floating-point precision issues.
- `total_points_cents = 1230` means `12.30` display points
- `vote_rights = floor(total_points_cents / 1000)` (1000 cents = 10.00 points = 1 vote right)
- Each valid analysis earns `REWARD.POINTS_PER_VALID_ANALYSIS` cents (default: 10 = 0.10 points)

### `crawler_runs` table

```sql
CREATE TABLE crawler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,              -- ISO 8601 + timezone
  total_crawled INTEGER,             -- Total articles found
  filtered_count INTEGER,            -- Passed bge-small-zh filter
  pushed_count INTEGER,              -- Successfully pushed to PowerReader
  failed_count INTEGER,              -- Failed to push
  duration_seconds REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Layer 2: R2 Object Storage (Full Text)

### Path Convention

```
powerreader-articles/
  articles/
    {YYYY-MM-DD}/
      {article_id}.json              -- Full article content + metadata
  knowledge/
    versions/
      v1.json                        -- Knowledge base snapshot (backup)
```

### Article Object Schema (`articles/{date}/{id}.json`)

```javascript
{
  "article_id": "sha256...",
  "content_hash": "sha256...",
  "title": "Article Title",
  "summary": "Summary text",
  "author": "Reporter Name",
  "content_markdown": "Full article text in Markdown format...",
  "char_count": 1847,
  "source": "liberty_times",
  "primary_url": "https://news.ltn.com.tw/...",
  "duplicate_urls": ["https://repost1.com/..."],
  "published_at": "2026-03-07T14:00:00+08:00",
  "crawled_at": "2026-03-07T14:35:00+08:00",
  "filter_score": 0.73,
  "matched_topic": "political_news",
  "dedup_metadata": {
    "total_found": 5,
    "unique_content": 1,
    "similarity_scores": [0.95, 0.91]
  },
  "stored_at": "2026-03-07T14:36:00+08:00"
}
```

---

## Layer 3: Vectorize (Knowledge Vector Search)

### Index Configuration

```
Index name:  powerreader-knowledge
Dimensions:  1024 (bge-m3, Cloudflare Workers AI @cf/baai/bge-m3)
Metric:      cosine
Namespace:   default

Query settings:
  topK:              5
  min score:         0.4 (CLOUDFLARE.VECTORIZE_MIN_SCORE)
  returnMetadata:    true
  returnValues:      false
```

### Vector Metadata Schema

Each vector in the index carries the following metadata:

```javascript
{
  "id": "know_001",                  -- Unique knowledge entry ID
  "type": "politician",             -- One of: politician | media | topic | term | event
  "title": "Person or Entity Name",
  "snippet": "Brief description with political context (max 200 chars)"
}
```

### Knowledge Types

| Type | Description | Example |
|------|-------------|---------|
| `politician` | Political figures with party affiliation + stance labels | Lai Ching-te (DPP, President) |
| `media` | Media outlets with bias tendency scores | Liberty Times (center-left) |
| `topic` | Political topics with blue/green stance comparison | Nuclear power (KMT: support, DPP: oppose) |
| `term` | Taiwan-specific terms with political context | 1992 Consensus |
| `event` | Recent events with background context | 2026 Local Elections |

### Knowledge Lifecycle
1. T03 creates/updates knowledge entries via `POST /knowledge/upsert`
2. Workers AI embeds the `content` field using bge-m3 (1024d)
3. Vector + metadata stored in Vectorize index
4. At article ingestion time, Workers queries Vectorize with article title (topK=5)
5. Matched knowledge IDs stored in D1 `articles.knowledge_ids`
6. Client retrieves knowledge via `GET /articles/:id/knowledge`

---

## Layer 4: KV Namespaces (Cache Only)

**Design Principle**: KV is a cache layer, NOT primary storage. All authoritative data lives in D1 + R2. KV provides fast reads and temporary state tracking.

### Namespace: `CONFIG`
**Purpose**: System configuration cache (rarely changes)

| Key Pattern | Value | TTL | Writer | Reader |
|-------------|-------|-----|--------|--------|
| `config:system` | JSON system settings | No expiry | T01 (deploy) | All |
| `config:feature_flags` | JSON feature toggles | 1 hour | T01 (deploy) | All |
| `config:kv_budget:{date}` | JSON daily KV write counts per team | 24 hours | `kv-budget.js` middleware | T07 |

### Namespace: `CACHE`
**Purpose**: API response cache (reduces D1 reads)

| Key Pattern | Value | TTL | Writer | Reader |
|-------------|-------|-----|--------|--------|
| `cache:articles:list:{page}:{filters_hash}` | JSON paginated article list | 5 seconds | Workers API | Workers API |
| `cache:article:{article_id}` | JSON single article | 1 hour | Workers API | Workers API |
| `cache:knowledge:{article_id}` | JSON knowledge entries for article | 1 hour | Workers API | Workers API |

### Namespace: `RATE_LIMITS`
**Purpose**: Persistent rate limit counters (MUST NOT be in-memory)

| Key Pattern | Value | TTL | Writer | Reader |
|-------------|-------|-----|--------|--------|
| `ratelimit:{source}:{date}` | JSON `{ request_count, last_request_at, delay_ms }` | 24 hours | T02 Crawler | T02 Crawler |
| `ratelimit:api:{ip_or_user}:{window}` | JSON `{ count, window_start }` | 1 hour | Workers API | Workers API |

**Lesson from OceanRAG**: In-memory rate limits reset on restart. Always persist to KV.

### Namespace: `VOTES` (Phase 2+ Reserved)
**Purpose**: Vote results storage (publicly auditable)
**Status**: Phase 2+ deferred. Namespace reserved but not implemented.

| Key Pattern | Value | TTL | Writer | Reader |
|-------------|-------|-----|--------|--------|
| `vote:{vote_id}` | JSON vote result (ranked articles, seed, shuffle proof) | 365 days | T05 | T04 (public) |

> **Note**: `VOTE_RESULTS` functionality is **deferred to Phase 2+**. The KV namespace is reserved but no code should read/write to it in Phase 1.

---

## Article Status State Machine

```
crawled ──→ filtered ──→ deduplicated ──→ analyzed ──→ validated ──→ published
                                              │
                                              └──→ rejected
```

| Transition | Trigger | Responsible |
|------------|---------|-------------|
| `crawled -> filtered` | bge-small-zh filter_score >= threshold | T02 Crawler |
| `filtered -> deduplicated` | Content hash dedup + similarity check | T02 Crawler |
| `deduplicated -> analyzed` | Qwen analysis submitted + quality gates run | T03 (via user) |
| `analyzed -> validated` | Quality gates passed | T03 server-side |
| `analyzed -> rejected` | Quality gates failed | T03 server-side |
| `validated -> published` | Auto-publish (Decision #003 Method A) | Workers API |

**Rule**: State transitions MUST use `canTransitionStatus()` from `shared/state-machine.js`. Direct status assignment is forbidden.

```javascript
// WRONG
article.status = ARTICLE_STATUS.PUBLISHED;

// CORRECT
import { canTransitionStatus } from '../shared/state-machine.js';
if (canTransitionStatus(article.status, ARTICLE_STATUS.VALIDATED)) {
  // Create new article object with updated status (immutable)
  const updated = { ...article, status: ARTICLE_STATUS.VALIDATED };
}
```

---

## Team Interface Contracts

### T02 (Data Acquisition) writes to:

| Storage | Fields | Validation |
|---------|--------|------------|
| D1 `articles` | article_id, content_hash, title, summary, author, source, primary_url, duplicate_urls, published_at, crawled_at, char_count, filter_score, matched_topic, r2_path, status | Source in `NEWS_SOURCES`; status must be `FILTERED` or `DEDUPLICATED` |
| R2 `articles/{date}/{id}.json` | Full article JSON object | content_markdown non-empty |
| KV `RATE_LIMITS` | `ratelimit:{source}:{date}` counters | delay_ms >= `CRAWLER.RATE_LIMIT_DELAY_MS` |

### T03 (AI Inference) writes to:

| Storage | Fields | Validation |
|---------|--------|------------|
| D1 `analyses` | article_id, user_hash, bias_score, bias_category, controversy_score, controversy_level, reasoning, key_phrases, quality_gate_result, quality_scores, prompt_version | bias_score 0-100; controversy_score 0-100; prompt_version matches PROMPT_VERSIONS.md |
| D1 `articles` (update) | bias_score, bias_category, controversy_score, controversy_level, status, analysis_count, consensus_reached | Status transition via `canTransitionStatus()` |
| Vectorize `powerreader-knowledge` | Knowledge vectors + metadata | type must be one of: politician/media/topic/term/event |

### T04 (Frontend) reads from:

| Storage | What | Access |
|---------|------|--------|
| D1 `articles` | Article list + details (via API) | Read-only via `GET /articles` |
| R2 `articles/{date}/{id}.json` | Full article text (via API) | Read-only via `GET /articles/:id` |
| D1 `analyses` | Analysis results (via API) | Read-only via `GET /articles/:id/analyses` |
| Vectorize results (cached) | Knowledge entries (via API) | Read-only via `GET /articles/:id/knowledge` |

**T04 NEVER writes to any storage directly** - all writes go through the API.

### T05 (Reward System) reads/writes:

| Storage | Operation | Fields |
|---------|-----------|--------|
| D1 `users` | Read | total_points_cents, contribution_count, vote_rights, daily_analysis_count, consecutive_failures, cooldown_until |
| D1 `users` | Write | total_points_cents, contribution_count, vote_rights, daily_analysis_count, consecutive_failures, cooldown_until, last_contribution_at |
| D1 `analyses` | Read | quality_gate_result (to determine if points are awarded), article_id + user_hash (duplicate check) |
| KV `VOTES` (Phase 2+) | Write | Vote results (deferred) |

**Important**: T05 reward data lives **entirely in D1** (Decision #008: KV is cache-only).
T05 endpoints: `POST /rewards/submit`, `POST /rewards/failure`, `GET /rewards/me` — all use D1 `users` table.
T05 should NOT use KV namespaces for `user:{hash}` or `article:{hash}:{hash}` dedup markers;
dedup is enforced by D1 `UNIQUE(article_id, user_hash)` constraint on `analyses` table.

### T07 (Deployment & Monitoring) reads from:

| Storage | What | Access |
|---------|------|--------|
| D1 all tables | Row counts, storage usage | Via `GET /monitoring/usage` |
| KV `CONFIG` | `config:kv_budget:{date}` | Via `GET /monitoring/usage` |
| All layers | Health check connectivity | Via `GET /health/ready` |

---

## Schema Validation Rules

### Rule 1: Field Name Consistency
- NEVER use `words` field - always use `tokens` (if tokenization is needed)
- NEVER use `total_points` (float) - always use `total_points_cents` (integer)
- NEVER hardcode source names - use `shared/enums.js NEWS_SOURCES`
- NEVER hardcode status values - use `shared/enums.js ARTICLE_STATUS`

### Rule 2: Timestamp Format
All timestamps MUST use ISO 8601 with timezone:
```javascript
"2026-03-07T10:00:00+08:00"  // CORRECT
"2026-03-07 10:00:00"        // WRONG (no timezone)
1709794800                   // WRONG (unix timestamp)
```

### Rule 3: Immutable Updates
Never mutate existing objects. Create new objects with updated fields:
```javascript
// WRONG
article.status = 'published';

// CORRECT
const updatedArticle = { ...article, status: 'published', updated_at: nowISO() };
```

### Rule 4: Integer Cents for Points
Never use floating-point for point values:
```javascript
// WRONG
user.total_points = 12.3;

// CORRECT
user.total_points_cents = 1230; // 12.30 points
user.vote_rights = Math.floor(user.total_points_cents / 1000); // 1 vote right
```

---

## Common Mistakes

### Mistake 1: Writing primary data to KV instead of D1
```javascript
// WRONG: Using KV as primary storage
await env.KV.put(`article:${id}`, JSON.stringify(article));

// CORRECT: D1 is primary, KV is cache
await env.D1.prepare("INSERT INTO articles ...").bind(...).run();
await env.KV.put(`cache:article:${id}`, JSON.stringify(article), { expirationTtl: 3600 });
```

### Mistake 2: Hardcoding source names
```javascript
// WRONG
if (source === "liberty_times") { ... }

// CORRECT
import { NEWS_SOURCES } from '../shared/enums.js';
if (source === NEWS_SOURCES.LIBERTY_TIMES) { ... }
```

### Mistake 3: Skipping state transitions
```javascript
// WRONG (jumping from crawled to published)
article.status = ARTICLE_STATUS.PUBLISHED;

// CORRECT (following state machine)
import { canTransitionStatus } from '../shared/state-machine.js';
if (canTransitionStatus(article.status, ARTICLE_STATUS.VALIDATED)) {
  const updated = { ...article, status: ARTICLE_STATUS.VALIDATED };
}
```

### Mistake 4: Using float for points
```javascript
// WRONG
{ "total_points": 12.3 }

// CORRECT
{ "total_points_cents": 1230 }
```

### Mistake 5: In-memory rate limits
```javascript
// WRONG: Resets on restart
const rateLimitCounter = {};

// CORRECT: Persisted in KV
await env.KV.put(`ratelimit:${source}:${date}`, JSON.stringify({ count }), {
  expirationTtl: 86400
});
```

---

## Change Log

| Version | Date | Changes | Reason | Affected Teams |
|---------|------|---------|--------|----------------|
| v1.0 | 2025-03-06 | Initial KV-only schema | Project kickoff | All |
| v2.0 | 2026-03-07 | Complete overhaul: 4-layer storage (D1+R2+Vectorize+KV), KV demoted to cache-only, D1 as primary, state machine, integer cents points, knowledge lifecycle, team contracts, Phase 2+ vote deferral | Architecture decisions #004-#010, Cloudflare full-stack migration | All |

---

**IMPORTANT**: Before modifying this file:
1. Submit a GitHub PR for discussion
2. Notify all downstream teams (T02, T03, T04, T05)
3. Update MASTER_ROADMAP.md decision record
4. M01 reviews cross-team impact

---

**Document Maintainer**: T01 (System Architecture Team)
**Last Updated**: 2026-03-07
**Next Review**: End of Phase 2
