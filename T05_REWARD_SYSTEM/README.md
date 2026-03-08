# T05_REWARD_SYSTEM — PowerReader Points & Voting

## Overview

Handles the points lifecycle for contributor rewards:
- Earn: 0.1 pt (10 cents) per valid analysis
- Accumulate: Integer cents avoid floating-point errors
- Convert: 1000 cents (10 pts) = 1 vote right (Phase 2+)

## Module Map

| Module | File | Responsibility | Side Effects |
|--------|------|---------------|-------------|
| Calculation | `src/calculation.js` | Constants, record factory, arithmetic, display helpers | None (pure functions) |
| Cooldown | `src/cooldown.js` | Anti-cheat state management (failure tracking, cooldown) | None (pure functions) |
| Repository | `src/repository.js` | D1 database access layer (SQL queries) | D1 reads/writes |
| Reward Flow | `src/reward-flow.js` | Business logic orchestration (reward + failure flows) | Uses calculation + cooldown + repo |
| API | `src/api.js` | HTTP request/response handling | Route parsing, validation, serialization |
| Index | `src/index.js` | Barrel re-export (preserves existing imports) | None |

## Test Files

| Test File | Module Under Test | Test Count |
|-----------|------------------|------------|
| `tests/calculation.test.js` | calculation.js | 23 |
| `tests/cooldown.test.js` | cooldown.js | 9 |
| `tests/reward-flow.test.js` | reward-flow.js | 16 |
| `tests/helpers.js` | Shared fixtures & test doubles | — |
| **Total** | | **48** |

## Dependency Graph

```
calculation.js  ←──  cooldown.js (no deps from calculation)
      ↕                    ↕
      └── reward-flow.js ──┘
               ↑
       repository.js (no source deps, only D1 binding)
               ↑
            api.js → index.js (barrel)
```

## Anti-Cheat Mechanisms

| Check | Description |
|-------|-------------|
| Daily limit | Max 50 analyses per user per day |
| Min time | Minimum 5s analysis time (matches Qwen inference ~6s) |
| Max time | Maximum 1h analysis time |
| Cooldown | 60 min cooldown after 3 consecutive failures |
| Article dedup | One analysis per user per article URL |
| Content dedup | One analysis per user per content hash (prevents mirror-source exploit) |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | **D1** (not KV) | KV write budget exhausted, D1 provides strong consistency + atomic transactions |
| Points Unit | **Integer cents** | Avoids floating-point errors: 10 cents = 0.1 pt |
| Pattern | **Immutable** | All functions return new objects, never mutate |
| SQL | **Repository Pattern** | Business logic contains no SQL, easy to test and swap |
| Anti-cheat | **Pre-Check A~D** | Runs before T03 quality validation, saves downstream D1 reads |

## Cross-Team Integration

| Team | Direction | Interface | v1.0? |
|------|-----------|-----------|-------|
| T03 → T05 | T03 calls T05 after quality gate pass | `processAnalysisReward(repo, ...)` | Yes |
| T05 → T04 | T04 frontend displays points/cooldown | `GET /api/v1/rewards/me` | Yes |
| T05 → T01 | T01 mounts T05 routes | `handleT05Request(req, env, subPath)` | Yes |
| T05 → D1 | D1 users + reward_dedup | Migration 0003 | Yes |

## Design Documentation

- `docs/REWARD_MECHANISM.md` — SSOT design specification
- `docs/FISHER_YATES_SPEC.md` — Phase 2+ shuffle specification
- ~~`docs/VOTE_AUDIT_LOG.md`~~ — Deleted (v3.1): outdated KV patterns, will regenerate at Phase 2+
- `docs/PHASE_PLAN.md` — Phase plan and timeline

## Development

```bash
# Run tests
cd T05_REWARD_SYSTEM && npx vitest run

# Watch mode
cd T05_REWARD_SYSTEM && npx vitest

# Local dev (standalone Worker)
cd T05_REWARD_SYSTEM && npx wrangler dev
```

---

**Maintainer**: T05 | **Version**: v3.0 | **Last Updated**: 2026-03-08
