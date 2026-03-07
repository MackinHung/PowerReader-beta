# Security & Compliance Audit Report

## Navigation
- **Upstream**: CLAUDE.md, MASTER_ROADMAP.md
- **Downstream**: All team documents (T01-T07)
- **Maintainer**: T06 (Compliance & Security Team)
- **Type**: Audit Report (point-in-time)
- **Date**: 2026-03-07

---

## Executive Summary

Audited 13 team documents across T01-T07. The project has strong foundational compliance with well-defined security policies. However, **4 CRITICAL and 6 HIGH issues** require attention before production deployment.

**Overall Status**: CONDITIONAL APPROVAL — Critical issues must be resolved before production.

---

## Findings Summary

| Severity | Count | Teams Affected |
|----------|-------|----------------|
| CRITICAL | 5 | T01, T02, T03, T04, T05 |
| HIGH | 7 | T01, T04, T05, T06, T07 |
| MEDIUM | 6 | T01, T04, T07 |
| LOW | 4 | T03, T04, T07 |

---

## CRITICAL Findings

### C-01: QUALITY_GATES.md D1 Migration Code Mismatch
- **Team**: T03
- **Issue**: Code examples reference KV but documentation claims D1 migration
- **Risk**: Consistency validation bypass; historical data loss
- **Cross-team comm**: `20260307_1000_T06_to_T03_quality_gates_d1_mismatch.md`

### C-02: LINE Bot Webhook Signature Not Enforced
- **Team**: T04
- **Issue**: X-Line-Signature validation mentioned in Common Mistakes but not mandatory in main spec
- **Risk**: Account hijacking; message injection
- **Cross-team comm**: `20260307_1001_T06_to_T04_linebot_webhook_security.md`

### C-03: LINE User ID Raw Storage Risk
- **Team**: T04
- **Issue**: Hashing flow unclear; raw ID could appear in error logs
- **Risk**: PRIVACY_POLICY.md violation (明文儲存個人識別資訊)
- **Cross-team comm**: `20260307_1001_T06_to_T04_linebot_webhook_security.md`

### C-04: Point Multiplication via Duplicate Detection Bypass
- **Team**: T05
- **Issue**: Layer 4 only checks article_id, not content_hash across sources
- **Risk**: Fraudulent point accumulation
- **Cross-team comm**: `20260307_1002_T06_to_T05_duplicate_detection_bypass.md`

---

## HIGH Findings

### H-01: API_ROUTES.md Missing Auth for Health Endpoints
- **Team**: T01
- **Issue**: `/api/v1/health` endpoints marked "不需要 Auth" without rate limit differentiation
- **Risk**: Reconnaissance abuse

### H-02: API_ROUTES.md Missing request_id in 429 Responses
- **Team**: T01
- **Issue**: 429 response format doesn't enforce `request_id` and `retry_after`
- **Risk**: Incomplete error tracking

### H-03: KV_SCHEMA.md Key Pattern Information Disclosure
- **Team**: T01
- **Issue**: Keys like `ratelimit:{source}:{date}` expose activity patterns
- **Risk**: Enumeration of crawler activity

### H-04: LINE User ID Logging Risk
- **Team**: T04
- **Issue**: Raw ID may appear in error logs before hashing
- **Risk**: Privacy violation

### H-05: Vote Audit Seed Vulnerability
- **Team**: T05
- **Issue**: Seed construction uses predictable patterns, vulnerable to pre-image attacks
- **Risk**: Vote result manipulation (Phase 2+ but design should be fixed now)

### H-06: CI/CD Secrets Rotation Policy Missing
- **Team**: T07
- **Issue**: No documented rotation schedule or leak detection for CF_API_TOKEN
- **Risk**: Long-lived token exposure
- **Cross-team comm**: `20260307_1003_T06_to_T07_secrets_rotation_policy.md`

---

## MEDIUM Findings

### M-01: Cloudflare Free Tier Quota Alert Automation Missing (T01)
### M-02: R2 Archival/Retention Policy Undefined (T01)
### M-03: QUALITY_GATES.md 72h Stale Check Timezone Issue (T03)
### M-04: PWA IndexedDB Encryption Not Specified (T04)
### M-05: PWA Service Worker Version Forcing Missing (T04)
### M-06: Monitoring Metrics Endpoint Rate Limiting (T07)

