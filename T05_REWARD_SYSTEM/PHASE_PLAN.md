# T05 Reward System - Phase Plan

**Team**: T05 (Reward System Team)
**Scope**: Points calculation, anti-gaming gates (v1.0); vote-right conversion, Fisher-Yates shuffle ranking, audit logging (Phase 2+).

> **v1.0 Scope**: Phase 1 + Phase 2 only. Phase 3-6 deferred to Phase 2+ per project lead decision (2026-03-06).
> See: MASTER_ROADMAP.md 決策紀錄 (投票系統延後至 Phase 2+, M01→ALL, 2026-03-06, 已完成歸檔)

---

## Phase 1: Core Points Engine ✅ v1.0

**Goal**: Implement the points lifecycle -- earn, accumulate, track vote rights (display only).

| Deliverable | Details | Status |
|-------------|---------|--------|
| `addPoints()` | Immutable D1 update, integer cents (10 cents = 0.1 pt), recalculates `vote_rights` | ✅ Implemented |
| D1 `users` table | Full schema per REWARD_MECHANISM.md (total_points_cents, contribution_count, vote_rights, votes_used, cooldown fields) | ✅ Implemented |
| D1 `reward_dedup` table | PK(user_hash, article_id), UNIQUE(user_hash, content_hash) for dedup | ✅ Implemented |
| Points-to-vote conversion | `vote_rights = floor(total_points_cents / 1000)` (1000 cents = 10 pts = 1 vote) -- display only in v1.0 | ✅ Implemented |
| API: POST /submit | Process valid analysis, award points | ✅ Implemented |
| API: POST /failure | Record failed submission, trigger cooldown | ✅ Implemented |
| API: GET /me | User points summary | ✅ Implemented |
| Unit tests | 48 tests: determinism, overflow, edge cases, dedup, cooldown, time bounds | ✅ 48/48 pass |

**Dependencies**:
- T01: D1 `powerreader-db` must be provisioned, `users` + `reward_dedup` tables via migrations
- T03: Quality gate result JSON format (`quality_gate_result: "passed"`)

**Source files**:
- `T05_REWARD_SYSTEM/src/points.js` — Core points engine + D1 repository
- `T05_REWARD_SYSTEM/src/api.js` — API handler
- `T05_REWARD_SYSTEM/tests/points.test.js` — Unit tests (48 tests)
- `src/workers/migrations/0003_t05_reward.sql` — D1 migration

---

## Phase 2: Anti-Gaming Pre-Checks (T05 side) ✅ v1.0

**Goal**: Implement Pre-Check A~D within the reward worker (先於 T03 Quality Layer 執行，節省下游 D1 讀取).

| Deliverable | Details | Status |
|-------------|---------|--------|
| Pre-Check A - Daily limit | Check/reset `daily_analysis_count` per user (Asia/Taipei timezone), reject with HTTP 429 | ✅ Implemented |
| Pre-Check B - Time bounds | Validate `time_spent_ms >= 5000` (min) and `<= 3600000` (max), reject if out of bounds | ✅ Implemented |
| Pre-Check C - Article dedup | Same user + same `article_id` = reject HTTP 409, with console.warn logging | ✅ Implemented |
| Pre-Check D - Content dedup | Same user + same `content_hash` = reject HTTP 409, with console.warn logging (T06 security fix) | ✅ Implemented |
| Cooldown logic | 3 consecutive failures -> 1h cooldown via `cooldown_until` in D1 `users` table | ✅ Implemented |
| SHA-256 validation | All hash fields validated with `/^[a-f0-9]{64}$/i` regex at API layer | ✅ Implemented |
| Atomic persistence | D1 `db.batch()` for UPDATE users + INSERT reward_dedup (transaction) | ✅ Implemented |

**Dependencies**:
- T04: Must send `article_opened_at` timestamp in submission payload
- T03: Quality Layer 3 (consistency) owned by T03; Sybil/OAuth owned by T06 — not T05

