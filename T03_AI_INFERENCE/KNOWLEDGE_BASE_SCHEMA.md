# Knowledge Base Schema (Cloudflare Vectorize)

## Navigation
- **Upstream**: CLAUDE.md, MASTER_ROADMAP.md, T01_SYSTEM_ARCHITECTURE/CLOUDFLARE_ARCHITECTURE.md
- **Downstream**: T03_AI_INFERENCE/PROMPT_VERSIONS.md (Layer 2 format), T01_SYSTEM_ARCHITECTURE/API_ROUTES.md (knowledge CRUD endpoints)
- **Maintainer**: T03 (AI Inference Team)
- **Type**: SSOT (Knowledge Base Structure)
- **Last Updated**: 2026-03-07

---

## Purpose

Defines the **structure, schema, and retrieval strategy** for the RAG Layer 2 knowledge base used by Qwen3-4B inference.

All knowledge entries are embedded by Cloudflare Workers AI `@cf/baai/bge-m3` (1024d) and stored in Cloudflare Vectorize for cosine similarity retrieval.

---

## Architecture Overview

```
Article arrives at PowerReader
  → Workers embeds article title via bge-m3 (1024d)
  → Vectorize cosine similarity search (topK=5)
  → Retrieved knowledge entries formatted as Layer 2 prompt text
  → Client receives article + Layer 2 context
  → Client assembles L1 + L2 + L3 → Qwen3-4B WebLLM inference
```

### Embedding Pipeline

| Step | Component | Details |
|------|-----------|---------|
| Embed | Workers AI `@cf/baai/bge-m3` | 1024 dimensions, GPU on edge |
| Store | Cloudflare Vectorize | Index: `powerreader-knowledge` |
| Query | Vectorize query API | topK=5, cosine similarity |
| Cost | ~1.6 neurons/embedding | Free tier: 10K neurons/day |

### Context Window Budget (40% Rule)

Qwen3-4B context = 32,768 tokens. **Total prompt input must stay under 40%** (~13,107 tokens).

| Component | Est. Tokens | Budget % |
|-----------|------------|----------|
| L1 System Prompt | ~400-700 | ~2% |
| **L2 RAG (5 entries)** | **~300-450** | **~1.4%** |
| Instructions + prefix | ~100 | ~0.3% |
| L3 Article text | ≤11,800 | ≤36% |

**Article hard limit**: ~8,400 Chinese chars. Articles exceeding this must be truncated.

### Query Strategy

**Input**: Article title (NOT full content — title is more information-dense and cheaper to embed)

**Why title only**:
- Title captures the core topic in 10-30 tokens
- Full content would consume 200-500 tokens worth of neurons
- Test results show title-based retrieval achieves score=0.736 accuracy (Phase 7 MVP)
- Cost: 1 embedding per article vs 3-5 for chunked content

---

## Knowledge Categories

> **Design Decision**: Media tendency labels (偏藍/偏綠) were removed from the knowledge base.
> Labeling media outlets with political tendency scores contradicts the project's core goal of
> media literacy (媒體識讀). The model should analyze article content objectively, not pre-judge
> based on media source. Politicians, topics, terms, and events provide factual context that
> assists analysis without prescribing conclusions.

4 categories: **politician**, **topic**, **term**, **event**.

### 1. Politicians (`type: "politician"`)

**Schema**:

```json
{
  "id": "pol_lai_ching_te",
  "type": "politician",
  "text": "賴清德，民進黨，現任中華民國總統，主張台灣主體性與國防自主，支持對美軍購強化防衛能力",
  "metadata": {
    "name": "賴清德",
    "party": "DPP",
    "position": "總統",
    "stance_tags": ["本土派", "國防自主", "台美關係"],
    "bias_hint": "green",
    "active": true
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID: `pol_{romanized_name}` |
| `type` | string | Yes | Always `"politician"` |
| `text` | string | Yes | Natural language description for embedding + L2 prompt injection |
| `metadata.name` | string | Yes | Full Chinese name |
| `metadata.party` | string | Yes | Party code: `DPP`, `KMT`, `TPP`, `IND` |
| `metadata.position` | string | Yes | Current position/title |
| `metadata.stance_tags` | string[] | Yes | Key stance keywords |
| `metadata.bias_hint` | string | Yes | `green`, `blue`, `neutral`, `mixed` |
| `metadata.active` | boolean | Yes | Whether currently politically active |

**Entry Guidelines**:
- `text` must be one sentence, 30-80 chars, include party + position + key stance
- Never hardcode bias scores in `text` — only provide facts
- Retired politicians should have `active: false` but remain in knowledge base

### 2. Topics (`type: "topic"`)

**Schema**:

```json
{
  "id": "top_military_procurement",
  "type": "topic",
  "text": "對美軍購與國防預算：民進黨主張國防自主、加速對美軍購強化台海防禦；國民黨主張監督預算、要求美方正式報價才編列、反對特別條例跳過常規審查。爭議程度極高，涉及國家安全核心",
  "metadata": {
    "name": "對美軍購與國防預算",
    "green_stance": "國防自主、加速軍購",
    "blue_stance": "監督預算、要求LOA、反特別條例",
    "controversy_level": "very_high",
    "category": "defense"
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | `top_{english_topic}` |
| `type` | string | Yes | Always `"topic"` |
| `text` | string | Yes | Full description with both sides |
| `metadata.name` | string | Yes | Topic name in Chinese |
| `metadata.green_stance` | string | Yes | DPP/green camp position |
| `metadata.blue_stance` | string | Yes | KMT/blue camp position |
| `metadata.controversy_level` | string | Yes | `low`, `moderate`, `high`, `very_high` |
| `metadata.category` | string | Yes | Topic category for filtering |

### 3. Taiwan-Specific Terms (`type: "term"`)

**Schema**:

```json
{
  "id": "term_loa",
  "type": "term",
  "text": "發價書(LOA)是美國對外軍售的正式報價文件，台美軍購需經LOR申請→美方跨部會審查→國會通過→發出LOA的完整流程",
  "metadata": {
    "name": "發價書 (LOA)",
    "full_name": "Letter of Offer and Acceptance",
    "political_context": "國防預算爭議的核心概念",
    "category": "defense"
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | `term_{english_term}` |
| `type` | string | Yes | Always `"term"` |
| `text` | string | Yes | Definition with political context |
| `metadata.name` | string | Yes | Term in Chinese |
| `metadata.full_name` | string | No | Full name / English equivalent |
| `metadata.political_context` | string | Yes | Why this term matters politically |
| `metadata.category` | string | Yes | Topic category |

### 4. Recent Events (`type: "event"`)

**Schema**:

```json
{
  "id": "evt_2026_defense_budget",
  "type": "event",
  "text": "2026年國防預算審查：行政院提出1.25兆八年期國防特別預算條例，國民黨版3800億+N限定有LOA項目。立法院攻防焦點為預算規模與審查程序透明度",
  "metadata": {
    "name": "2026年國防預算審查",
    "date_range": "2026-01 ~ 2026-06",
    "parties_involved": ["DPP", "KMT"],
    "controversy_level": "very_high",
    "category": "defense",
    "expires_at": "2026-12-31"
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | `evt_{year}_{event}` |
| `type` | string | Yes | Always `"event"` |
| `text` | string | Yes | Event description with context |
| `metadata.name` | string | Yes | Event name |
| `metadata.date_range` | string | Yes | When the event is relevant |
| `metadata.parties_involved` | string[] | Yes | Parties involved |
| `metadata.controversy_level` | string | Yes | Same scale as topics |
| `metadata.category` | string | Yes | Topic category |
| `metadata.expires_at` | string | No | After this date, lower retrieval priority |

---

## Vectorize Index Configuration

```javascript
// Vectorize index creation
const index = {
  name: "powerreader-knowledge",
  config: {
    dimensions: 1024,        // bge-m3 output
    metric: "cosine",        // cosine similarity
  }
};
```

### Vector Storage Format

Each vector in Vectorize:

```javascript
{
  id: "pol_lai_ching_te",           // unique entry ID
  values: [0.012, -0.034, ...],      // 1024d bge-m3 embedding of `text`
  metadata: {
    type: "politician",              // for filtering
    text: "賴清德，民進黨...",        // original text for L2 injection
    name: "賴清德",                   // for display
    party: "DPP",                    // for filtering
    bias_hint: "green",              // for transparency panel
    updated_at: "2026-03-07"         // for staleness tracking
  }
}
```

### Query API

```javascript
const EMPTY_KNOWLEDGE = { layer2_text: "", entries: [] };
const MAX_TITLE_LENGTH = 200;

/**
 * Retrieve knowledge context for an article via Vectorize similarity search.
 * Follows ERROR_HANDLING.md patterns for Cloudflare infrastructure errors.
 *
 * @param {string} articleTitle - Article title to embed and search
 * @param {object} env - Cloudflare Workers env bindings (AI, VECTORIZE)
 * @returns {{ layer2_text: string, entries: Array<{id, type, name, score}> }}
 */
async function getKnowledgeContext(articleTitle, env) {
  // Input validation: sanitize and reject empty titles
  const sanitizedTitle = (articleTitle || '').slice(0, MAX_TITLE_LENGTH).trim();
  if (!sanitizedTitle) {
    return EMPTY_KNOWLEDGE;
  }

  try {
    // 1. Embed article title (with retry — max 2 attempts, exponential backoff)
    //    See ERROR_HANDLING.md: workers_ai_inference_failed recovery strategy
    let embedding;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        embedding = await env.AI.run("@cf/baai/bge-m3", {
          text: [sanitizedTitle]
        });
        break;
      } catch (aiErr) {
        if (attempt === 1) throw aiErr;  // re-throw on final attempt
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    // 2. Query Vectorize
    const results = await env.VECTORIZE.query(embedding.data[0], {
      topK: 5,
      returnValues: false,     // save bandwidth
      returnMetadata: "all"
    });

    // 3. Format as Layer 2 prompt text
    const l2Lines = results.matches.map(match => {
      const m = match.metadata;
      const tag = {
        politician: "人物",
        topic: "議題",
        term: "名詞",
        event: "事件"
      }[m.type] || "其他";
      return `- [${tag}] ${m.text}`;
    });

    return {
      layer2_text: "[背景知識]\n" + l2Lines.join("\n"),
      entries: results.matches.map(m => ({
        id: m.id,
        type: m.metadata.type,
        name: m.metadata.name,
        score: m.score
      }))
    };
  } catch (err) {
    // Vectorize dimension mismatch — CRITICAL, indicates embedding model inconsistency
    // See ERROR_HANDLING.md: vectorize_dimension_mismatch
    if (err.message && err.message.includes('dimension')) {
      console.error("[CRITICAL][getKnowledgeContext] vectorize_dimension_mismatch:", err.message);
      throw err;  // must not degrade — embedding model mismatch is a system-level error
    }

    // Vectorize quota exceeded — graceful degradation
    // See ERROR_HANDLING.md: vectorize_quota_exceeded
    if (err.message && err.message.includes('quota')) {
      console.warn("[getKnowledgeContext] vectorize_quota_exceeded — degrading to no-knowledge mode");
      return EMPTY_KNOWLEDGE;
    }

    // Workers AI failure or other errors — graceful degradation, return empty L2
    // See ERROR_HANDLING.md: workers_ai_inference_failed
    console.error("[getKnowledgeContext] Knowledge retrieval failed, returning empty L2:", err.message);
    return EMPTY_KNOWLEDGE;
  }
}
```

---

## Layer 2 Prompt Output Format

The retrieved knowledge is formatted as a text block injected between L1 (system prompt) and L3 (article input):

```
[背景知識]
- [人物] 吳宗憲，國民黨，宜蘭縣長參選人，前立法委員，推動育嬰與婦女權益政策
- [議題] 育嬰與托育政策：跨黨派共識較高的社會福利議題，藍綠都有提出相關政見，爭議性較低
- [人物] 林國漳，民進黨，宜蘭縣長參選人，與吳宗憲競爭宜蘭縣長席位
- [議題] 縣市長選舉與地方政治：藍綠在各縣市提名候選人競爭
- [人物] 林姿妙，國民黨，前宜蘭縣長，任內推動一鄉鎮一親子館政策
```

### Transparency

Users can expand the Layer 2 section to view:
1. What knowledge entries were retrieved
2. Cosine similarity scores
3. Entry types and sources

This builds trust in the analysis process.

---

## Seed Data (v1 — 23 Entries)

### Politicians (15)

| ID | Name | Party | Key Stance |
|----|------|-------|-----------|
| pol_lai_ching_te | 賴清德 | DPP | 總統，台灣主體性，國防自主 |
| pol_hsiao_bi_khim | 蕭美琴 | DPP | 副總統，台美關係 |
| pol_ker_chien_ming | 柯建銘 | DPP | 黨團總召，國防預算 |
| pol_fu_kun_chi | 傅崐萁 | KMT | 黨團總召，監督國防預算 |
| pol_cheng_li_wen | 鄭麗文 | KMT | 立委，國防預算審查 |
| pol_han_kuo_yu | 韓國瑜 | KMT | 立法院長，兩岸和平 |
| pol_ko_wen_je | 柯文哲 | TPP | 民眾黨主席，超越藍綠 |
| pol_wu_tsung_hsien | 吳宗憲 | KMT | 宜蘭參選人，育嬰政策 |
| pol_lin_kuo_chang | 林國漳 | DPP | 宜蘭參選人 |
| pol_lin_tzu_miao | 林姿妙 | KMT | 前宜蘭縣長 |
| pol_hsu_mei_hua | 許美華 | - | 科技專家，政治評論者 |
| pol_tsai_ing_wen | 蔡英文 | DPP | 前總統，國防自主 |
| pol_chu_li_lun | 朱立倫 | KMT | 黨主席，九二共識 |
| pol_hou_yu_ih | 侯友宜 | KMT | 前新北市長 |
| pol_lu_shiow_yen | 盧秀燕 | KMT | 台中市長 |

### Topics (8)

| ID | Name | Controversy |
|----|------|-------------|
| top_military_procurement | 對美軍購與國防預算 | very_high |
| top_cross_strait | 兩岸關係 | very_high |
| top_childcare | 育嬰與托育政策 | low |
| top_local_elections | 縣市長選舉 | moderate |
| top_drug_safety | 毒品與公共安全 | low |
| top_loa_explainer | 發價書 (LOA) | high |
| top_defense_budget_bill | 國防特別預算條例 | very_high |
| top_gender_equality | 女性權益與職場平等 | moderate |

---

## Knowledge Base Expansion Plan

### Current: 23 entries (MVP verified)
### Target v1.0: 80+ entries

**Expansion priorities**:

1. **More politicians** (~30 additional):
   - All current legislators with high media visibility
   - County/city mayors
   - Party leadership

2. **More topics** (~20 additional):
   - Energy policy (nuclear vs renewable)
   - Pension reform
   - Education curriculum
   - Digital privacy / AI regulation
   - Immigration policy
   - Housing policy
   - Labor rights

3. **Terms** (~20 new category):
   - 九二共識 (92 Consensus)
   - 中華民國 vs 台灣 naming
   - 公投 (Referendum)
   - 轉型正義 (Transitional Justice)
   - 統獨光譜

4. **Events** (~20 new category):
   - Ongoing legislative battles
   - Election cycles
   - Cross-strait incidents
   - Updated as needed by Crawler team

### Expansion Rules

1. Each new entry MUST have all required fields filled
2. `text` field must be concise (30-100 chars) and factual
3. No bias scores hardcoded in entry text
4. All entries reviewed by project owner before indexing
5. After major expansion (>20 entries), re-run gold standard test

---

## Quota Management

### Vectorize Limits (Free Tier)

| Resource | Limit | Current Usage | % |
|----------|-------|---------------|---|
| Stored vectors | 200,000 | 23 | 0.01% |
| Query dimensions/month | 30M | ~18.4M est. | 61% |
| Namespaces | 1 | 1 | 100% |

### Query Budget

- Each article ingestion: 1 query (title embedding → top-5)
- 600 articles/day × 1024 dimensions = 614,400 dimensions/day
- Monthly: ~18.4M dimensions (61% of 30M limit)
- **Buffer**: 39% remaining for client-side re-queries

### Cost Optimization

1. **Cache Layer 2 results**: When article is ingested, compute and store the Layer 2 text in D1. Client reads pre-computed context, avoiding Vectorize re-query.
2. **Batch embedding**: Embed new knowledge entries in batches to minimize Workers AI calls.
3. **TTL for events**: Expired events get lower priority but are not deleted (historical reference).

---

## Common Mistakes

### Mistake 1: Embedding full article instead of title
- **Problem**: Full content = 200-500 tokens = 200-500 neurons. Title = 10-30 tokens.
- **Impact**: 10-50x higher Workers AI cost
- **Correct**: Always embed title only for retrieval

### Mistake 2: Hardcoding bias scores in knowledge entries
- **Problem**: Model learns to copy scores instead of analyzing
- **Correct**: Provide facts (party, stance, actions) — let model judge

### Mistake 3: Not pre-computing Layer 2 at ingestion time
- **Problem**: Every client request triggers a Vectorize query → quota exhaustion
- **Correct**: Compute Layer 2 once at article ingestion, store in D1, serve to clients

### Mistake 4: 知識庫條目帶有主觀立場標籤
- **Problem**: 條目使用「立場偏綠」「常批評某黨」等主觀描述
- **Impact**: 模型會學習到偏見而非分析能力；違反媒體識讀原則
- **Correct**: 只提供事實 (黨籍、職位、政策主張)，不做立場標註
- **Example**: ❌ "許美華，立場偏綠，常批評國民黨" → ✅ "許美華，科技專家與政治評論者"

### Mistake 5: Mixing bge-m3 and bge-small-zh vectors
- **Problem**: 1024d vs 512d vectors in same index → cosine similarity meaningless
- **Correct**: bge-small-zh is ONLY for Crawler-side topic filtering. Knowledge base uses ONLY bge-m3.

---

## Change Log

| Version | Date | Changes | Reason |
|---------|------|---------|--------|
| v1.0 | 2026-03-07 | Initial schema: 5 categories, 31 seed entries, Vectorize config | T03 knowledge base design |
| v1.1 | 2026-03-07 | Removed media category — contradicts media literacy goal | Project owner decision |
| v1.2 | 2026-03-07 | `getKnowledgeContext()`: added input validation (MAX_TITLE_LENGTH=200, empty title guard), Workers AI exponential backoff retry (max 2 attempts), try-catch error handling per ERROR_HANDLING.md (vectorize_dimension_mismatch=CRITICAL throw, vectorize_quota_exceeded=graceful degradation, workers_ai_inference_failed=empty L2) | T06 compliance audit H-09, H-10 |

---

**Maintainer**: T03 (AI Inference Team)
**Last Updated**: 2026-03-07
**Next Review**: After knowledge base expansion to 100+ entries