---

## LOW Findings

### L-01: MODEL_ACCURACY_REPORT.md Error Filtering (T03)
### L-02: UI_LOCALIZATION.md i18n Migration Strategy (T04)
### L-03: PERFORMANCE_BENCHMARKS.md Test Data Isolation (T07)
### L-04: QUALITY_GATES.md Timezone Normalization (T03)

---

## Post-Audit Findings (Round 2, 2026-03-07 11:00)

### C-05: Author Anonymization SSOT Conflict — ✅ RESOLVED
- **Teams**: T01, T02
- **Issue**: KV_SCHEMA.md stores `author TEXT` (plain name) while CRAWLER_COMPLIANCE.md requires `author_hash` (SHA-256)
- **Resolution**: **Option B adopted** (keep plain text). Project owner confirmed journalist bylines are public information. CRAWLER_COMPLIANCE.md v1.4 updated, PRIVACY_POLICY.md aligned.
- **Cross-team comm**: `20260307_1100_T06_to_T01_T02_author_anonymization_conflict.md` (COMPLETED)

### H-07: Sybil/OAuth Gate Ownership Gap (NEW)
- **Team**: T06 (self-identified)
- **Issue**: Gate 4 (Sybil/OAuth) assigned to T06 but no design document exists
- **Risk**: No Sybil protection documented for v1.0
- **Cross-team comm**: `20260307_1101_T06_to_M01_sybil_gate_ownership.md`
- **Recommendation**: Existing mechanisms (OAuth + daily limit + min time + cooldown) may suffice for v1.0

### Anti-Gaming Constants Review: APPROVED (NEW)
- **Team**: T05
- **Result**: All 6 constants approved with minor notes
- **Cross-team comm**: `20260307_1102_T06_to_T05_anti_gaming_review.md`

---

## Cross-Team Communications Issued

| File | Target | Priority | Issue |
|------|--------|----------|-------|
| `20260307_1000_T06_to_T03_*.md` | T03 | CRITICAL | D1 code mismatch |
| `20260307_1001_T06_to_T04_*.md` | T04 | CRITICAL | Webhook + privacy |
| `20260307_1002_T06_to_T05_*.md` | T05 | CRITICAL | Duplicate bypass |
| `20260307_1003_T06_to_T07_*.md` | T07 | HIGH | Secrets policy |
| `20260307_1100_T06_to_T01_T02_*.md` | T01, T02 | CRITICAL | Author anonymization SSOT conflict |
| `20260307_1101_T06_to_M01_*.md` | M01 | HIGH | Sybil gate ownership gap |
| `20260307_1102_T06_to_T05_*.md` | T05 | LOW | Anti-gaming constants approved |

**Updated totals**: 5 CRITICAL / 7 HIGH / 6 MEDIUM / 4 LOW

---

## Post-Audit Verification (Round 3, 2026-03-07 — Fix Validation)

### C-01 Verification: QUALITY_GATES.md D1 Migration — ✅ APPROVED (file-level)
- **QUALITY_GATES.md itself**: 100% compliant. Zero KV references. All 8 SQL queries parameterized. Integer cents correct.
- **New finding**: INFERENCE_PIPELINE.md still has 4 KV operations — v1.2 claim incomplete across T03
- **Error messages**: Generic user-facing messages confirmed via `getQualityGateUserMessage()`. `reason` field exposure TBD.
- **Verdict**: QUALITY_GATES.md safe to deploy; INFERENCE_PIPELINE.md migration pending

### C-04 Verification: Duplicate Detection Bypass Fix — ✅ CONDITIONAL APPROVAL
- Pre-Check D (content_hash dedup): Properly documented and coded
- Execution order A→B→C→D→Q1-4: Correct
- Naming unified (Pre-Check, no old Gate refs): Clean
- **3 pre-production fixes required**:
  1. CRITICAL: contentHash format validation (null bypass risk)
  2. HIGH: Security logging for dedup rejections
  3. HIGH: Atomic KV writes for recordAnalysis()
- **Verdict**: Approved for staging; 3 fixes required before production

### Resolution Tracker