**Note (2026-03-07)**: Cooldown consolidated to `cooldown_until` field in D1 `users` table per M01 cross-team request. Separate KV key approach removed.
**Note (2026-03-07)**: Gate naming unified to "Pre-Check A/B/C/D" per M01 cross-team request. See `20260306_1802_M01_to_T03_T05_gate_naming_conflict.md`.
**Note (2026-03-07)**: Migrated from KV (USER_POINTS namespace) to D1 per T06 KV budget audit + KV_SCHEMA.md v2.0. D1 resolves: atomic writes, write budget, strong consistency.
**Note (2026-03-07)**: `article_hash` renamed to `article_id` for SSOT consistency with CLAUDE.md Crawler API format.

---

## ⏸️ Phase 3: Fisher-Yates Shuffle & Seed Commitment — Phase 2+ 延後

**Goal**: Implement deterministic, verifiable shuffle for tie-breaking in vote rankings.

| Deliverable | Details |
|-------------|---------|
| `SeededRNG` class | Counter-based SHA-256 PRNG via `crypto.subtle`, rejection sampling for `nextInt()` |
| `fisherYatesShuffle()` | Immutable, returns new array, handles edge cases (empty, single, null) |
| Seed generation | `SHA-256(previous_vote_id + ":" + timestamp + ":" + SHUFFLE_SALT)`, genesis case handled |
| Seed commitment flow | Write `seed_hash` to `VOTE_RESULTS` KV before voting opens |
| Test vectors | Determinism test, distribution uniformity test (100k runs), all-elements-preserved test |

**Dependencies**:
- T01: `VOTE_RESULTS` KV namespace must be provisioned
- T01: `SHUFFLE_SALT` environment variable in Workers config

---

## ⏸️ Phase 4: Voting Lifecycle & Tallying — Phase 2+ 延後

**Goal**: End-to-end weekly voting cycle -- open, collect, tally, rank, publish.

| Deliverable | Details |
|-------------|---------|
| Vote submission API | Validate vote_rights > votes_used, enforce 1 vote/user/period |
| Tally worker | Scheduled trigger (Sunday 23:59+08:00), count votes per article, apply Fisher-Yates to tied articles |
| Ranked results | Write `vote:{vote_id}` to `VOTE_RESULTS` KV |
| Zero-vote handling | Empty period produces empty ranking, seed chain continues |

**Dependencies**:
- T01: API route definitions (`/api/v1/votes/*`)
- T04: Frontend voting UI must call vote submission API

---

## ⏸️ Phase 5: Audit Log & Public Verification — Phase 2+ 延後

**Goal**: Full audit trail -- KV + R2 + GitHub triple backup, public verification endpoint.

| Deliverable | Details |
|-------------|---------|
| Audit record JSON | Per VOTE_AUDIT_LOG.md schema (vote_id, seed, ranked_articles, etc.) |
| Triple storage | KV (permanent), R2 (`audit/YYYY/MM/`), GitHub auto-commit |
| Verification endpoint | `GET /api/v1/votes/:vote_id/verify` -- no auth required, re-runs shuffle and compares |
| Individual vote TTL | `vote:{id}:individual:{user_hash}` with 365-day TTL |
| Privacy compliance | Only `user_hash`, no IP/email/device |

**Dependencies**:
- T07: GitHub Actions workflow for auto-commit of audit files
- T01: R2 bucket provisioned
- T06: Privacy review of audit record fields

---

## ⏸️ Phase 6: Leaderboard & Frontend Integration — Phase 2+ 延後

**Goal**: Provide APIs for T04 to display points, vote rights, leaderboard, and vote results.

| Deliverable | Details |
|-------------|---------|
| Leaderboard API | Top 100 by `total_points_cents`, hourly cache, anonymized (`user_hash[:8]`) |
| User status API | My points, my vote rights remaining, cooldown status |
| Vote results API | Current/past period results with verification link |
| API contracts doc | OpenAPI spec for all T05 endpoints |

