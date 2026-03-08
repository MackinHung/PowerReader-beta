# T03_AI_INFERENCE — Qwen3-4B WebLLM Inference & Quality Validation

## Overview

T03 owns the **AI inference specification** for PowerReader: prompt engineering, quality gates, knowledge base schema, model accuracy evaluation, and inference pipeline design.

**Important**: T03 is a **specification team** — the actual inference code lives in T04 (`inference.js`, `analyze.js`). T03 defines *what* and *how*, T04 implements it client-side.

Core responsibilities:
- Three-layer RAG prompt architecture (L1 static + L2 dynamic knowledge + L3 article input)
- 4-layer quality gate validation pipeline (format → range → consistency → duplicate)
- Knowledge base schema for Cloudflare Vectorize (bge-m3, 1024d)
- Model accuracy evaluation framework (gold standard dataset + A/B testing)
- Inference parameter specification (Qwen3-4B, think=false, t=0.5)

## Phase Status

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 1: Gold Standard Dataset | WAITING | Annotation guidelines done. Awaiting 20 gold standard articles from project owner. Knowledge base loaded (1121 entries in D1 + Vectorize). |
| Phase 2: Prompt v2.0.0 Implementation | IMPLEMENTED | 3-layer prompt assembly + Ollama inference + 6-field parsing. All API endpoints verified (2026-03-08). |
| Phase 3: Quality Gates | PARTIAL | L1-L2 implemented. L3 consistency check stubbed (needs historical data). Anti-cheat: daily limit 50, cooldown, min 5000ms. |
| Phase 4: Device Performance | NOT STARTED | Blocked on T04 PWA integration + real device testing. |
| Phase 5: A/B Testing Framework | NOT STARTED | Post-launch. |

## Document Map

| File | Purpose |
|------|---------|
| `PHASE_PLAN.md` | Phase breakdown, deliverables, cross-team dependencies, risks |
| `INFERENCE_PIPELINE.md` | End-to-end Cloudflare Workers pipeline: article ingestion, retrieval, analysis submission, knowledge CRUD. TypeScript interfaces, D1 schema, error handling |
| `PROMPT_VERSIONS.md` | **SSOT** for prompt design. v2.0.0 three-layer architecture, semantic versioning rules, injection defense, rolling changelog |
| `QUALITY_GATES.md` | 4-layer validation spec: format → range → consistency → duplicate. Short-circuit pipeline, pass rate targets (60-70%), reward integration |
| `KNOWLEDGE_BASE_SCHEMA.md` | **SSOT** for RAG knowledge base. Vectorize schema, 4 entry types (politician/topic/term/event), query strategy, quota management |
| `MODEL_ACCURACY_REPORT.md` | Living document for accuracy tracking. Gold standard dataset v2, evaluation metrics, Phase 1-7 test results, device performance benchmarks |
| `scripts/eval_gold_standard.py` | Evaluation script for running gold standard tests against the model |
| `COMMON_MISTAKES.md` | Aggregated pitfalls from all T03 docs — read before making any changes |

## Cross-Team Dependencies

### T03 Depends On

| Team | What We Need | Phase |
|------|-------------|-------|
| T02 | Crawled articles in Crawler API format (no `tokens` field) | Phase 1 |
| T01 | D1 schema, D1 read/write API, Vectorize knowledge base, Workers AI bge-m3 endpoint | Phase 2-3 |
| T04 | PWA model download (3.4GB) + local Ollama inference integration | Phase 4 |
| T05 | Pre-check gates API (duplicate + stale checks before inference) | Phase 3 |
| `shared/enums.js` | BIAS_CATEGORIES, CONTROVERSY_LEVELS, QUALITY_GATE_RESULTS, NEWS_SOURCES | Phase 2+ |
| `shared/config.js` | MODELS, ANALYSIS, REWARD constants | Phase 2+ |

### T03 Provides To

| Team | What We Provide | Phase |
|------|----------------|-------|
| T01 | Analysis output JSON schema (6 fields) + quality_gate_result | Phase 2 |
| T04 | Inference config (model: `Qwen3-4B-q4f16_1-MLC`, params, think=false) for client-side execution | Phase 2 |
| T05 | Pass/fail signal for reward trigger (`quality_gate_result === "passed"` → 0.1 pt) | Phase 3 |
| T07 | Pass rate metric, inference latency metric | Phase 3-4 |
| All | Prompt version string (v2.0.0) for D1 records | Phase 2+ |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Thinking mode | **think=false** | 4B thinking takes 170-300s with no quality improvement (+29 bias error). Not worth it. |
| 40% context rule | **Total prompt ≤ 40% of context window** (~13K tokens) | Quality degrades sharply beyond 40%. Article hard limit ~8,400 Chinese chars. |
| Embedding model | **bge-m3 only** for knowledge base | bge-small-zh (512d) is Crawler-only for topic filtering. Mixing dimensions causes Vectorize errors. |
| Few-shot examples | **Forbidden** | Small model pattern-matches instead of reasoning. Tested: spread=82 collapse with few-shot vs spread=7 without. |
| Prompt language | **Neutral framing** | No political rhetoric in prompts or knowledge entries. Describe behavior patterns, not stance judgments. Supports media literacy goal. |

## Code Locations

T03 is a specification team. Inference code lives in T04:

| Module | Location | Implements |
|--------|----------|------------|
| Inference wrapper | `T04_FRONTEND/src/inference.js` | 3-layer prompt assembly + Ollama call + JSON parse |
| Analysis UI | `T04_FRONTEND/src/analyze.js` | Full analysis flow: knowledge fetch → inference → quality gates → submission |
| Quality gates L1-L2 | `T04_FRONTEND/src/analyze.js` | Format + range validation (client-side) |
| Quality gates L3-L4 | `T01_SYSTEM_ARCHITECTURE/` (Workers) | Consistency + duplicate validation (server-side, D1) |
| Knowledge CRUD | `T01_SYSTEM_ARCHITECTURE/` (Workers) | Admin endpoints for Vectorize + D1 entries |

## Development

### Running the Evaluation Script

```bash
cd T03_AI_INFERENCE
python scripts/eval_gold_standard.py
```

Requires:
- Gold standard articles in R2 `gold-standard/v2/`
- Qwen3-4B running in browser via WebLLM (WebGPU, zero install)
- PowerReader API accessible for knowledge queries

### Modifying Prompts

1. Read `PROMPT_VERSIONS.md` — it is the SSOT
2. Follow semantic versioning (MAJOR/MINOR/PATCH)
3. Run gold standard tests before and after changes
4. Update the rolling changelog in PROMPT_VERSIONS.md
5. Notify T01, T04, T05 for MINOR+ changes

### Modifying Quality Gates

1. Read `QUALITY_GATES.md` — it is the SSOT
2. Verify changes don't break `shared/enums.js QUALITY_GATE_RESULTS`
3. Confirm T05 reward trigger conditions are preserved
4. Notify T01, T05, T07

---

**Maintainer**: T03 (AI Inference Team) | **Version**: v1.0 | **Last Updated**: 2026-03-08
