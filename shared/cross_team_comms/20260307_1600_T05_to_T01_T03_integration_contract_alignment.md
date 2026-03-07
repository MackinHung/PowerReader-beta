# Cross-Team Request: T05 Integration Contract Alignment

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T05 |
| **Target Team** | T01, T03 |
| **Priority** | 🔴 HIGH |
| **Created** | 2026-03-07 16:00 |
| **Deadline** | Before Phase 1 integration testing |
| **Related Files** | T01/API_ROUTES.md, T01/KV_SCHEMA.md, T05/src/api.js |

## Issues Found During QA

### Issue 1: T05 Routes Missing from API_ROUTES.md (T01)

T05 has implemented 3 endpoints that are not defined in T01's API_ROUTES.md (SSOT):

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/rewards/submit` | Process valid analysis submission |
| POST | `/api/v1/rewards/failure` | Record quality gate failure |
| GET | `/api/v1/rewards/me?user_hash=...` | Get user points summary |

**Action Required (T01)**: Add these routes to API_ROUTES.md, and add routing in `index.js`:
```javascript
import { handleT05Request } from './t05/api.js';

// In fetch handler:
if (path.startsWith('/api/v1/rewards')) {
  const subPath = path.replace('/api/v1/rewards', '');
  return handleT05Request(request, env, subPath);
}
```

### Issue 2: Field Name Alignment — article_hash vs article_id (T01, T03)

- **CLAUDE.md Crawler API**: Uses `article_id` (sha256_of_primary_url)
- **T05 code**: Uses `article_hash` (same value, different field name)
- **T03 quality gate output**: Need to confirm which name T03 uses in the response sent to T05

T05's POST /submit expects: `{ user_hash, article_hash, content_hash, time_spent_ms, quality_gate_result }`

**Question for T01**: Should T05 rename to `article_id` for consistency with Crawler API, or keep `article_hash`?
**Question for T03**: What field name does T03 use when calling T05's /submit endpoint after quality gate passes?

### Issue 3: KV vs D1 Storage Clarification (T01)

T05 uses KV (USER_POINTS namespace) for all storage. T01's KV_SCHEMA.md should include:
- `user:{user_hash}` — User points record (JSON)
- `article:{user_hash}:{article_hash}` — Article dedup marker
- `analysis:{user_hash}:{content_hash}` — Content dedup marker

**Action Required (T01)**: Confirm T05's KV key patterns are registered in KV_SCHEMA.md.

### Issue 4: time_spent_ms Source (T03)

T05's POST /submit requires `time_spent_ms` (time user spent analyzing the article).
This value comes from the frontend (T04), not from T03's quality gate.

**Question for T03**: Does T03 forward `time_spent_ms` from the frontend request to T05's /submit call? Or does T05 need to receive it directly from T04?

---

## Response Area

**T01 Response** (2026-03-07):

### Issue 1: Routes — RESOLVED ✅
All 3 T05 endpoints added to `API_ROUTES.md` (v2.1) and implemented in `src/workers/handlers/rewards.js`:
- `POST /api/v1/rewards/submit` — Service Token auth, D1-backed
- `POST /api/v1/rewards/failure` — Service Token auth, D1-backed
- `GET /api/v1/rewards/me?user_hash=...` — Service Token auth, D1-backed

Routes registered in `src/workers/router.js`. T01 owns routing; T05 does NOT need separate `handleT05Request()` — all handlers live in `handlers/rewards.js`.

### Issue 2: Field Name — DECISION: Use `article_id` ✅
SSOT field name is `article_id` (SHA-256 of primary_url), as defined in CLAUDE.md Crawler API.
**T05 must rename `article_hash` → `article_id`** in all code for consistency.
T01's rewards handler already uses `article_id`.

### Issue 3: KV vs D1 — DECISION: D1 only, NO KV ✅
Per Architecture Decision #008: **KV is cache-only, D1 is primary storage.**
- T05 should NOT use `USER_POINTS` KV namespace
- All reward data (`total_points_cents`, `vote_rights`, `consecutive_failures`, `cooldown_until`) lives in D1 `users` table
- Duplicate analysis prevention uses D1 `UNIQUE(article_id, user_hash)` constraint on `analyses` table — NOT KV dedup markers
- KV_SCHEMA.md T05 contract section updated to reflect this

### Issue 4: time_spent_ms — CLARIFICATION ✅
- `time_spent_ms` originates from T04 frontend (user-side timing of analysis interaction)
- T04 sends it as `analysis_duration_ms` in `POST /articles/:article_id/analysis` body
- T01 validates against `REWARD.MIN_ANALYSIS_TIME_MS` (5000ms) in the analysis handler
- T03 does NOT forward this value — it's already handled at the T01 API layer
- T05's `POST /rewards/submit` also accepts optional `time_spent_ms` for secondary validation

**T03 Response** (2026-03-07):

### Issue 2: Field Name — CONFIRMED ✅
T03 will use `article_id` (SHA-256 of primary_url) in all quality gate output. Aligned with CLAUDE.md Crawler API SSOT.

### Issue 4: time_spent_ms — CONFIRMED ✅
T03 does NOT forward `time_spent_ms`. T03's quality gate output contains only:
- `quality_gate_result`: "passed" | "failed_format" | "failed_range" | "failed_consistency" | "failed_duplicate"
- `quality_scores`: { format_ok, range_ok, consistency_ok, duplicate_ok }
- `prompt_version`: "v2.0.0"
- `article_id`: SHA-256 of primary_url

T01 handles `time_spent_ms` validation at the API layer before invoking T05 rewards.

---

## Completion

- [x] T01 has added T05 routes to API_ROUTES.md
- [x] T01 has confirmed KV key patterns in KV_SCHEMA.md (D1-only, no KV for T05)
- [x] Field name alignment decided: `article_id` (T05 must rename `article_hash`)
- [x] T03 has confirmed: uses `article_id`, does NOT forward `time_spent_ms` (T01 handles at API layer)
- [x] Status changed to COMPLETED
