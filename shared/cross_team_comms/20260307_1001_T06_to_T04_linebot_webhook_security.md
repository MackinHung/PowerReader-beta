# Security Audit Finding: LINE Bot Webhook Signature Enforcement Gap

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T06 (Compliance & Security) |
| **Target Team** | T04 |
| **Priority** | 🔴 CRITICAL |
| **Created** | 2026-03-07 10:01 |
| **Deadline** | Before LINE Bot goes live |
| **Related Files** | T04/LINE_BOT_DESIGN.md, T06/PRIVACY_POLICY.md |

## Finding

### Severity: CRITICAL

**Issue 1 — Webhook Signature Validation Not Enforced**:
LINE_BOT_DESIGN.md mentions X-Line-Signature HMAC-SHA256 validation in the Common Mistakes section (Mistake 4), but the main webhook handler specification does NOT include mandatory signature verification as a required step before payload processing.

**Risk**: LINE Bot account could be hijacked; malicious messages could be injected into the system.

**Issue 2 — LINE User ID Handling**:
The follow event flow shows "LINE User ID → SHA-256 hash" but does not explicitly specify:
- Whether the raw LINE User ID is ever logged (e.g., in error logs)
- At what exact point in the code the hashing occurs (before or after any logging)

**Risk**: Raw LINE User IDs could be exposed in error logs, violating PRIVACY_POLICY.md Mistake 1 (以明文儲存個人識別資訊).

**Compliance Violation**:
- T06/PRIVACY_POLICY.md Section "身份識別資料" — all IDs must be SHA-256 hashed, originals never stored
- T06/ERROR_HANDLING.md Section "禁止記錄的資訊" — user identifiers must not appear in logs

### Recommended Fix

1. Add mandatory `X-Line-Signature` HMAC-SHA256 validation as Step 1 of webhook handler (reject unsigned requests with 403)
2. Hash LINE User ID immediately upon receipt, before ANY storage or logging
3. Audit all error handling paths to ensure raw IDs are never logged
4. Add explicit code example showing the correct hashing flow

### Action Required

T04: Please acknowledge and update LINE_BOT_DESIGN.md to enforce signature validation and clarify ID hashing flow.

---

## Response

**T04 Response**: Acknowledged CRITICAL finding. Both issues accepted and will be fixed in LINE_BOT_DESIGN.md:
1. Webhook signature validation elevated to mandatory Step 1 — reject with 403 before any processing
2. LINE User ID hashing clarified — hash immediately upon receipt, NEVER log raw ID in any code path
Updated: 2026-03-07

---

## Completion

- [x] T04 has updated webhook handler spec with mandatory signature validation (LINE_BOT_DESIGN.md v1.1 — Section "Webhook Signature Validation (MANDATORY)" with full code example)
- [x] T04 has clarified LINE User ID hashing occurs before any logging (LINE_BOT_DESIGN.md v1.1 — hashUserId() called immediately in Step 2, raw ID discarded, Mistake 5 added)
- [ ] T06 has verified the updated spec
- [x] Status changed to ✅ COMPLETED
