# T06 Compliance & Security Team - Phase Plan

**Scope**: Crawler compliance auditing, privacy policy enforcement, error handling standards, and security review across all teams. T06 does NOT implement features -- it reviews, audits, and defines compliance rules.

---

## Phase 1: Foundation Standards (Aligns with Project Stage 1)

**Goal**: Establish all compliance baselines before any code is written.

| Deliverable | Status | Notes |
|-------------|--------|-------|
| CRAWLER_COMPLIANCE.md v1.0 | Done | SSOT for robots.txt, rate limiting, user-agent, data processing rules |
| PRIVACY_POLICY.md v1.0 | Done | PDPA compliance, data collection/retention/anonymization rules |
| ERROR_HANDLING.md v1.0 | Done | SSOT for error classification, response format, logging, no-leak policy |
| Review shared/config.js SECURITY section | Done | Verified JWT RS256, session cross-verify, escape HTML, rate limits |

**Dependencies on other teams**:
- T01: KV_SCHEMA.md and API_ROUTES.md must exist before T06 can validate data flow compliance
- T01: config.js SECURITY section must be finalized

**Provides to other teams**:
- All teams: ERROR_HANDLING.md (unified error response format, log levels, forbidden fields)
- T02: CRAWLER_COMPLIANCE.md (robots.txt rules, rate limit persistence, user-agent spec)
- T04: Privacy policy requirements (cookie policy, no tracking, IndexedDB rules)

---

## Phase 2: Crawler Compliance Audit (Aligns with Project Stage 2)

**Goal**: Audit T02 crawler implementation against CRAWLER_COMPLIANCE.md.

| Task | Audit Target | Priority |
|------|-------------|----------|
| robots.txt check before every crawl | T02 crawler code | CRITICAL |
| Rate limit persistence in KV (not in-memory) | T02 rate limiter | CRITICAL |
| User-Agent = `MediaBiasBot/1.0 (+...)`, no browser spoofing | T02 fetch headers | HIGH |
| Paywall detection and skip | T02 article processor | HIGH |
| Author anonymization (SHA-256, salt in env var) | T02 data pipeline | HIGH |
| Raw HTML deletion after extraction | T02 storage logic | MEDIUM |
| Circuit breaker state persisted in KV | T02 error handling | MEDIUM |
| Crawl-delay unit normalization (>100 = ms, else = s) | T02 robots parser | MEDIUM |
| Exponential backoff on retries (5s, 10s, 20s) | T02 retry logic | LOW |

**Dependencies**:
- T02: Must have crawler code ready for review
- T01: KV_SCHEMA.md finalized (to verify stored article format)

**Provides**:
- T02: Violation reports via `shared/cross_team_comms/` with severity levels
- M01: Compliance audit summary per stage

---

## Phase 3: AI & Frontend Security Review (Aligns with Project Stages 3-4)

**Goal**: Audit T03 inference error handling and T04 frontend security.

| Task | Audit Target | Priority |
|------|-------------|----------|
| Error messages do not leak stack traces or internal details | T03 API responses | CRITICAL |
| XSS prevention: all user input escaped via `escapeHtml()` | T04 PWA + LINE Bot | CRITICAL |
| No PII in public API responses (contributor hashes hidden) | T03 analysis output | HIGH |
| Session cookie security flags (Secure, HttpOnly, SameSite) | T04 auth flow | HIGH |
| JWT + Session cross-verification (anti-IDOR) | T01/T04 auth | HIGH |
| LINE Bot Flex Message does not expose internal errors | T04 LINE Bot | MEDIUM |
| getUserErrorMessage() used consistently (not raw API errors) | T04 all frontends | MEDIUM |
| Model error messages are user-friendly (no WASM internals) | T04 PWA inference | LOW |

**Dependencies**:
- T03: Inference API and quality gate code ready
- T04: PWA, LINE Bot, browser extension code ready
- T01: API route implementations available

**Provides**:
- T03: Security review report on error leakage
- T04: XSS/CSRF/cookie audit report
- M01: Stage 3-4 compliance sign-off

---

## Phase 4: Reward System & Pre-Launch Audit (Aligns with Project Stage 5)

**Goal**: Final compliance sweep before production deployment.

| Task | Audit Target | Priority |
|------|-------------|----------|
| Vote audit log integrity (no tampering) | T05 Fisher-Yates | HIGH |
| No hardcoded secrets in codebase (API keys, salts, tokens) | All teams | CRITICAL |
| validateProductionSecurity() called at startup | T07 CI/CD | CRITICAL |
| API rate limits enforced and persistent | T01 Workers | HIGH |
| Data retention auto-cleanup (365 days) | T01 KV TTL | MEDIUM |
| Privacy policy displayed and consent collected on first login | T04 PWA/LINE | MEDIUM |
| AGPL-3.0 license compliance (prompt source included) | All repos | LOW |

**Dependencies**:
- T05: Reward system code ready
- T07: CI/CD pipeline ready for security checks integration

**Provides**:
- All teams: Pre-launch compliance checklist sign-off
- M01: Final compliance report with PASS/FAIL per category

---

## Risks and Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| T02 ships crawler before T06 audit | Potential robots.txt/PDPA violations | T06 audit must be a gate in CI/CD (coordinate with T07) |
| Anonymization salt leaked in git | Author identities reversible | Salt MUST be in Cloudflare Workers Secrets, never in source |
| Rate limit in-memory (OceanRAG repeat) | Target sites may block us permanently | Enforce KV persistence check in code review |
| robots.txt Crawl-delay unit ambiguity | Over-aggressive or too-slow crawling | Use normalization function (>100 = ms, else = s) |
| Cookie missing security attributes | XSS/CSRF attack surface | Mandate Secure + HttpOnly + SameSite=Strict |
| Error messages leak internals | Attacker reconnaissance | Enforce getUserErrorMessage() wrapper everywhere |

---

## Summary Timeline

| Phase | When | Key Output |
|-------|------|-----------|
| Phase 1 | Stage 1 (Architecture) | 3 SSOT docs (all done) |
| Phase 2 | Stage 2 (Crawler) | Crawler compliance audit report |
| Phase 3 | Stages 3-4 (AI + Frontend) | Security review reports for T03/T04 |
| Phase 4 | Stage 5 (Pre-launch) | Final compliance sign-off |
