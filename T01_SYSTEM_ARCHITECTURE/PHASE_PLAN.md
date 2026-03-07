# T01 System Architecture Team - Phase Plan

**Scope**: Cloudflare full-stack architecture, Storage Schema (D1+R2+Vectorize+KV), API route definitions, shared config/enums, and infrastructure wiring for all teams.

---

## Phase 1: Foundation (Architecture Design) [DONE]

**Deliverables** (all completed):
- [x] `KV_SCHEMA.md` - Storage schema: D1 (primary), R2 (full text), Vectorize (knowledge), KV (cache)
- [x] `API_ROUTES.md` - Full REST API: Articles, Analysis, User/Auth, Points/Votes, Knowledge, Health
- [x] `CLOUDFLARE_ARCHITECTURE.md` - Deployment topology (Pages + Workers + D1 + R2 + Vectorize + KV)
- [x] `shared/config.js` - Central config with validation functions
- [x] Unified response envelope `{ success, data, error }`

**Status**: Design docs complete. No code written yet.

---

## Phase 2: Shared Modules & Validation Layer [DONE]

**Goal**: Implement the shared libraries that all teams depend on.

| # | Task | Output File | Depends On | Status |
|---|------|-------------|------------|--------|
| 1 | Enum definitions (NEWS_SOURCES, ARTICLE_STATUS with `filtered` status, BIAS_CATEGORIES, etc.) - CKIP removed, Crawler provides pre-filtered articles | `shared/enums.js` | config.js | ✅ v2.0 |
| 2 | Storage Schema validator (D1 field types, required fields, enum checks) | `shared/validators.js` | enums.js | ✅ v1.0 |
| 3 | Article status state machine: `crawled -> filtered -> deduplicated -> analyzed -> validated -> published` with `transitionStatus()`, `getNextStates()`, `isTerminalState()`, `getTransitionOwner()` | `shared/state-machine.js` | enums.js | ✅ v1.0 |
| 4 | Error type registry + `getUserErrorMessage()` + `createErrorResponse()` + `withErrorHandling()` wrapper | `shared/errors.js` | enums.js | ✅ v1.0 |
| 5 | Timestamp + hash utility functions (12 functions) | `shared/utils.js` | - | ✅ v1.0 |
| 6 | KV Write Budget middleware - `createKvBudgetTracker()` with canWrite/recordWrites/getUsage | `shared/kv-budget.js` | config.js | ✅ v1.0 |

**Exit Criteria**: All validators pass unit tests; T02/T03 can import and use shared modules.
**Status**: All 6 modules created. Unit tests pending.

---

## Phase 3: Workers API Skeleton [DONE]

**Goal**: Deploy a working Cloudflare Workers app with routing, auth middleware, and storage bindings.

| # | Task | Details | Status |
|---|------|---------|--------|
| 1 | `wrangler.toml` with D1 + R2 + Vectorize + KV + AI bindings | T07 created, T01 reviewed | ✅ |
| 2 | Router + middleware chain (CORS, rate limit, JWT verify, input validation) | `src/workers/router.js` + `middleware/` | ✅ |
| 3 | Articles endpoints: `GET /articles`, `GET /articles/:id`, `POST /articles`, `POST /articles/batch`, `GET /articles/:id/cluster` | `handlers/articles.js` | ✅ |
| 4 | Analysis endpoint: `POST /articles/:id/analysis`, `GET /articles/:id/analyses` | `handlers/analysis.js` | ✅ |
| 5 | Auth endpoints: `POST /auth/google`, `GET /user/me`, `DELETE /user/me`, `GET /user/me/export` | `handlers/auth.js` | ✅ |
| 6 | Points endpoint: `GET /user/me/points`. Vote endpoints **Phase 2+ deferred** | `handlers/points.js` | ✅ |
| 7 | Health endpoints: `GET /health`, `GET /health/ready`, `GET /metrics`, `GET /monitoring/usage` — T01 routes + T07 logic | `handlers/health.js` | ✅ |
| 8 | Knowledge endpoints: `GET /articles/:id/knowledge`, `POST /knowledge/upsert` | `handlers/knowledge.js` | ✅ |
| 9 | D1 migration: `0001_initial.sql` (articles, analyses, users, sessions, crawler_runs) + `0002_metrics.sql` (T07) | `migrations/` | ✅ |
| 10 | T07 monitoring integration: metrics collector, alerts, cron trigger | `index.js` + `monitoring/` | ✅ |

