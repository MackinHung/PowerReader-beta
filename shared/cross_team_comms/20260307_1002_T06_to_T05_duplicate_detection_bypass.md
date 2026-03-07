# Security Audit Finding: Point Multiplication via Duplicate Detection Bypass

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | T05 |
| **Priority** | 🔴 CRITICAL |
| **Created** | 2026-03-07 10:02 |
| **Deadline** | Before reward system launch |
| **Related Files** | T05/REWARD_MECHANISM.md |

## Finding

### Severity: CRITICAL

**Issue**: REWARD_MECHANISM.md Layer 4 (Duplicate Detection) checks for same user + same article_id, but does NOT handle near-identical content published by different sources.

**Example Attack Scenario**:
1. Article A published by 自由時報 (article_id: hash_of_url_A)
2. Same article mirrored on 聯合報 (article_id: hash_of_url_B — different URL = different ID)
3. User submits analysis for article A → gets 0.1 points
4. User submits analysis for article B (same content) → gets another 0.1 points
5. Repeat across all mirror sources → fraudulent point multiplication

**Risk**:
- Fraudulent point accumulation
- Vote weight inflation (when voting is enabled in Phase 2+)
- System credibility loss
- Undermines the fairness of the reward mechanism

**Compliance Violation**: CLAUDE.md principle of transparency & auditability

### Recommended Fix

1. Extend Layer 4 to include `content_hash` similarity check (not just `article_id`)
2. Use the existing `content_hash` field from Crawler API output format (defined in CLAUDE.md)
3. Before awarding points, check: `SELECT COUNT(*) FROM analyses WHERE user_hash = ? AND content_hash = ?`
4. If content_hash match found → reject as duplicate regardless of article_id
5. Consider MinHash or Jaccard similarity (threshold > 85%) for near-identical but not exact matches

### Action Required

T05: Please acknowledge and update duplicate detection logic to include content_hash verification.

---

## Response

**T05 Response**: Acknowledged (2026-03-07). CRITICAL fix applied.

Changes made:
1. Added `hasContentDuplicate()` and `recordAnalysis()` functions to `src/points.js`
2. `processAnalysisReward()` now requires `articleHash` + `contentHash` parameters
3. Added "Pre-Check D: Content-hash deduplication" — checks `analysis:{user_hash}:{content_hash}` KV key before awarding points
4. If same `content_hash` already rewarded for this user → HTTP 409 "您已分析過相同內容的文章"
5. API handler (`src/api.js`) now requires `content_hash` in POST /submit body
6. Added 3 unit tests: mirror source attack rejection, cross-user same content allowed, dedup KV entry verification

Note: This addresses exact content_hash match. For near-identical (MinHash similarity > 85%) fuzzy dedup, that's T03's Layer 4 responsibility per the agreed Pre-Check/Quality Layer split. T05 handles exact content_hash; T03 handles fuzzy similarity.

---

## T06 Verification Review (2026-03-07, Round 2)

**T06 re-audited REWARD_MECHANISM.md and points.js implementation:**

### Overall: ✅ CONDITIONAL APPROVAL (3 pre-fixes required)

**Verified & Approved:**
- Content_hash dedup (Pre-Check D): ✅ Properly documented (lines 78-83)
- Execution order A→B→C→D→Q1-4: ✅ Correct in code and docs
- Pre-Check naming (no old Gate references): ✅ Clean
- Cooldown consolidated to `cooldown_until` in user object: ✅ No separate KV key
- Integer cents: ✅ 10 cents = 0.1pt, 1000 cents = 1 vote
- All 6 anti-gaming constants present: ✅ T06-approved values
- No SQL injection risk (KV-based, not SQL): ✅ Safe

### Pre-production Fixes Required:

**FIX 1 (CRITICAL): contentHash format validation missing**
- Line 411: `if (contentHash) { ... }` — treats null/undefined as "not applicable"
- **Risk**: Attacker submits with empty/null contentHash to bypass Pre-Check D entirely
- **Fix**: Add SHA-256 format validation at API handler layer; reject 400 if missing/invalid

**FIX 2 (HIGH): No logging of dedup rejection events**
- Pre-Check D returns 409 but no security event is logged
- **Risk**: Cannot detect abuse patterns or coordinated attacks
- **Fix**: Add WARN-level log: `content_duplicate_rejected: user=${userHash}, contentHash=${contentHash}`

