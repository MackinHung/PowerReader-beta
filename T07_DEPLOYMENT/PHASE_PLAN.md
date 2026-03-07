# T07 Deployment & Monitoring Team - Phase Plan

**Scope**: CI/CD pipelines (GitHub Actions), Cloudflare deployment automation, monitoring dashboard, performance benchmarking, rollback strategy, and article R2 storage pipeline.

**Last Updated**: 2026-03-07

---

## Phase 1: CI/CD Foundation ✅ COMPLETED

**Goal**: Establish core GitHub Actions workflows and branch protection rules.

**Deliverables**:
1. Crawler cron workflow (`crawler-cron.yml`) -- scheduled every 2h, ~50 articles/run (deduped), config validation, artifact upload. Note: bge-small-zh topic filtering runs within the Crawler workflow (no separate workflow needed)
2. Deployment workflow (`deploy.yml`) -- lint/test/security gate, Pages + Workers deploy, smoke test
3. Branch strategy enforcement -- `main`/`develop`/`feature/*` protection rules
4. Secret management setup -- 8 GitHub Secrets registered, rotation schedule documented
5. Pre-deploy check scripts -- `validate-config.js`, `validate-enums.js`, `validate-state-machine.js`

**Dependencies**:
- T01: `wrangler.toml` config (KV namespace IDs, R2 bucket names, D1 database ID, Vectorize index, route patterns)
- T01: `shared/config.js` and `shared/enums.js` finalized
- T06: Security review of all workflow `run` steps (secret leak check)

---

## Phase 2: Monitoring Dashboard ✅ COMPLETED

**Goal**: Provide monitoring logic modules, alerting rules, and dashboard UI.

**Deliverables**:
1. Provide monitoring probe modules to T01 for `/health/ready` -- D1/R2/Vectorize/KV connectivity checks (T01 owns route registration + Service Token auth; ref: cross-team comm 20260306_1801)
2. Provide metrics aggregation module to T01 for `/metrics` -- KV latency avg/p95, CDN hit rate, crawler stats, D1 query latency, Vectorize query count, Workers AI neuron usage
3. Metrics collection middleware in Workers -- batch in-memory, periodic D1 flush (avoid KV write quota). Workers AI neuron monitoring added
4. Alert rules engine -- P0-P3 severity, 1h suppression, auto-recovery notifications
5. Dashboard page (static HTML on Pages) -- 5 KPI cards, 2 trend charts, resource bars (D1/R2/Vectorize/Workers AI), crawler panel

**Note**: `/health` (basic) is fully owned by T01 — T07 does not implement it. T07 provides probe/aggregation logic only.

**Dependencies**:
- T01: Workers API routes registered for `/health`, `/health/ready`, `/metrics` (T01 owns registration)
- T01: D1 database available for metrics storage (preferred over KV to avoid write quota)
- T04: Dashboard page integrated into PWA navigation (or standalone route)

---

## Phase 3: Article R2 Pipeline & Ollama Setup Guide ✅ COMPLETED

**Goal**: Automate article storage to R2 and document Ollama model setup for users.

**Deliverables**:
1. Article ingestion workflow -- Crawler pushes processed articles to PowerReader Workers API, which stores full text to R2 and metadata to D1
2. R2 storage structure: `powerreader-articles/{source}/{date}/{article_id}.md`
3. Ollama setup documentation -- installation guide, `ollama pull qwen3.5:4b` instructions, health check verification
4. Client-side Ollama detection -- PWA checks `localhost:11434` availability, prompts user to install/start Ollama if unavailable

**Notes**:
- Qwen3.5-4B model (~3.4GB) is distributed via Ollama registry (`ollama pull qwen3.5:4b`), NOT uploaded to R2
- R2 is used exclusively for article full text storage (~2.2GB/year), not model hosting
- Users manage their own Ollama installation locally

**Dependencies**:
- T01: R2 bucket `powerreader-articles` created and bound in `wrangler.toml`
- T01: D1 schema for article metadata finalized
- T03: Confirmed model version (qwen3.5:4b via Ollama)
- T04: Client-side Ollama detection UX designed

---

## Phase 4: Performance Benchmarks & Load Testing ⏸️ BLOCKED

**Goal**: Establish baselines and run stress tests across device tiers.

> **Blocked reason**: Requires T03 Ollama running, T04 PWA deployed, T02 Crawler operational — all external dependencies not yet available.

**Deliverables**:
1. KV latency benchmark script (100-read avg/p95/p99)
2. CDN cache hit rate test script
3. Client-side inference benchmark via Ollama API (high/mid/low-tier devices, GPU vs CPU-only)
4. bge-m3 embedding benchmark via Workers AI (latency per embed call)
5. Web Vitals baseline (Lighthouse: FCP, LCP, CLS, FID, TTFB, TTI)
6. Load test scenarios -- normal (50 concurrent), peak (200 concurrent)
7. Rolling results table in `PERFORMANCE_BENCHMARKS.md`

