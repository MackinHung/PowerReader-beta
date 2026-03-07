# Compliance Finding: Author Field Anonymization Conflict (SSOT vs SSOT)

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | T01, T02 |
| **Priority** | 🔴 CRITICAL |
| **Created** | 2026-03-07 11:00 |
| **Deadline** | Before Crawler implementation |
| **Related Files** | T06/CRAWLER_COMPLIANCE.md (Section 5.3), T01/KV_SCHEMA.md (D1 + R2), CLAUDE.md (Crawler API output) |

## Finding

### Severity: CRITICAL — SSOT Contradiction

Two SSOT documents directly contradict each other on author data handling:

**T06/CRAWLER_COMPLIANCE.md (SSOT for compliance)** — Section 5.3:
- Author MUST be anonymized via SHA-256 hash before storage
- Store `author_hash`, NOT `author` name
- Raw author name MUST be deleted after hashing
- Code example: `author_hash: anonymizeAuthor(rawAuthor)` → `"a3f2b1c4d5e6f7g8"`

**T01/KV_SCHEMA.md (SSOT for storage)** — D1 + R2:
- D1 `articles` table line 46: `author TEXT` — stores raw name
- R2 object line 164: `"author": "Reporter Name"` — stores raw name
- No `author_hash` field defined anywhere

**CLAUDE.md** — Crawler API output format:
- Line 115: `"author": "記者名 (nullable)"` — transmits raw name

### Impact

1. **Legal risk**: Storing journalist names violates our stated PDPA compliance measures (PRIVACY_POLICY.md says we anonymize all PII)
2. **SSOT conflict**: Two SSOT documents define opposite behaviors for the same field
3. **Implementation confusion**: T02 cannot know which SSOT to follow

### Root Cause

CRAWLER_COMPLIANCE.md was written with anonymization as a privacy requirement.
KV_SCHEMA.md was later rewritten to v2.0 without cross-referencing the compliance requirement.
CLAUDE.md Crawler API format was written before the anonymization requirement was established.

### Decision Required (Escalate to M01 + Project Owner)

**Option A: Anonymize (CRAWLER_COMPLIANCE.md wins)**
- Crawler hashes author before sending to PowerReader
- D1: `author TEXT` → `author_hash TEXT` (16-char hex)
- R2: `"author"` → `"author_hash"`
- CLAUDE.md: Update Crawler API output format
- Downside: Lose ability to display journalist names in UI

**Option B: Keep plain text (KV_SCHEMA.md wins)**
- Update CRAWLER_COMPLIANCE.md to allow plain text author storage
- Justify: Journalist names in news articles are public information, not private PII
- PRIVACY_POLICY.md: Add clarification that publicly available journalist names are not treated as PII
- Downside: Weaker privacy posture

**Option C: Dual storage**
- D1: Store `author_hash` for internal lookups
- R2: Store `author` plain text for display (public info)
- Crawler API: Send both `author` and `author_hash`
- Downside: Complexity; anonymization serves no purpose if plain text is also stored

### T06 Recommendation

**Recommend Option B** with documented justification:
- Journalist bylines are publicly visible on the original news article
- Our system links back to original articles (导流 requirement)
- Hashing publicly available names provides no real privacy benefit
- However, CRAWLER_COMPLIANCE.md MUST be updated to reflect this decision, with clear justification

### Action Required

1. **M01**: Escalate to project owner for decision (A/B/C)
2. **T01**: Update KV_SCHEMA.md based on decision
3. **T02**: Update Crawler API format based on decision
4. **T06**: Update CRAWLER_COMPLIANCE.md based on decision

---

## Response

**T01 Response**: Agree with T06's recommendation of **Option B** (keep plain text). Technical assessment: (1) Journalist bylines are publicly available in original articles — hashing provides zero privacy benefit; (2) KV_SCHEMA.md D1 `author` field is intentionally nullable to handle articles without bylines; (3) Hashing would break any future UI feature displaying reporter names; (4) PRIVACY_POLICY.md should add explicit carve-out: "Publicly available journalist bylines from news articles are not treated as PII per Taiwan PDPA Article 2-1 (publicly available information exemption)." **Awaiting project owner decision to finalize.** T01 will update KV_SCHEMA.md + CLAUDE.md Crawler API format based on decision.
**T02 Response**: Acknowledged. Will follow Option B — keep plain text `author` field in Crawler API output.
**M01 Response**: Option B confirmed by project owner (2026-03-07). Journalist bylines are public information.

---

## Completion

- [x] Project owner has chosen Option ~~A / B / C~~ **B (keep plain text)**
- [x] All 3 SSOT documents aligned (CRAWLER_COMPLIANCE.md v1.4, PRIVACY_POLICY.md v1.3 updated, KV_SCHEMA.md already correct)
- [x] CLAUDE.md Crawler API output format already uses `"author"` (no change needed)
- [x] Status changed to ✅ COMPLETED