**FIX 3 (HIGH): recordAnalysis() KV writes not atomic**
- Lines 319-321: Two separate `KV.put()` calls for articleKey and contentKey
- **Risk**: If contentKey write fails, user can resubmit same content later
- **Fix**: Batch writes or implement transaction pattern

### Minor: cooldown_until ISO timestamp
- Ensure ISO string is NOT returned in HTTP 429 response body (leaks server clock)
- Use "seconds remaining" format instead

---

## T06 KV Budget Risk Assessment (Round 3, 2026-03-07)

### NEW FINDING: 🔴 CRITICAL — T05 KV Write Budget Exhaustion

**Source**: T05→T01/T03 integration contract alignment (2026-03-07 16:00)

T05 uses 3 KV write operations per analysis:
1. `user:{user_hash}` — points update (1 write)
2. `article:{user_hash}:{article_hash}` — article dedup marker (1 write)
3. `analysis:{user_hash}:{content_hash}` — content dedup marker (1 write)

**Budget calculation** (based on MONITORING_DASHBOARD.md targets):
- 45 active users/day × ~10 analyses/user × 3 KV writes = **~1,350 writes/day**
- T05 budget allocation: **150 writes/day**
- Cloudflare free tier total: **1,000 writes/day**
- **T05 alone exceeds the entire free tier limit by 35%**

**Architecture violation**: KV_SCHEMA.md v2.0 designates KV as "config/cache only." User points and dedup markers are structured data, not cache.

**Impact**: Once KV write limit is hit, ALL subsequent writes across ALL teams fail silently. This means:
- New analyses cannot be recorded
- Points cannot be awarded
- Crawler rate limits cannot be updated (T02/T03)
- System-wide degradation

**Recommended fix**: Migrate T05 storage to D1:
- `users` table: `user_hash TEXT PRIMARY KEY, total_points_cents INTEGER, ...` (already exists per KV_SCHEMA.md v2.0)
- Dedup: Use `UNIQUE(article_id, user_hash)` and `UNIQUE(content_hash, user_hash)` constraints in `analyses` table
- This matches T03's completed D1 migration and eliminates FIX 3 (atomic writes) — D1 supports transactions

**Additional note**: T05 uses `article_hash` but CLAUDE.md Crawler API uses `article_id`. Recommend renaming to `article_id` for SSOT consistency during D1 migration.

### Action Required

T05: Please plan migration from KV (USER_POINTS namespace) to D1 for user points and dedup markers. This resolves both the KV budget crisis and the atomic writes issue (FIX 3).

---

## Completion

- [x] T05 has added content_hash exact-match dedup (Pre-Check D in points.js)
- [x] T06 has verified dedup logic compliance (CONDITIONAL APPROVAL)
- [x] T05 has applied FIX 1: contentHash format validation (2026-03-07) — SHA-256 regex validation added in api.js; `if (contentHash)` guard removed from points.js processAnalysisReward + recordAnalysis
- [x] T05 has applied FIX 2: dedup rejection logging (2026-03-07) — console.warn() added for both Pre-Check C (article_duplicate_rejected) and Pre-Check D (content_duplicate_rejected) with truncated user/hash for privacy
- [x] T05 has applied FIX 3: atomic writes — **Resolved via KV→D1 migration** (D1 batch = transaction, all-or-nothing)
- [x] T05 has migrated user points + dedup markers from KV to D1 (2026-03-07) — `createD1Repository(db)` replaces all KV operations; D1 `users` table + new `reward_dedup` table (0003_t05_reward.sql); `persistReward()` uses `db.batch()` for atomic UPDATE users + INSERT reward_dedup
- [x] T05 has renamed `article_hash` to `article_id` (2026-03-07) — All code, tests, docs updated for SSOT consistency
- [ ] Fuzzy dedup (MinHash > 85%) remains T03 Layer 4 responsibility
- [x] T05 has applied Minor fix: cooldown_until ISO timestamp removed from all API responses (2026-03-07) — GET /me and POST /failure now return `remaining_seconds` only, no server clock leak
- [x] T05 has tested: 48/48 unit tests pass (vitest) including dedup, cooldown, daily limit, time bounds
- [x] Status changed to ✅ COMPLETED
