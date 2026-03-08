# T03 Common Mistakes

**Maintainer**: T03 (AI Inference Team)
**Last Updated**: 2026-03-08

> Aggregated pitfalls from all T03 specification documents. All agents working on T03 must read this file before making changes.

---

## Prompt Engineering

### Mistake 1: Using few-shot examples

- **Source**: PROMPT_VERSIONS.md
- ❌ Adding example outputs in the system prompt
- ✅ Use context injection (stance definitions + score anchors) instead; forbid all few-shot
- **Evidence**: V3 (with few-shot) bias spread=82 vs V2b (without) spread=7. Small models pattern-match instead of reasoning.

### Mistake 2: Hardcoding bias scores in prompts

- **Source**: PROMPT_VERSIONS.md
- ❌ `"自由時報通常 bias_score 在 20-30 之間"`
- ✅ Provide only the political spectrum definition; let the model judge based on article content
- **Verification**: Same media source should produce different scores for different articles.

### Mistake 3: Ignoring Taiwan political context

- **Source**: PROMPT_VERSIONS.md
- ❌ `"left = progressive, right = conservative"` (US definition)
- ✅ `0=深綠獨派, 50=中立, 100=深藍統派` (Taiwan definition)
- **Test**: Use cross-strait articles to verify the model understands Taiwan context.

### Mistake 4: Not locking the model version

- **Source**: PROMPT_VERSIONS.md
- ❌ Using `"latest"` version tag for Ollama
- ✅ Lock to `Qwen3-4B-q4f16_1-MLC` (WebLLM pre-compiled model, 4bit+fp16 quantization)
- **Warning**: Custom Modelfiles missing RENDERER+PARSER cause abnormal output. Re-run gold standard tests after any model update.

### Mistake 5: Allowing natural language wrapping around JSON

- **Source**: PROMPT_VERSIONS.md
- ❌ Not setting `response_format` — model may output `"Here is the analysis: {...}"`
- ✅ Set `response_format: { type: "json_object" }`. Quality Gates Layer 1 catches `JSON.parse()` failures as `failed_format`.

### Mistake 6: Using political rhetoric in prompts

- **Source**: PROMPT_VERSIONS.md
- ❌ `"偏綠批評型: 批評國民黨親中賣台、配合對岸"`
- ✅ `"偏綠文章傾向批評國民黨或藍營政策立場"` (neutral behavior description)
- **Principle**: The analysis framework itself must not carry stance judgments. Prompts describe *how to identify bias*, not *which rhetoric is correct*.

### Mistake 7: Enabling thinking mode

- **Source**: PROMPT_VERSIONS.md
- ❌ `think: true` for 4B model
- ✅ Always use `think: false`
- **Evidence**: think=true takes 170-300s with bias still off by +29 points. The 4B model's "thinking" quality is insufficient to improve results.

---

## Embedding & Vectors

### Mistake 8: Mixing bge-m3 and bge-small-zh in the same pipeline

- **Source**: INFERENCE_PIPELINE.md, KNOWLEDGE_BASE_SCHEMA.md
- ❌ Using bge-small-zh (512d) vectors in the Vectorize knowledge index
- ✅ bge-small-zh is ONLY for Crawler-side topic filtering. Knowledge base uses ONLY bge-m3 (1024d).
- **Detection**: Vectorize throws a dimension mismatch error — log as CRITICAL, do not proceed.

### Mistake 9: Embedding full article instead of title

- **Source**: KNOWLEDGE_BASE_SCHEMA.md
- ❌ Embedding `content_markdown` for knowledge retrieval (200-500 tokens = 200-500 neurons)
- ✅ Embed title only (10-30 tokens). Test results show title-based retrieval achieves score=0.736 accuracy.
- **Cost impact**: 10-50x higher Workers AI neuron cost with full content.

### Mistake 10: Re-querying Vectorize on every client request

- **Source**: INFERENCE_PIPELINE.md, KNOWLEDGE_BASE_SCHEMA.md
- ❌ Each client article fetch triggers a Vectorize query, exhausting 30M dimensions/month quota
- ✅ Pre-compute Layer 2 at article ingestion time, store in D1, serve pre-computed text to clients
- **Math**: 600 articles/day x 1024d = 614K dims/day at ingestion only, vs 614K x N clients.

---

## Quality Gates

### Mistake 11: Running quality gate layers in wrong order

- **Source**: QUALITY_GATES.md
- ❌ Running Layer 3 (D1 history lookups) before Layer 1 (JSON parse) — wastes I/O
- ✅ Strict order: L1 → L2 → L3 → L4. L1/L2 are pure local computation; fail-fast avoids unnecessary D1 reads.
- **Performance**: L1/L2 failure rate ~20-30%, so early short-circuit saves significant D1 reads.

### Mistake 12: Not validating category-score consistency

- **Source**: QUALITY_GATES.md
- ❌ Accepting `bias_score: 75` with `bias_category: "center"` — mismatch goes undetected
- ✅ Use `getBiasCategory(score)` to recompute expected category; compare with model output.
- **Root cause**: Small models sometimes "memorize" common score-category combos instead of computing them.

### Mistake 13: Running outlier detection with fewer than 3 samples

