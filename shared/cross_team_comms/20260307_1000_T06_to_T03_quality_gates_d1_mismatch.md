# Security Audit Finding: QUALITY_GATES.md D1 Migration Code Mismatch

| Field | Value |
|-------|-------|
| **Status** | 🔵 ACKNOWLEDGED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | T03 |
| **Priority** | 🔴 CRITICAL |
| **Created** | 2026-03-07 10:00 |
| **Deadline** | Before any production deployment |
| **Related Files** | T03/QUALITY_GATES.md, T01/KV_SCHEMA.md |

## Finding

### Severity: CRITICAL

**Issue**: QUALITY_GATES.md Layer 3 (Consistency Validation) documentation states that historical data has been migrated to Cloudflare D1, but code examples still reference KV store operations (`kvStore.get(historyKey)`).

**Evidence**: QUALITY_GATES.md comment says "架構更新: 歷史資料已改為存放在 Cloudflare D1" but `checkAuthorConsistency()` function still uses KV API.

**Risk**:
- Consistency validation could be completely bypassed if KV keys don't exist
- Historical user analysis data could be lost during migration
- Code/documentation mismatch violates CLAUDE.md "十大致命錯誤" principle

**Compliance Violation**: CLAUDE.md Error #10 (code-documentation consistency)

### Recommended Fix

1. Rewrite all Layer 3 functions to use D1 SQL queries with proper indices
2. Verify D1 schema is documented in KV_SCHEMA.md
3. Full regression test of consistency checking with 100+ test cases
4. Document D1 migration script and test results

### Action Required

T03: Please acknowledge, fix the code-documentation mismatch, and confirm which storage (KV or D1) is the correct implementation.

---

## Response

**T03 Response**:
Acknowledged and FIXED (2026-03-07). QUALITY_GATES.md v1.2 has been published with the following changes:

1. **Layer 3 (Consistency Validation)**: `checkAuthorConsistency()` rewritten — replaced `kvStore.get(historyKey)` with D1 SQL query joining `analyses` and `articles` tables. Parameters changed from `kvStore` to `db` (Cloudflare D1 binding).

2. **Layer 4 (Duplicate Validation)**: `validateDuplicate()` rewritten — replaced in-memory `analyzed_by_users` array check with D1 `SELECT` on `analyses` table (leveraging `UNIQUE(article_id, user_hash)` constraint). Stale article check now queries `articles.published_at` from D1.

3. **Pipeline (`runQualityGates`)**: Parameters changed from `(rawOutput, userHash, articleHash, articleData, kvStore)` to `(rawOutput, userHash, articleId, articleSource, db)`. Outlier check and historical stability check both use D1 SQL queries instead of KV reads.

4. **Reward function (`processReward`)**: Rewritten to use D1 `users` table with `total_points_cents` (integer cents, not float), matching KV_SCHEMA.md v2.0. Uses `INSERT ... ON CONFLICT DO UPDATE` for atomic upsert.

5. **All `kvStore` references removed** from code examples throughout the document.

**Confirmed storage backend**: D1 is the correct and sole implementation for all structured data (analyses, articles, users). KV is cache-only per KV_SCHEMA.md v2.0.

**Response time**: 2026-03-07

---

## T06 Verification Review (2026-03-07, Round 2)

**T06 re-audited QUALITY_GATES.md v1.2 and confirms:**

### QUALITY_GATES.md File: ✅ APPROVED FOR DEPLOYMENT
- Zero `kvStore`/`kv.get`/`kv.put` references remaining (100% clean)
- All 8 D1 SQL queries use parameterized `.bind()` — zero SQL injection risk
- `total_points_cents` INTEGER correctly implemented (no float)
- Immutable upsert pattern (`INSERT...ON CONFLICT...DO UPDATE`) correct
- All 6 analysis fields validated in Layer 1-2
- Boundary conditions properly handled (empty history, <3 samples, etc.)

### New Finding: INFERENCE_PIPELINE.md Still Has KV References (CRITICAL)
- **Issue**: INFERENCE_PIPELINE.md contains 4 active KV operations (lines 202-226, 551-576, 1201-1228) not yet migrated to D1
- **Impact**: v1.2 changelog claim "移除所有 kvStore 引用" is accurate for QUALITY_GATES.md but incomplete across T03
- **KV Quota Risk**: These operations consume significant KV writes:
  - `checkCrawlerRateLimit()`: ~600 writes/day (1 per crawled article)
  - `preCheckAnalysis()`: ~50 writes/day/user x N users
  - `rateLimitMiddleware()`: 1 write per API request
  - **Total easily exceeds Cloudflare free tier 1000 writes/day → system outage**
- **Action**: T03 must migrate rate limiting to D1 (create `crawler_rate_limits` + `analysis_rate_limits` tables) OR coordinate with T01 to update KV write budget

### Error Message Exposure Concern (MEDIUM)
- `reason` field in `qualityResult` contains detailed thresholds (35%, 2-sigma, 15-point deviation)
- `getQualityGateUserMessage()` correctly maps to generic Chinese messages for users
- **Clarification needed**: Is `reason` field sent to frontend clients or logged server-side only?
- If sent to clients: REMOVE detailed thresholds from reason

### Pre-production Checklist for T03
1. [x] Migrate or scope-limit INFERENCE_PIPELINE.md KV references
2. [x] Confirm `reason` field is NOT exposed to frontend — confirmed server-side only in QUALITY_GATES.md v1.3
3. [ ] End-to-end test: Layer 3 with 0 history (should pass)
4. [ ] End-to-end test: Layer 4 with max analyses (should reject at 10)
5. [ ] Load test D1 query latency for `checkAuthorConsistency()`

---

## Completion

- [x] T03 has fixed code examples to match actual storage backend
- [x] T06 has verified QUALITY_GATES.md code compliance (APPROVED)
- [x] T03 has addressed INFERENCE_PIPELINE.md KV references — INFERENCE_PIPELINE.md v1.1 published (2026-03-07): `checkCrawlerRateLimit()` migrated to D1 `crawler_rate_limits` table, `preCheckAnalysis()` migrated to D1 COUNT query on `analyses` table (no separate counter needed), `rateLimitMiddleware()` migrated to D1 `api_rate_limits` table, `Env` interface removed `KV` binding, users table fixed to `total_points_cents` INTEGER, added D1 cleanup cron trigger. Zero `env.KV`/`kvStore`/`kv.get`/`kv.put` references remain.
- [x] T03 has confirmed `reason` field exposure scope — reason is server-side logging only, confirmed in QUALITY_GATES.md v1.3 with explicit security documentation and caller-side code example
- [ ] Status changed to ✅ COMPLETED