| Finding | Original | Current Status |
|---------|----------|---------------|
| C-01 D1 mismatch | CRITICAL | ✅ COMPLETED (QUALITY_GATES.md v1.2 + INFERENCE_PIPELINE.md v1.1 — zero KV refs) |
| C-02 Webhook sig | CRITICAL | ✅ COMPLETED (T04 fixed) |
| C-03 LINE User ID | CRITICAL | ✅ COMPLETED (T04 fixed) |
| C-04 Duplicate bypass | CRITICAL | ⚠️ CONDITIONAL (3 pre-fixes) |
| C-05 Author SSOT | CRITICAL | ✅ RESOLVED (Option B) |
| H-06 Secrets rotation | HIGH | ✅ COMPLETED (T07 fixed) |

**Resolved**: 4/5 CRITICAL, 1/7 HIGH
**Conditional**: 1/5 CRITICAL (C-04 needs 3 pre-fixes)
**Pending response**: 2 M01 comms (audit summary + Sybil gate)

---

## Phase 1 Compliance QA (Round 4, 2026-03-07 12:00)

Full report: `T06_COMPLIANCE/PHASE1_COMPLIANCE_QA_20260307.md`

**Scope**: 13 documents across T01-T05 audited against T06's 3 SSOT documents.

| Team | Score | Verdict |
|------|-------|---------|
| T01 | 100% | ✅ Production-ready |
| T04 | 94% | ✅ Pass (2 recommendations) |
| T05 | 94% | ✅ Pass (1 recommendation) |
| T02 | 82% | ⚠️ Conditional (4 missing statements) |
| T03 | 82% | 🔴 Conditional (`reason` field + INFERENCE_PIPELINE.md) |

**New cross-team comm**: `20260307_1200_T06_to_T02_crawler_spec_compliance_gaps.md` (HIGH)

**Updated totals**: 5 CRITICAL / 8 HIGH / 6 MEDIUM / 4 LOW

---

## Post-Audit Findings (Round 5, 2026-03-07 — Integration & Monitoring Review)

### T07 Monitoring Modules Compliance Review: ✅ APPROVED
- **Scope**: MONITORING_DASHBOARD.md v1.1 + T07→T01 integration comm (0002_metrics.sql, probes/metrics/collector/alerts modules)
- **D1 Tables**: `metrics_hourly`, `metrics_raw`, `daily_counters`, `alerts` — all system-level metrics, **zero PII**
- **`metrics_raw`**: Per-request performance samples (latencies, cache hits, resource usage), cleaned after 2h — acceptable
- **KV Usage**: Metrics stored in D1 (not KV) — compliant with KV write budget
- **Health endpoints**: `/health` (no auth) + `/health/ready` (service token) + `/metrics` (service token) — properly tiered
- **Alert suppression**: 1h window prevents storms — matches ERROR_HANDLING.md patterns
- **Recommendation (LOW)**: Verify `metrics_raw` schema does NOT include `user_hash`, IP address, or User-Agent per request. If per-request user identification is needed for debugging, use truncated hash only.

### H-08: T05 KV Write Budget Exhaustion Risk (NEW — CRITICAL reclassified)
- **Team**: T05
- **Source**: T05→T01/T03 integration contract alignment (2026-03-07 16:00)
- **Issue**: T05 uses KV (USER_POINTS namespace) with 3 key patterns per analysis:
  - `user:{user_hash}` — points update (1 write)
  - `article:{user_hash}:{article_hash}` — article dedup marker (1 write)
  - `analysis:{user_hash}:{content_hash}` — content dedup marker (1 write)
- **Budget calculation**: 45 active users/day × ~10 analyses × 3 writes = **~1,350 KV writes/day**
  - T05 allocation: 150 writes/day
  - Free tier limit: 1,000 writes/day total
  - **T05 alone exceeds the ENTIRE free tier by 35%**
- **Architecture violation**: KV_SCHEMA.md v2.0 designates KV as "config/cache only." User points and dedup markers are structured data — should be in D1.
- **Risk**: System outage once KV write limit is hit; all subsequent analyses silently fail
- **Recommendation**: T05 must migrate user points (`users` table) and dedup markers (`analyses` table `UNIQUE` constraints) to D1, matching T03's completed D1 migration
- **Cross-team comm**: Added to existing `20260307_1002_T06_to_T05_duplicate_detection_bypass.md`

