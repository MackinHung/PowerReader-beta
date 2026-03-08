# T07 Deployment & Monitoring Team - Phase Plan

**Scope**: CI/CD pipelines (GitHub Actions), Cloudflare deployment automation, monitoring dashboard, performance benchmarking, rollback strategy, and article R2 storage pipeline.

**Last Updated**: 2026-03-08

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

## Phase 3: Article R2 Pipeline & WebLLM Setup Guide ✅ COMPLETED

**Goal**: Automate article storage to R2 and document WebLLM model setup for users.

**Deliverables**:
1. Article ingestion workflow -- Crawler pushes processed articles to PowerReader Workers API, which stores full text to R2 and metadata to D1
2. R2 storage structure: `powerreader-articles/{source}/{date}/{article_id}.md`
3. WebLLM setup documentation -- WebGPU browser requirements, model auto-download on first use, troubleshooting guide
4. Client-side WebGPU capability detection -- PWA checks `navigator.gpu` availability, prompts user to use a supported browser (Chrome 113+ / Edge 113+) if unavailable

**Notes**:
- Qwen3-4B model (~3.4GB) is distributed via WebLLM / HuggingFace CDN (`Qwen3-4B-q4f16_1-MLC`), auto-downloaded to browser cache on first use
- R2 is used exclusively for article full text storage (~2.2GB/year), not model hosting
- Users do not need to install any local software; inference runs in-browser via WebGPU

**Dependencies**:
- T01: R2 bucket `powerreader-articles` created and bound in `wrangler.toml`
- T01: D1 schema for article metadata finalized
- T03: Confirmed model version (`Qwen3-4B-q4f16_1-MLC` via WebLLM)
- T04: Client-side WebGPU detection UX designed

---

## Phase 4: Performance Benchmarks & Load Testing 🟡 PARTIAL

**Goal**: Establish baselines and run stress tests across device tiers.

> **Status**: Server-side API benchmarks completed (2026-03-08). Client-side benchmarks (WebLLM, Web Vitals) still pending T03/T04 integration.

**Deliverables**:
1. ✅ API endpoint latency baselines (4 endpoints × 10 requests each, avg/min/max)
2. ✅ Health probe latency baselines (D1/R2/KV/Vectorize, internal)
3. ✅ D1 data integrity verification (384 articles, 11 sources)
4. ✅ Monitoring infrastructure validation (daily_counters active, secrets deployed)
5. ✅ Rolling results table in `PERFORMANCE_BENCHMARKS.md` (v1.2)
6. ⏸️ Client-side inference benchmark via WebLLM (awaiting T03)
7. ⏸️ Web Vitals baseline via Lighthouse (awaiting T04 PWA)
8. ⏸️ Load test scenarios -- normal (50 concurrent), peak (200 concurrent)

**Dependencies (updated)**:
- ✅ T02: Crawler operational — 384 articles ingested from 11 sources
- ✅ T01: Workers API deployed and responding
- ⏸️ T03: Working Qwen3-4B via WebLLM for client-side benchmarks
- ⏸️ T04: PWA deployed for Web Vitals measurement

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
| T03 | Model runs via WebLLM (`Qwen3-4B-q4f16_1-MLC`), inference pipeline for benchmarks | 3, 4 |
| T04 | PWA build config (`npm run build` output to `dist/`), dashboard integration, WebGPU detection UX | 1, 2, 3, 4 |
| T05 | No direct dependency (vote audit deferred to Phase 2+) | - |
| T06 | Security review of workflows, incident response review | 1, 5 |

## What We Provide to Other Teams

| To | What | Phase |
|----|------|-------|
| ALL | CI/CD pipelines -- automated lint, test, deploy on push to main | 1 |
| ALL | Preview deployments per PR | 1 |
| T02 | Automated crawler scheduling (GitHub Actions cron, every 2h) | 1 |
| T01 | Article R2 storage pipeline documentation | 3 |
| T03 | WebLLM setup guide and WebGPU requirements documentation (model via HuggingFace CDN, auto-downloaded to browser cache) | 3 |
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
| User browser lacks WebGPU or model not downloaded | Client-side inference fails silently | PWA detects WebGPU support at startup (`navigator.gpu`); show browser upgrade guide if unavailable; model auto-downloads on first use |
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
| Phase 3: Article R2 Pipeline & WebLLM Guide | 1 day | T01 R2/D1 ready, T03 WebLLM confirmed |
| Phase 4: Performance Benchmarks | 2 days | Phase 2 + T04 PWA deployed |
| Phase 5: Rollback & Incidents | 1 day | Phase 2 operational |

**Total estimated**: ~8-10 days (can partially overlap Phase 3 with Phase 2)

---

**Maintainer**: T07 (Deployment & Monitoring Team)
**Created**: 2026-03-06
**Updated**: 2026-03-08 -- Phase 1/2/3/5 COMPLETED, Phase 4 PARTIAL (server-side benchmarks done, client-side pending T03/T04). New: deploy.yml fixed for Node.js 20 LTS, monitoring dashboard page (T04_FRONTEND/src/dashboard.html), first E2E benchmarks recorded in PERFORMANCE_BENCHMARKS.md v1.2