- **Source**: QUALITY_GATES.md
- ❌ Computing standard deviation with 1-2 data points
- ✅ Skip outlier detection when `allScores.length < 3`, pass automatically
- **Math**: Standard deviation of 2 points cannot represent a meaningful distribution.

### Mistake 14: Using byte length instead of character length for reasoning

- **Source**: QUALITY_GATES.md
- ❌ `Buffer.byteLength(reasoning)` — CJK characters are 3 bytes in UTF-8, triggering premature length limit
- ✅ Use `string.length` (JavaScript character count). "兩岸和平" = 4 characters (correct) vs 12 bytes (wrong).

### Mistake 15: Using local time for stale article checks

- **Source**: QUALITY_GATES.md
- ❌ Comparing `published_at` against client local time — timezone differences break 72h cutoff
- ✅ `published_at` uses ISO 8601 with timezone (`+08:00`); always convert to UTC for comparison.

### Mistake 16: Not monitoring pass rate anomalies

- **Source**: QUALITY_GATES.md
- ❌ Ignoring pass rate > 70% as "good news"
- ✅ Pass rate > 70% may mean validation is too loose or users found an exploit. Trigger T07 alert for manual review.
- **Pattern**: High pass rate + low score variance = possible batch-scoring script.

---

## Infrastructure

### Mistake 17: Storing content_markdown in D1

- **Source**: INFERENCE_PIPELINE.md
- ❌ Putting full article text in D1 — 5GB free tier fills quickly
- ✅ Store `content_markdown` in R2 (10GB free, unlimited egress). Keep only metadata + `layer2_text` in D1.
- **Estimate**: 600 articles/day x 5KB avg = ~90MB/month in R2.

### Mistake 18: Using in-memory rate limiting

- **Source**: INFERENCE_PIPELINE.md
- ❌ In-memory counters in Workers — reset on every request (Workers are stateless)
- ✅ Persist rate limits in D1 with periodic cleanup. KV's 1000 writes/day free tier is too low for rate limit counters.

### Mistake 19: Exposing quality gate internal details to users

- **Source**: INFERENCE_PIPELINE.md
- ❌ Returning threshold values, comparison algorithms, or `reason` field in HTTP responses
- ✅ Map all failures to generic user-facing messages via `getQualityGateUserMessage()`. The `reason` field is server-side logging only.
- **Reference**: T06 ERROR_HANDLING.md v1.1

### Mistake 20: Not handling R2 read failures gracefully

- **Source**: INFERENCE_PIPELINE.md
- ❌ Entire article fetch fails when R2 is temporarily unavailable
- ✅ Return degraded response with article summary from D1 + `degraded: true` flag

---

## Knowledge Base

### Mistake 21: Adding subjective stance labels to knowledge entries

- **Source**: KNOWLEDGE_BASE_SCHEMA.md
- ❌ `"許美華，立場偏綠，常批評國民黨"` — subjective descriptions
- ✅ `"許美華，科技專家與政治評論者"` — factual only
- **Principle**: Knowledge entries provide facts (party, position, policy stance). They must not prescribe bias conclusions. This supports the media literacy (媒體識讀) goal.

### Mistake 22: Hardcoding bias scores in knowledge entries

- **Source**: KNOWLEDGE_BASE_SCHEMA.md
- ❌ Including `bias_score: 25` or `tendency_score: 30` in entry text
- ✅ Provide facts (party, stance, actions) — let the model judge
- **Impact**: Model learns to copy scores instead of analyzing article content.

---

## Evaluation Methodology

### Mistake 23: Only looking at aggregate accuracy

- **Source**: MODEL_ACCURACY_REPORT.md
- ❌ `"Overall F1=0.72"` — `extreme_left` might be 0.0
- ✅ Break down P/R/F1 per bias category. Watch for blind spots at extremes.

### Mistake 24: Skewed evaluation dataset

- **Source**: MODEL_ACCURACY_REPORT.md
- ❌ 20 articles with 15 from the same source
- ✅ Balanced distribution: 5+ sources, all 7 BIAS_CATEGORIES represented, all 4 CONTROVERSY_LEVELS.

### Mistake 25: Not recording prompt version with test results

- **Source**: MODEL_ACCURACY_REPORT.md
- ❌ `"Accuracy improved"` — which prompt version?
- ✅ Always record `prompt_version` in the version tracking table. Every test run must be traceable.

### Mistake 26: Only benchmarking on high-end devices

- **Source**: MODEL_ACCURACY_REPORT.md
- ❌ M3 MacBook always completes in <1s — not representative
- ✅ Test across 3 device tiers: high-end (<3s), mid-tier (3-6s), low-end (6-10s target). Verify ~4GB runtime RAM.

---

**Total**: 26 common mistakes (28 raw entries, 2 duplicates merged across documents)

**Source documents**:
- `PROMPT_VERSIONS.md` — Mistakes 1-7
- `KNOWLEDGE_BASE_SCHEMA.md` — Mistakes 8-9 (partial), 21-22
- `INFERENCE_PIPELINE.md` — Mistakes 8 (partial), 10, 17-20
- `QUALITY_GATES.md` — Mistakes 11-16
- `MODEL_ACCURACY_REPORT.md` — Mistakes 23-26