### T05 Integration Contract Review (T06 Notes)
- **`article_hash` vs `article_id`**: CLAUDE.md Crawler API uses `article_id`. T05 using `article_hash` violates SSOT naming (CLAUDE.md Error #10). Recommend T05 rename to `article_id` for consistency.
- **T05 routes not in API_ROUTES.md**: 3 endpoints (`/rewards/submit`, `/rewards/failure`, `/rewards/me`) not registered in SSOT. T01 action required.
- **`time_spent_ms` data flow**: If this value originates from client-side (T04), it can be spoofed. T05's `MIN_ANALYSIS_TIME_MS: 5000` check relies on this value being accurate. Recommend server-side timing (T03 records timestamp at analysis start/end) rather than trusting client-reported duration.

### T03 KNOWLEDGE_BASE_SCHEMA.md Compliance Review: ⚠️ CONDITIONAL (82/100)
- **New SSOT document**: v1.0, 5 knowledge categories, 31 seed entries, Vectorize config
- **Privacy**: ✅ Zero PII — all entries are public political figures/media/topics
- **Embedding model**: ✅ `@cf/baai/bge-m3` (1024d) matches CLAUDE.md, bge-m3/bge-small-zh separation enforced
- **Bias handling**: ✅ Scores documented as "reference, NOT mandate"; no hardcoded bias in entry text
- **Quota**: ✅ Vectorize 61% usage (18.4M/30M dimensions), accurate calculation
- **Error handling**: 🔴 BLOCKING — `getKnowledgeContext()` lacks try-catch for Vectorize/Workers AI failures (ERROR_HANDLING.md requires specific recovery patterns)
- **Input validation**: 🟡 MEDIUM — `articleTitle` not validated before embedding (length/empty check)
- **H-09**: Missing error handling in knowledge retrieval (HIGH — must resolve in implementation)
- **H-10**: Missing Workers AI retry logic for neuron quota exhaustion (HIGH — must resolve in implementation)

### Resolution Tracker (Updated)

| Finding | Original | Current Status |
|---------|----------|---------------|
| C-01 D1 mismatch | CRITICAL | ✅ COMPLETED (QUALITY_GATES.md v1.2 + INFERENCE_PIPELINE.md v1.1 — zero KV refs) |
| C-02 Webhook sig | CRITICAL | ✅ COMPLETED (T04 fixed) |
| C-03 LINE User ID | CRITICAL | ✅ COMPLETED (T04 fixed) |
| C-04 Duplicate bypass | CRITICAL | ✅ COMPLETED (all 3 fixes done, KV→D1 migration, 48/48 tests pass) |
| C-05 Author SSOT | CRITICAL | ✅ RESOLVED (Option B) |
| H-06 Secrets rotation | HIGH | ✅ COMPLETED (T07 fixed) |
| H-08 KV budget | CRITICAL | ✅ RESOLVED (T05 migrated to D1, `reward_dedup` table, `db.batch()` atomic) |
| H-09 Knowledge error handling | HIGH | ✅ COMPLETED (try-catch + graceful degradation in KNOWLEDGE_BASE_SCHEMA.md v1.2) |
| H-10 Workers AI retry | HIGH | ✅ COMPLETED (exponential backoff + input validation in KNOWLEDGE_BASE_SCHEMA.md v1.2) |

**Resolved**: 6/6 CRITICAL ✅ + 4/10 HIGH
**Remaining CRITICAL**: 0
**Remaining HIGH**: 6 (H-01~H-05, H-07 — documented, non-blocking for v1.0)
**M01 responses**: ✅ COMPLETED (audit summary acknowledged + Sybil Gate deferred to Phase 2+)
**T02 compliance statements**: ✅ COMPLETED (4/4 added to CRAWLER_SPEC.md)
**T03 reason field**: ✅ COMPLETED (server-side logging only, confirmed in QUALITY_GATES.md v1.3)

**Updated totals**: 6 CRITICAL / 10 HIGH / 6 MEDIUM / 4 LOW

**Updated totals**: 5 CRITICAL / 8 HIGH / 6 MEDIUM / 4 LOW → **6 CRITICAL / 10 HIGH / 6 MEDIUM / 4 LOW**

---

## Next Audit Checkpoint

Phase 2 completion (implementation deliverables).

---

**Report Prepared by**: T06 Compliance & Security Team
**Mode**: READ-ONLY Analysis (source documents not modified)
**Last Updated**: 2026-03-07 (Round 5 — Integration & Monitoring Review)