**Dependencies**:
- T04: Consumes leaderboard/status/results APIs for UI rendering

---

## What T05 Provides to Other Teams

| Consumer | What We Provide | v1.0? |
|----------|----------------|-------|
| T03 | Points callback: T03 calls T05 after quality gate pass | ✅ |
| T04 | APIs: user points, cooldown status | ✅ |
| T04 | APIs: vote rights, leaderboard, vote results | ⏸️ Phase 2+ |
| T01 | D1 schema: `users` table extensions + `reward_dedup` table (migration 0003) | ✅ |
| T01 | D1 schema: vote-related tables | ⏸️ Phase 2+ |
| T07 | Audit JSON files for GitHub auto-commit pipeline | ⏸️ Phase 2+ |
| T06 | Audit records for compliance review | ⏸️ Phase 2+ |

---

## Risks and Blockers

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| ~~KV write limit (1000/day free)~~ | ~~50 users x 50 analyses = 2500 writes exceeds free tier~~ | ~~Batch writes, upgrade to paid KV, or use D1~~ | ✅ Resolved — migrated to D1 |
| ~~KV eventual consistency~~ | ~~Concurrent addPoints may lose updates~~ | ~~Accept for v1 (low frequency); plan Durable Objects for Phase 2+~~ | ✅ Resolved — D1 provides strong consistency |
| ~~Atomic writes~~ | ~~Two separate KV writes could fail partially~~ | ~~Implement transaction pattern~~ | ✅ Resolved — D1 `db.batch()` is transactional |
| Workers CPU limit (10ms free) | Fisher-Yates with >5000 articles may timeout | Cap candidates per period; upgrade to paid (50ms) | Phase 2+ |
| Seed chain integrity | Single broken link invalidates all future seeds | Automated chain verification in audit step | Phase 2+ |
| T03 format changes | Breaking change to quality_gate_result JSON breaks points flow | Pin schema version, use cross-team comms for changes | v1.0 |
| Sybil attacks | Multiple fake accounts bypass per-user limits | Google OAuth + T06 Sybil gate (scope TBD per T06→M01 comm) | v1.0 (basic) |

---

## Security Audit Status

| Audit | Team | Status |
|-------|------|--------|
| Content-hash dedup bypass | T06 | ✅ COMPLETED — Pre-Check D + SHA-256 validation |
| Anti-gaming constants review | T06 | ✅ COMPLETED — All 6 constants approved |
| KV budget exhaustion | T06 | ✅ COMPLETED — Migrated to D1 |
| Code review (3 agents) | Internal QA | ✅ COMPLETED — All P0/P1 fixes applied |
| Server clock leak | T06 minor | ✅ COMPLETED — `cooldown_until` ISO removed from responses, uses `remaining_seconds` |

---

## Summary Timeline

| Phase | Depends On | Est. Effort | Status |
|-------|-----------|-------------|--------|
| Phase 1: Points Engine | T01 D1, T03 format | 1-2 days | ✅ Code complete |
| Phase 2: Anti-Gaming | T04 timestamp field | 1 day | ✅ Code complete |
| Phase 3: Fisher-Yates | T01 KV + env var | 1-2 days | ⏸️ Phase 2+ |
| Phase 4: Voting Lifecycle | T01 API routes, Phase 3 | 2 days | ⏸️ Phase 2+ |
| Phase 5: Audit & Verification | T07 CI/CD, Phase 4 | 1-2 days | ⏸️ Phase 2+ |
| Phase 6: Leaderboard & APIs | T04 ready, Phase 1 | 1 day | ⏸️ Phase 2+ |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-03-07 | Initial Phase 1+2 implementation |
| v1.1 | 2026-03-07 | QA fixes: SHA-256 validation, dedup logging, time upper bound, constants |
| v2.0 | 2026-03-07 | KV→D1 migration: repository pattern, atomic transactions, article_id rename |
| v2.1 | 2026-03-07 | Server clock leak fix: cooldown_until ISO removed from API responses |