**File Structure**:
```
src/workers/
├── index.js              # Entry point (CORS + error handling + T07 metrics)
├── router.js             # Route matching + auth + rate limit + cache headers
├── middleware/
│   ├── cors.js           # CORS headers
│   ├── auth.js           # JWT RS256 + Service Token verification
│   └── rate-limit.js     # Cache API rate limiting (free, no KV budget)
├── handlers/
│   ├── articles.js       # Articles CRUD (D1 + R2) + XSS sanitization
│   ├── analysis.js       # Analysis submission + quality gates + XSS sanitization
│   ├── knowledge.js      # Knowledge base (Vectorize + Workers AI) + XSS sanitization
│   ├── auth.js           # Google OAuth + JWT + PDPA compliance
│   ├── points.js         # Points query (integer cents)
│   └── health.js         # Health check + monitoring (T07 probes/metrics/alerts)
├── monitoring/           # T07 modules (probes, metrics, collector, alerts)
└── migrations/
    ├── 0001_initial.sql  # D1 schema (5 tables)
    └── 0002_metrics.sql  # D1 metrics tables (T07)
```

**Exit Criteria**: All routes return correct response envelope; rate limiting via Cache API; JWT auth with cross-session verification; batch article ingestion; T07 monitoring integrated.
**Status**: ✅ DONE — 16 files (13 T01 + 3 T07 monitoring modules). All routes wired, auth/cache/XSS done.

---

## Phase 4: Integration & Hardening [IN PROGRESS]

**Goal**: Wire up real data flows and harden for production.

| # | Task | Details | Status |
|---|------|---------|--------|
| 1 | Rate limiting → Cache API (frees 100 KV writes/day) | `rate-limit.js` rewritten | ✅ |
| 2 | CDN cache headers per route (5s list, 1h article, no-store mutations, private user) | Route-level `cache` config in `router.js` | ✅ |
| 3 | XSS prevention: `escapeHtml()` on title/summary/author/reasoning/key_phrases/snippet | All 3 GET-facing handlers | ✅ |
| 4 | Service token auth for internal endpoints (T02 crawler, T07 metrics) | Separate from user JWT — done in Phase 3 | ✅ |
| 5 | KV budget reallocation: T01_RATE_LIMIT → T01_SYSTEM (misc config/cache) | `config.js` updated | ✅ |
| 6 | Knowledge query during article ingestion | Auto-embed title → Vectorize topK → store knowledge_ids in D1 | ✅ |
| 7 | Session cleanup + daily reset cron | Expired sessions + daily_analysis_count reset at midnight UTC | ✅ |
| 8 | IDOR fix: analysis uses JWT user_hash | `body.user_hash` → `user.user_hash` from auth middleware | ✅ |
| 9 | Anti-cheat: daily limit + cooldown enforcement | `REWARD.DAILY_ANALYSIS_LIMIT` (50) + `cooldown_until` check | ✅ |
| 10 | Anti-cheat: min analysis time enforcement | `REWARD.MIN_ANALYSIS_TIME_MS` (5000ms) — blocks instant submissions | ✅ |
| 11 | User contribution tracking | `daily_analysis_count++`, `contribution_count++` via D1 batch | ✅ |
| 12 | Points awarding on valid analysis | `total_points_cents += POINTS_PER_VALID_ANALYSIS`, auto-compute `vote_rights` | ✅ |
| 13 | Usage endpoint: workers_requests tracking | New counter in `/monitoring/usage` + uses config values | ✅ |
| 14 | T05 Rewards endpoints (submit/failure/me) | `handlers/rewards.js` — D1-backed, anti-cheat, cooldown | ✅ |
| 15 | T05 integration contract response | API_ROUTES.md v2.1 + KV_SCHEMA.md T05 contract + cross-team response | ✅ |
| 16 | Integration tests with T02 Crawler + T03 Analysis output formats | End-to-end D1+R2 flow | 🔲 Blocked (needs Cloudflare env) |