**Dependencies**:
- T03: Working Qwen3.5-4B via Ollama for client-side benchmarks
- T04: PWA deployed for Web Vitals measurement
- T02: Crawler running for real crawl-performance data

---

## Phase 5: Rollback & Incident Response ✅ COMPLETED

**Goal**: Automated rollback and documented incident procedures.

**Deliverables**:
1. ✅ Auto-rollback trigger -- deploy.yml: post-deploy health check (3 probes, 30s intervals), auto-rollback to previous SHA on full failure, GitHub Issue notification
2. ✅ Error rate monitor -- alerts.js: 11 alert rules with P0-P3 severity, 1h suppression, auto-resolve
3. ✅ KV latency monitor -- `kv_latency_high` alert triggers at >100ms (`MONITORING.ALERT_KV_LATENCY_MS`)
4. ✅ Rollback runbook -- INCIDENT_RESPONSE.md: Workers/Pages/D1/KV rollback + Kill Switch
5. ✅ Incident severity matrix (P0-P3) with response time SLAs + post-incident review template

**Note**: Voting-related audit workflows (GitHub Actions audit commits for vote integrity) are deferred to Phase 2+ per M01 decision (2026-03-06). v1.0 focuses on core CI/CD, deployment, and monitoring only.

**Dependencies**:
- Phase 2 monitoring must be operational
- T06: Incident response procedures reviewed for compliance

---

## Cross-Team Dependencies Summary

| We Need From | What | Phase |
|--------------|------|-------|
| T01 | KV namespace IDs, R2 bucket, D1 database ID, Vectorize index, wrangler.toml, API routes for health/metrics | 1, 2, 3 |
| T02 | Crawler source code (bge-small-zh filtering integrated in crawler) | 1 |
| T03 | Model runs via Ollama (`qwen3.5:4b`), inference pipeline for benchmarks | 3, 4 |
| T04 | PWA build config (`npm run build` output to `dist/`), dashboard integration, Ollama detection UX | 1, 2, 3, 4 |
| T05 | No direct dependency (vote audit deferred to Phase 2+) | - |
| T06 | Security review of workflows, incident response review | 1, 5 |

## What We Provide to Other Teams

| To | What | Phase |
|----|------|-------|
| ALL | CI/CD pipelines -- automated lint, test, deploy on push to main | 1 |
| ALL | Preview deployments per PR | 1 |
| T02 | Automated crawler scheduling (GitHub Actions cron, every 2h) | 1 |
| T01 | Article R2 storage pipeline documentation | 3 |
| T03 | Ollama setup guide and health check documentation (model via Ollama registry, not R2) | 3 |
| T04 | Cloudflare Pages deployment with CDN | 1 |
| ALL | Health endpoints (D1/R2/Vectorize/KV), metrics API, alert notifications | 2 |
| ALL | Performance baselines and regression detection | 4 |
| ALL | Rollback capability and incident response procedures | 5 |

---

## Risks and Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| KV write limit (1000/day free) | Minimal risk — KV is config-only now (~100 writes/day) | Monitor usage; batch config updates |
| GitHub Actions cron uses UTC | Crawler runs at unexpected Taiwan times | Document UTC-to-Asia/Taipei mapping explicitly |
| User Ollama not running or model not downloaded | Client-side inference fails silently | PWA detects Ollama status at startup; show setup guide if unavailable |
| Workers CPU limit (10ms free tier) | Metrics aggregation may exceed CPU budget | Pre-aggregate via KV counters; avoid per-request computation |
| Wrangler version drift | Local vs CI behavior mismatch | Lock version in `package.json`, enforce `npm ci` |
| Secret rotation gaps | Expired tokens break deployments | Calendar reminders for 30/90-day rotation cycles |
| GitHub Actions minutes budget | Crawler every 2h = ~1,620 min/month (81% of 2,000 free) | Monitor usage; reduce frequency if approaching limit |

---

## Estimated Timeline

| Phase | Estimated Effort | Depends On |
|-------|-----------------|------------|
| Phase 1: CI/CD Foundation | 2-3 days | T01 wrangler.toml ready |
| Phase 2: Monitoring Dashboard | 2-3 days | Phase 1 + T01 API routes |
| Phase 3: Article R2 Pipeline & Ollama Guide | 1 day | T01 R2/D1 ready, T03 Ollama confirmed |
| Phase 4: Performance Benchmarks | 2 days | Phase 2 + T04 PWA deployed |
| Phase 5: Rollback & Incidents | 1 day | Phase 2 operational |

**Total estimated**: ~8-10 days (can partially overlap Phase 3 with Phase 2)

---

**Maintainer**: T07 (Deployment & Monitoring Team)
**Created**: 2026-03-06
**Updated**: 2026-03-07 -- Phase 1/2/3/5 COMPLETED, Phase 4 BLOCKED (external deps). Deliverables: deploy.yml (CI/CD+auto-rollback), crawler-cron.yml, metrics.js, alerts.js, probes.js, collector.js, dashboard/index.html, OLLAMA_SETUP.md, ollama-detect.js, INCIDENT_RESPONSE.md
