# T03 AI Inference Team -- Phase Plan

**Team**: T03 (AI Inference Team)
**Scope**: Qwen3-4B client-side inference via WebLLM (WebGPU), dual-pass architecture, RAG three-layer prompt engineering, 4-layer quality gates, model accuracy evaluation, knowledge base maintenance.

---

## Phase 1: Gold Standard Dataset & Baseline (Priority: CRITICAL)

**Goal**: Build the evaluation foundation before any code is written.

**Deliverables**:
1. Curate 20 gold-standard articles (5+ sources, balanced bias/controversy distribution)
2. Recruit 3+ annotators; compute inter-annotator agreement (Cohen's kappa >= 0.60)
3. Store annotated dataset in R2 at `gold-standard/v2/`
4. Document annotation guidelines (Taiwan political spectrum: 0=deep-green, 100=deep-blue)

**Input format**: Raw articles from Crawler API (no CKIP tokens). Each article contains:
- `article_id`, `content_hash`, `title`, `summary`, `author`, `content_markdown`
- `source`, `primary_url`, `published_at`, `crawled_at`
- `filter_score`, `matched_topic`, `dedup_metadata`

**Dependencies**:
- T02: Need 20 real crawled articles in Crawler API output format (no `tokens` field -- CKIP BERT has been completely removed)
- T01: Need finalized D1 schema for `article_id`, `content_hash`, `source` fields

**Risks**:
- Annotator disagreement on edge cases (satire, editorials) -- mitigate with clear guidelines
- Insufficient source diversity -- coordinate with T02 to ensure 10+ sources available

---

## Phase 2: Prompt v2.0.0 Implementation & Testing

**Goal**: Implement the three-layer prompt architecture, inference pipeline, and run baseline accuracy tests.

**Deliverables**:
1. Implement `sanitizeArticleInput()` -- input sanitization (control chars, length truncation at 4096 chars, source validation against `shared/enums.js NEWS_SOURCES`)
2. Implement Qwen3-4B inference wrapper with locked config:
   - model: `Qwen3-4B-q4f16_1-MLC` (WebLLM, 3,432 MB VRAM, WebGPU browser inference)
   - think=false, temperature=0.5, top_p=0.95, presence_penalty=1.5
   - num_predict=4096, response_format: { type: "json_object" }
3. Three-layer prompt architecture (reference PROMPT_VERSIONS.md v2.0.0):
   - **L1 (static, ~300 tokens)**: Taiwan political spectrum definition + score anchors + JSON schema output instruction. Cached locally on client.
   - **L2 (RAG dynamic, ~200-800 tokens)**: Retrieved from Cloudflare Vectorize via Workers AI bge-m3 (1024d) title embedding query. Includes politicians (party + stance), media (bias score), topics (green/blue stances + controversy), Taiwan-specific terms (definition + political context), recent events (background). Transparent to user.
   - **L3 (input)**: Article JSON from Crawler API (title, summary, content_markdown, source, author, published_at).
4. Run gold-standard baseline: record Bias MAE, Bias F1, Controversy F1, pass rate
5. Fill MODEL_ACCURACY_REPORT.md version tracking table with v2.0.0 results
6. **Explicitly forbidden**: Few-shot examples (causes spread=82 collapse per Phase 2-4 testing)

**Dependencies**:
- Phase 1 completed (gold standard ready)
- T01: Cloudflare Workers API available for Vectorize knowledge queries (L2)
- T01: D1 read/write API available for Layer 3/4 quality gate history lookups

**Risks**:
- Knowledge base coverage insufficient for cold topics -- mitigate with manual seed entries for top 20 politicians, 15 media outlets, 10 active topics
- RAG L2 injection too long may degrade quality -- enforce 800 token hard cap

---

## Phase 3: Quality Gates Implementation

**Goal**: Implement the 4-layer validation pipeline (reference QUALITY_GATES.md for full spec).

**Deliverables**:
1. **Pre-check gates (T05 responsibility)**: Duplicate user-article check and stale article check run server-side before client inference begins. These are Layer 4 checks moved earlier to save client computation.
2. **Layer 1 (Format)**: JSON parse, 6 required fields, type checks -- pure local, no I/O
3. **Layer 2 (Range)**: Score 0-100, category-score consistency via `getBiasCategory()`/`getControversyLevel()`, reasoning length 10-200 chars, key_phrases 1-10 items
4. **Layer 3 (Consistency)**: Same-author-source diff < 35%, 2-sigma outlier detection (>= 3 samples), historical stability +/-15 (>= 5 history entries) -- requires D1 reads
5. **Layer 4 (Duplicate)**: Same user same article blocked, max 10 analyses/article, 72h stale cutoff
6. Short-circuit pipeline: L1 -> L2 -> L3 -> L4; fail-fast saves D1 reads
7. Write `quality_gate_result` + `quality_scores` + `prompt_version` to D1 on every result (pass or fail)

**Storage**: Analysis results stored in **Cloudflare D1** (SQL), not KV. KV is reserved for system configuration and caching only.

**Dependencies**:
- T01: D1 API for `history:{userHash}:{source}`, `user_history:{userHash}:scores`, article metadata
- T05: Pre-check gates API (duplicate + stale checks before inference)
- `shared/enums.js`: `QUALITY_GATE_RESULTS`, `BIAS_CATEGORIES`, `CONTROVERSY_LEVELS`, helper functions

**Provides to other teams**:
- T05: `quality_gate_result === "passed"` triggers 0.1 point reward
- T07: Pass rate metric for monitoring dashboard (target 60-70%, alert at < 60%)

**Risks**:
- Layer 3 requires sufficient history data -- early users will always pass (cold start)
- D1 daily read limit (5M free tier) may constrain history lookups at scale

---

## Phase 4: Device Performance & Edge Cases

**Goal**: Validate inference across device tiers and handle edge cases.

**Deliverables**:
1. Benchmark on 3 device tiers: high-end (<3s), mid-tier (3-6s), low-end (6-10s target)
2. Model download validation: ~3.4GB download size, ~4GB runtime RAM
3. Edge case regression tests: satire, editorials, wire stories, short (<200 chars), long (>2000 chars), mixed CJK/English
4. Prompt injection defense validation: tampered prompts caught by Layer 1/2
5. Version mismatch detection: `validatePromptVersion()` blocks non-v2.0.0 submissions
6. Verify think=false latency target: 6-10 seconds per pass, ~14s total dual-pass (no thinking mode)

**Dependencies**:
- T04: PWA integration for real device testing (WebLLM model download, WebGPU progress UI)
- T07: Performance benchmark infrastructure

**Risks**:
- Low-end devices may OOM with ~4GB runtime -- mitigate with graceful degradation message ("your device does not support local analysis")
- Battery drain on mobile -- respect `DOWNLOAD_MIN_BATTERY_PCT: 20` and `DOWNLOAD_REQUIRE_CHARGING: true`
- 3.4GB model download requires stable connection -- implement resume-capable download with progress UI

---

## Phase 5: A/B Testing Framework & Continuous Improvement

**Goal**: Enable systematic prompt iteration post-launch.

**Deliverables**:
1. A/B test framework: 50/50 split, paired t-test (p < 0.05), minimum 50 articles per group
2. Regression gate: new prompt must not increase Bias MAE by >2, not decrease category accuracy by >5%
3. Confusion matrix analysis per bias category (watch for extreme_left/extreme_right blind spots)
4. Per-source accuracy tracking (liberty times, united daily, CNA, etc.)
5. Prompt version changelog maintenance (semantic versioning: MAJOR/MINOR/PATCH per PROMPT_VERSIONS.md)
6. Baseline comparison always against v2.0.0

**Dependencies**:
- T01: D1 support for `prompt_version` field in analysis records
- T07: Dashboard metrics for A/B comparison

---

## Cross-Team Interface Summary

### T03 Depends On:
| Team | What We Need | When |
|------|-------------|------|
| T02 | Crawled articles in Crawler API format (no `tokens` field) | Phase 1 |
| T01 | Cloudflare D1 schema finalized, D1 read/write API, Vectorize knowledge base, Workers AI bge-m3 embedding endpoint | Phase 2-3 |
| T04 | PWA model download (3.4GB) + local Ollama inference integration | Phase 4 |
| T05 | Pre-check gates API (duplicate + stale checks before inference) | Phase 3 |
| `shared/enums.js` | BIAS_CATEGORIES, CONTROVERSY_LEVELS, QUALITY_GATE_RESULTS, NEWS_SOURCES | Phase 2+ |
| `shared/config.js` | MODELS, ANALYSIS, REWARD constants | Phase 2+ |

### T03 Provides To:
| Team | What We Provide | When |
|------|----------------|------|
| T01 | Analysis output JSON schema (6 fields) + quality_gate_result | Phase 2 |
| T04 | Inference config (model: `Qwen3-4B-q4f16_1-MLC`, params, think=false, dual-pass) for WebLLM client-side execution | Phase 2 |
| T05 | Pass/fail signal for reward trigger | Phase 3 |
| T07 | Pass rate metric, inference latency metric | Phase 3-4 |
| All  | Prompt version string (v2.0.0) for D1 records | Phase 2+ |

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Knowledge base coverage insufficient for cold topics | L2 RAG returns empty or irrelevant context, degrading analysis quality | Seed knowledge base with top 20 politicians, 15 media outlets, 10 active topics; monitor Vectorize query hit rate |
| Vectorize query quota exhaustion (30M dimensions/month) | Knowledge queries throttled or blocked | Monitor usage; batch queries where possible; topK=5 keeps dimension usage per query at 5120 (1024d x 5) |
| VRAM insufficient (~3.4GB required) | Users cannot run WebGPU analysis | Graceful degradation to WASM fallback or browse-only; WebGPU adapter VRAM check; suggest desktop Chrome 113+ |
| Prompt injection by local users | Garbage results in D1 | 4-layer quality gates catch anomalies; version mismatch detection; all outputs validated server-side before D1 write |
| Cold-start: Layer 3 always passes | No consistency filtering early on | Accept higher pass rate initially; tighten once history accumulates |
| Model download failure (3.4GB) | Users cannot start analysis | WebLLM auto-download to browser Cache/IndexedDB; progress UI; resume-capable |

---

**Status**: Phase 2-3 code implemented. Phase 1 gold standard awaiting project owner. Phase 4-5 post-launch.
**Last Updated**: 2026-03-08

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | 🔵 WAITING | Annotation guidelines done. Awaiting 20 gold standard articles from project owner. Knowledge base loaded (1121 entries in D1 + Vectorize). |
| Phase 2 | ✅ IMPLEMENTED | inference.js: 3-layer prompt assembly + inference + 6-field parsing (migrating to WebLLM). analyze.js: Full analysis UI + knowledge fetch + submission. All API endpoints verified (2026-03-08). Dual-pass prompt architecture: pending design. |
| Phase 3 | 🟡 PARTIAL | Quality gates L1-L2 implemented in analysis.js. L3 consistency check stubbed (needs historical data). Anti-cheat: daily limit 50, cooldown, min 5000ms. |
| Phase 4 | ⬜ NOT STARTED | Blocked on T04 PWA integration + real device testing. |
| Phase 5 | ⬜ NOT STARTED | Post-launch. |
