# T06 Ownership Gap: Sybil/OAuth Gate (Gate 4)

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | M01 |
| **Priority** | 🟡 HIGH |
| **Created** | 2026-03-07 11:01 |
| **Deadline** | Phase 3 (before user auth goes live) |
| **Related Files** | shared/cross_team_comms/20260306_1802_M01_to_T03_T05_gate_naming_conflict.md |

## Finding

### Background

In the `gate_naming_conflict` cross-team communication (2026-03-06 18:02), the Pre-Check / Quality Layer naming was unified. The document states:

> Gate 4: Sybil/OAuth（= **T06 職責**，非 T05 職責）

This assigns Sybil/OAuth protection responsibility to T06. However:

1. **No T06 document defines Sybil/OAuth protection** — CRAWLER_COMPLIANCE.md, PRIVACY_POLICY.md, ERROR_HANDLING.md all lack this topic
2. **No design exists** for how to detect Sybil attacks (multiple fake accounts submitting analyses)
3. **No plan exists** for OAuth abuse prevention

### Scope Definition Request

T06 needs M01 to clarify the scope of "Gate 4: Sybil/OAuth":

**Questions:**
1. Is this a v1.0 requirement or can it be deferred to Phase 2+?
2. What level of Sybil protection is expected?
   - Basic: Single Google OAuth per user, no duplicate detection (simplest)
   - Medium: Device fingerprinting + behavioral analysis (requires T04 integration)
   - Advanced: Rate-limited analysis + ML anomaly detection (requires T03 + T07 integration)
3. Should T06 create a new SSOT document (`T06_COMPLIANCE/SYBIL_PROTECTION.md`)?

### T06 Preliminary Proposal (if v1.0 scope)

**Basic Sybil Protection via existing mechanisms:**
- Google OAuth = 1 real Google account per user (Google's own anti-Sybil)
- `UNIQUE(article_id, user_hash)` in D1 prevents duplicate analyses from same user
- T05's `DAILY_ANALYSIS_LIMIT: 50` limits per-account abuse
- T05's `MIN_ANALYSIS_TIME_MS: 5000` prevents automated submission
- T05's `CONSECUTIVE_FAILURE_THRESHOLD: 3` + cooldown blocks repeated low-quality attempts

These existing mechanisms may be sufficient for v1.0 without additional T06 design work.

### Action Required

M01: Please clarify scope and priority for Sybil/OAuth protection.

---

## Response

**M01 Response** (2026-03-07):

**Decision: v1.0 existing mechanisms are SUFFICIENT. No additional Sybil protection needed.**

Answers to T06's three questions:

1. **v1.0 or Phase 2+?** — v1.0 uses T06's proposed "Basic" level. Advanced Sybil detection deferred to Phase 2+.
2. **Protection level?** — Basic. Existing 5-layer defense is sufficient:
   - Google OAuth = 1 real account per person (Google's own anti-Sybil)
   - D1 `UNIQUE(article_id, user_hash)` = same user cannot duplicate-analyze same article
   - `DAILY_ANALYSIS_LIMIT: 50` = per-account daily cap
   - `MIN_ANALYSIS_TIME_MS: 5000` = blocks automated scripts
   - `CONSECUTIVE_FAILURE_THRESHOLD: 3` + cooldown = blocks repeated low-quality attempts
3. **New SSOT document needed?** — No for v1.0. T06 does NOT need to create a new `SYBIL_PROTECTION.md`. A brief "Anti-Sybil: Existing Mechanisms" note in `T06/ERROR_HANDLING.md` is sufficient. If ML anomaly detection is needed in Phase 2+, a standalone document can be created then.

**Sybil/OAuth Gate formally deferred to Phase 2+.** If abuse patterns emerge post-launch, T07 monitoring will detect anomalies via the metrics pipeline.

No further action required. T06 correctly identified the coverage of existing mechanisms.

---

## Completion

- [x] M01 has clarified scope: v1.0 Basic level, existing mechanisms sufficient
- [x] T06 does NOT need to create SYBIL_PROTECTION.md for v1.0
- [x] Sybil/OAuth Gate formally deferred to Phase 2+
- [x] Status changed to COMPLETED