**Exit Criteria**: Full request cycle works (crawl -> filter -> dedup -> store -> analyze -> validate -> publish -> read -> display); KV writes stay within budget; no internal errors leak to clients.

---

## Dependencies on Other Teams

| Team | What T01 Needs | When |
|------|---------------|------|
| T02 | Confirmed Crawler API output format (article_id, content_hash, filter_score, matched_topic - NOT tokens/minhash) | Phase 2 |
| T03 | Confirmed analysis JSON shape (bias_score, reasoning, key_phrases, prompt_version) + knowledge categories (politician/media/topic/term/event) | Phase 2 |
| T04 | Confirmation that API response format works for PWA/LINE Bot | Phase 3 |
| T05 | Points query requirements (vote flow deferred to Phase 2+) | Phase 3 |
| T06 | Security audit of auth flow + rate limit design | Phase 3 |
| T07 | Monitoring requirements (which metrics to expose) - T07 provides monitoring logic, T01 registers routes | Phase 3 |

---

## What T01 Provides to Other Teams

| Team | What T01 Provides | Available From |
|------|-------------------|----------------|
| ALL | `shared/config.js`, `shared/enums.js`, `shared/utils.js`, validators | Phase 2 |
| ALL | `shared/kv-budget.js` - KV write budget tracking middleware | Phase 2 |
| T02 | `POST /articles` + `POST /articles/batch` endpoints + D1/R2 write contract | Phase 3 |
| T03 | `POST /articles/:hash/analysis` endpoint + Knowledge API (`POST /knowledge/upsert`) | Phase 3 |
| T04 | All `GET` endpoints + unified response format + Knowledge API (`GET /articles/:hash/knowledge`) | Phase 3 |
| T05 | Points API endpoint (`GET /user/me/points`) | Phase 3 |
| T07 | Health/metrics endpoints + `GET /monitoring/usage` + `wrangler.toml` for CI/CD | Phase 3 |

---

## Risks and Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 5GB storage limit (free tier) | Article + analysis data may exceed limit over time | Archive old articles to R2; implement data retention policy; monitor D1 usage via `/monitoring/usage` |
| KV 1000 writes/day limit | Cache invalidation + config updates combined may exceed budget | KV is cache-only now (not primary storage); use `kv-budget.js` middleware; batch cache writes |
| KV eventual consistency | Read-after-write returns stale data from cache | KV is cache layer only; primary reads from D1 (strongly consistent); cache TTL controls staleness window |
| Workers 10ms CPU (free tier) | Complex validation may timeout | Offload heavy compute to GitHub Actions; keep Workers thin |
| JWT RS256 key management | Key rotation complexity | Use Cloudflare Workers Secrets; plan rotation schedule |
| Schema drift across teams | Teams diverge from SSOT | Shared validators enforce schema at API boundary; CI checks |

---

## Estimated Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1 (Design) | DONE | Architecture docs complete |
| Phase 2 (Shared Modules) | 1-2 sessions | All shared libs with tests |
| Phase 3 (Workers API) | 2-3 sessions | Deployed API on staging |
| Phase 4 (Integration) | 1-2 sessions | Production-ready with all teams wired |

---

**Maintainer**: T01 (System Architecture Team)
**Created**: 2026-03-06
**Last Updated**: 2026-03-07
