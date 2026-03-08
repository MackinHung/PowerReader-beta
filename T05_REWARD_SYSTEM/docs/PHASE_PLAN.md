# T05 Reward System - Phase Plan

**Team**: T05 (Reward System Team)
**Scope**: Points calculation, anti-gaming gates (v1.0); vote-right conversion, Fisher-Yates shuffle ranking, audit logging (Phase 2+).

> **v1.0 Scope**: Phase 1 + Phase 2 only. Phase 3-6 deferred per project lead decision (2026-03-06).

---

## Phase 1: Core Points Engine ✅ v1.0

| Deliverable | Status |
|-------------|--------|
| `addPoints()` — Immutable D1 update, integer cents, recalculates vote_rights | ✅ |
| D1 `users` + `reward_dedup` tables (migration 0003) | ✅ |
| Points-to-vote: `vote_rights = floor(total_points_cents / 1000)` (display only) | ✅ |
| API: POST /submit, POST /failure, GET /me | ✅ |
| 48 unit tests (3 test files) | ✅ |

**Dependencies**: T01 D1 provisioning, T03 quality_gate_result format

**Source files**:
- `src/index.js` — Barrel re-export
- `src/calculation.js` — Pure point arithmetic, record factory, display helpers
- `src/cooldown.js` — Anti-cheat cooldown & failure management
- `src/repository.js` — D1 data access layer
- `src/reward-flow.js` — Business flow orchestration
- `src/api.js` — HTTP API handler
- `tests/` — 48 tests across 3 files + helpers

---

## Phase 2: Anti-Gaming Pre-Checks ✅ v1.0

| Deliverable | Status |
|-------------|--------|
| Pre-Check A: Daily limit (50/day, Asia/Taipei reset) → 429 | ✅ |
| Pre-Check B: Time bounds (5s min, 1h max) → 400 | ✅ |
| Pre-Check C: article_id dedup → 409 | ✅ |
| Pre-Check D: content_hash dedup (T06 fix) → 409 | ✅ |
| Cooldown: 3 failures → 1h cooldown_until | ✅ |
| SHA-256 validation at API layer | ✅ |
| D1 batch() atomic persistence | ✅ |

**Key decisions (2026-03-07)**:
- Cooldown consolidated to `cooldown_until` in D1 users table
- Gate naming unified to Pre-Check A/B/C/D
- KV→D1 migration per T06 KV budget audit
- `article_hash` → `article_id` for SSOT consistency

---

## Phase 3-6: Phase 2+ (⏸️ Deferred)

| Phase | Goal | Key Deliverable | Dependencies |
|-------|------|----------------|-------------|
| 3 | Fisher-Yates Shuffle | SeededRNG + seed commitment | T01 KV + SHUFFLE_SALT |
| 4 | Voting Lifecycle | Vote submission + weekly tally | T01 API routes, Phase 3 |
| 5 | Audit & Verification | Triple backup (KV+R2+GitHub) | T07 CI/CD, Phase 4 |
| 6 | Leaderboard & APIs | Top 100, user status, results | T04 ready, Phase 1 |

> Details: `FISHER_YATES_SPEC.md` (Phase 3). Phase 5 audit log spec will be recreated at Phase 2+.

---

## Cross-Team Deliverables

| Consumer | What T05 Provides | v1.0? |
|----------|------------------|-------|
| T03 | Points callback after quality gate pass | ✅ |
| T04 | APIs: user points, cooldown status | ✅ |
| T04 | APIs: vote rights, leaderboard, results | ⏸️ |
| T01 | D1 schema: users + reward_dedup (migration 0003) | ✅ |

---

## Risks

| Risk | Status |
|------|--------|
| Workers CPU limit (Fisher-Yates >5000) | Phase 2+ |
| Seed chain integrity | Phase 2+ |
| T03 format breaking changes | v1.0 — pin schema |
| Sybil attacks | v1.0 — Google OAuth + T06 |

## Security Audits ✅

All 5 audits completed: content-hash bypass, constants review, KV budget, code review (3 agents), server clock leak.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-03-07 | Initial Phase 1+2 |
| v2.0 | 2026-03-07 | KV→D1 migration |
| v3.0 | 2026-03-08 | Module restructuring + docs consolidation |
