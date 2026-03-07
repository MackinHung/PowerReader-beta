# Deduplication Logic - Two-Layer SHA256 + bge Semantic Specification

## Navigation
- **Upstream docs**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js, T02 CRAWLER_SPEC.md
- **Downstream docs**: T01 KV_SCHEMA.md (writes content_hash, similarity_cluster, similarity_score, article_type), T03 QUALITY_GATES.md
- **Maintainer**: T02 (Data Acquisition Team)
- **Type**: Technical Specification
- **Last updated**: 2026-03-07

---

## Document Purpose
This is the **complete technical specification for news article deduplication logic**.
It defines the two-layer deduplication pipeline: SHA256 exact dedup followed by
bge-small-zh cosine semantic dedup, plus similarity threshold classification,
clustering logic, primary selection, and edge case handling.

**Supersedes**: Previous MinHash + LSH specification (removed per Decision #007: CKIP BERT removed).

**Threshold values SSOT**: `shared/config.js` `ANALYSIS` section
**Article type definitions SSOT**: `shared/enums.js` `ARTICLE_TYPES`

**Notify before modifying this file**: T01, T03

---

## Problem Description

### Why Deduplication?

Taiwan mainstream media covering the same event produces highly similar articles:

1. **Wire service syndication**: CNA (Central News Agency) dispatches are reprinted near-verbatim by multiple outlets, with only headline and lead paragraph changes.
2. **Rewrites**: Different reporters cover the same press conference or event, producing overlapping content with different wording.
3. **Different angles**: Same event, different editorial angles with partial content overlap but distinct perspectives.
4. **Original**: Exclusive reports, investigative journalism, editorials with no content overlap.

The goal of dedup is **not to delete duplicates**, but to **classify and cluster**:
- Identify which articles discuss the same event
- Distinguish "verbatim copy" vs "rewrite" vs "different angle" vs "original"
- Provide cluster basis for downstream cross-media stance comparison

### Deduplication in the Pipeline

```
Article status flow (from shared/enums.js ARTICLE_STATUS):

  crawled → cleaned → deduplicated → analyzed → validated → published
                       ^^^^^^^^^^^
                       This document defines this step
```

Input: `cleaned` status articles (markdown content available)
Output: `deduplicated` or `duplicate` status articles (with similarity fields)

---

## Algorithm Overview: Two-Layer Dedup

### Why Two Layers?

| Layer | Method | Purpose | Complexity |
|-------|--------|---------|------------|
| Layer 1 | SHA256 hash | Exact duplicate detection | O(n) |
| Layer 2 | bge-small-zh cosine | Semantic similarity detection | O(n^2), n~50 |

### Why NOT MinHash + LSH Anymore?

The previous specification used CKIP BERT tokens + MinHash + LSH. This has been **removed** for the following reasons:

1. **Scale mismatch**: MinHash + LSH is designed for millions of documents. We process ~50 articles per crawler run. At this scale, pairwise comparison is trivially fast.
2. **Bag-of-words limitation**: MinHash operates on N-gram sets (order independent). This means "柯文哲批評賴清德" and "賴清德批評柯文哲" produce nearly identical N-gram sets despite having opposite meaning.
3. **CKIP BERT removed** (Decision #007): The tokenizer that fed MinHash is no longer available.
4. **Character-level N-grams for Chinese are noisy**: Without proper tokenization, character N-grams produce too many false positives.
5. **bge-small-zh is already loaded**: The model is loaded in memory for topic filtering (Stage 2), so using it for semantic dedup adds ZERO additional model loading cost.
6. **Semantic embeddings are superior**: bge-small-zh produces dense vectors that capture word order, context, and meaning -- everything MinHash cannot.

---

## Detailed Pipeline

### Layer 1: SHA256 Exact Dedup

Fast O(1) lookup to catch exact copies, syndication reprints, and AMP duplicates.

```javascript
import { createHash } from 'crypto';

/**
 * Normalize markdown text for SHA256 hashing.
 * Strips formatting noise so that cosmetically different
 * but content-identical articles produce the same hash.
 *
 * @param {string} markdown - Raw article markdown
 * @returns {string} - Normalized text for hashing
 */
function normalizeForHash(markdown) {
  return markdown
    .toLowerCase()
    .replace(/\s+/g, '')       // Remove all whitespace
    .replace(/[​‌‍﻿]/g, '')    // Remove zero-width characters
    .replace(/\u00A0/g, '');   // Remove non-breaking spaces
}

/**
 * Compute SHA256 hash of normalized article content.
 *
 * @param {string} markdown - Article markdown content
 * @returns {string} - 64-character hex SHA256 hash
 */
function computeContentHash(markdown) {
  const normalized = normalizeForHash(markdown);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Check if an article is an exact duplicate.
 * Looks up the content hash against existing hashes in D1.
 *
 * @param {string} contentHash - SHA256 hash of the new article
 * @param {D1Database} db - Cloudflare D1 database
 * @returns {Promise<{isDuplicate: boolean, existingArticleId: string|null}>}
 */
async function checkExactDuplicate(contentHash, db) {
  const row = await db.prepare(
    'SELECT article_id FROM article_hashes WHERE content_hash = ? AND expires_at > ?'
  ).bind(contentHash, new Date().toISOString()).first();

  return {
    isDuplicate: row !== null,
    existingArticleId: row ? row.article_id : null
  };
}
```

**What Layer 1 catches**:
- Wire service reprints (CNA articles copied verbatim)
- AMP vs desktop versions of the same article
- Syndicated content across outlet networks
- Re-crawled articles (URL changed but content identical)

**Storage**: Content hashes stored in D1 with TTL (configurable via `CRAWLER.CACHE_DURATION_HOURS`).

### Layer 2: bge-small-zh Cosine Semantic Dedup

For articles that pass Layer 1 (not exact duplicates), compute semantic similarity
using the bge-small-zh model that is already loaded for topic filtering.

```javascript
/**
 * Encode article markdown into a 512-dimensional dense vector
 * using bge-small-zh-v1.5.
 *
 * The model is ALREADY loaded in memory for Stage 2 topic filtering,
 * so this call adds ZERO model loading overhead.
 *
 * @param {string} markdown - Full article markdown content
 * @param {Object} bgeModel - Pre-loaded bge-small-zh-v1.5 model instance
 * @returns {Float32Array} - 512-dimensional embedding vector
 */
function encodeArticle(markdown, bgeModel) {
  // bge-small-zh expects plain text, not markdown
  const plainText = stripMarkdown(markdown);
  return bgeModel.encode(plainText);
}

/**
 * Compute cosine similarity between two vectors.
 *
 * @param {Float32Array} vecA - 512d embedding
 * @param {Float32Array} vecB - 512d embedding
 * @returns {number} - Cosine similarity (0.0 - 1.0 for normalized vectors)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Compute pairwise cosine similarity matrix for a batch of articles.
 *
 * At ~50 articles/run, this is 1,225 comparisons -- trivially fast.
 * No need for approximate methods (LSH, HNSW, etc.) at this scale.
 *
 * @param {Array<{hash: string, vector: Float32Array}>} articles
 * @returns {Array<{hashA: string, hashB: string, similarity: number}>}
 *   Only pairs with similarity >= SIMILARITY_ORIGINAL_THRESHOLD
 */
function computeSimilarityPairs(articles) {
  const THRESHOLD = ANALYSIS.SIMILARITY_ORIGINAL_THRESHOLD;
  const pairs = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const similarity = cosineSimilarity(
        articles[i].vector,
        articles[j].vector
      );

      if (similarity >= THRESHOLD) {
        pairs.push({
          hashA: articles[i].hash,
          hashB: articles[j].hash,
          similarity
        });
      }
    }
  }

  return pairs;
}
```

**Model details**:
- Model: `BAAI/bge-small-zh-v1.5`
- Dimensions: 512
- Size: ~130MB
- Runtime: CPU (GitHub Actions)
- Already loaded for topic filtering -- ZERO additional cost

---

## Similarity Thresholds and Article Classification

Threshold values from `shared/config.js` `ANALYSIS` section (SSOT, no hardcoding):

```javascript
// shared/config.js (SSOT - DO NOT redefine elsewhere!)
SIMILARITY_ORIGINAL_THRESHOLD: 0.50,   // < 50% = original
SIMILARITY_DIFFERENT_ANGLE_THRESHOLD: 0.50,  // 50-80% = different_angle
SIMILARITY_REWRITE_THRESHOLD: 0.80,    // 80-95% = rewrite
SIMILARITY_DUPLICATE_THRESHOLD: 0.95,  // > 95% = duplicate
// NOTE: These are bge cosine thresholds, NOT Jaccard thresholds!
// Cosine similarity on dense embeddings produces different ranges than Jaccard on N-gram sets.
```

Article type definitions from `shared/enums.js` `ARTICLE_TYPES` (SSOT):

| Article Type | Enum Key | Cosine Range | Description | Action |
|-------------|----------|-------------|-------------|--------|
| Original | `ARTICLE_TYPES.ORIGINAL` | < 0.50 | No significant similarity to existing articles | Normal analysis pipeline |
| Different Angle | `ARTICLE_TYPES.DIFFERENT_ANGLE` | 0.50 - 0.80 | Same event, different reporting angle | Normal analysis, assign to same cluster |
| Rewrite | `ARTICLE_TYPES.REWRITE` | 0.80 - 0.95 | Highly similar, only wording changes | Normal analysis, mark as rewrite |
| Duplicate | `ARTICLE_TYPES.DUPLICATE` | > 0.95 | Near-verbatim copy | Discard or mark as secondary |

```javascript
// Use shared/enums.js getArticleType() function (SSOT)
import { getArticleType, ARTICLE_TYPES } from '../shared/enums.js';
import { ANALYSIS } from '../shared/config.js';

function classifyArticle(similarity) {
  // Use SSOT function, DO NOT implement classification logic yourself!
  return getArticleType(similarity);
}
```

### Threshold Design Rationale

```
0.0          0.50          0.80          0.95          1.0
 |------------|-------------|-------------|-------------|
   ORIGINAL    DIFFERENT_ANGLE   REWRITE      DUPLICATE
   Exclusive     Same event,      Rewording    Verbatim
   reporting     different angle  of same text  copy

   Normal        Normal +         Normal +     Status=duplicate
   analysis      cluster          mark rewrite (terminal, skip analysis)
```

**IMPORTANT**: These thresholds are STARTING VALUES for bge cosine similarity.
They must be calibrated using real Taiwan news articles. bge cosine thresholds
behave differently from Jaccard thresholds:
- Jaccard 0.85 (old duplicate threshold) != Cosine 0.85
- Dense embeddings tend to produce higher similarity scores for unrelated text
- Calibration protocol: Run against 100+ known duplicate/rewrite/original pairs

---

## Clustering Logic (Similarity Clustering)

### Clustering Purpose

Group articles covering the same event into a `similarity_cluster`,
so downstream cross-media stance comparison (T03/T04) can quickly find
"different media reports on the same event".

### Clustering Algorithm: Union-Find (Disjoint Set)

```javascript
/**
 * Union-Find cluster
 *
 * When two articles have cosine similarity >= SIMILARITY_ORIGINAL_THRESHOLD (0.50),
 * they are merged into the same cluster.
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    // Path compression (creates new mapping, does not mutate original)
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    // Union by rank
    const rankX = this.rank.get(rootX);
    const rankY = this.rank.get(rootY);
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

/**
 * Cluster a batch of articles based on cosine similarity pairs.
 *
 * @param {Array<{hashA: string, hashB: string, similarity: number}>} pairs
 *   Pre-computed similarity pairs (from computeSimilarityPairs)
 * @param {Array<string>} allHashes - All article hashes in this batch
 * @returns {Map<string, string>} - article_hash -> cluster_id
 */
function clusterArticles(pairs, allHashes) {
  const uf = new UnionFind();

  // Initialize all articles (ensures singletons get their own cluster)
  for (const hash of allHashes) {
    uf.find(hash);
  }

  // Merge articles that exceed the threshold
  for (const { hashA, hashB } of pairs) {
    uf.union(hashA, hashB);
  }

  // Generate cluster IDs
  const clusterMap = new Map();
  for (const hash of allHashes) {
    const root = uf.find(hash);
    clusterMap.set(hash, `cluster_${root}`);
  }

  return clusterMap;
}
```

### Cluster ID Naming Convention

```
cluster_{earliest_article_hash_in_cluster}
```

Uses the earliest article hash in the cluster as the cluster ID,
ensuring cluster IDs remain stable when new articles join.

---

## Primary Selection

After clustering, select the "primary" article from each cluster.
All others are marked as secondary.

```javascript
/**
 * Select the primary article from each cluster.
 *
 * Selection criteria (in priority order):
 * 1. Longest content (character count)
 * 2. If tied: prefer HIGH priority source (from NEWS_SOURCES priority)
 * 3. If tied: prefer earliest publish time
 *
 * @param {Map<string, string>} clusterMap - article_hash -> cluster_id
 * @param {Array<Object>} articles - Full article objects
 * @returns {Map<string, boolean>} - article_hash -> is_primary
 */
function selectPrimaryArticles(clusterMap, articles) {
  // Group articles by cluster
  const clusters = new Map();
  for (const article of articles) {
    const clusterId = clusterMap.get(article.article_hash);
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId).push(article);
  }

  const primaryMap = new Map();

  for (const [clusterId, clusterArticles] of clusters) {
    // Sort by selection criteria
    const sorted = [...clusterArticles].sort((a, b) => {
      // 1. Longest content first
      const charDiff = (b.char_count || 0) - (a.char_count || 0);
      if (charDiff !== 0) return charDiff;

      // 2. Higher source priority first
      const priorityDiff = (getSourcePriority(b.source) || 0)
                         - (getSourcePriority(a.source) || 0);
      if (priorityDiff !== 0) return priorityDiff;

      // 3. Earliest publish time first
      return new Date(a.published_at) - new Date(b.published_at);
    });

    // First is primary, rest are secondary
    for (let i = 0; i < sorted.length; i++) {
      primaryMap.set(sorted[i].article_hash, i === 0);
    }
  }

  return primaryMap;
}
```

---

## Performance Analysis

### Time Complexity

| Stage | Operation | Complexity | Time Estimate |
|-------|-----------|------------|---------------|
| Layer 1: SHA256 | Hash + D1 lookup | O(n) | ~50 articles x <1ms = negligible |
| Layer 2: bge encode | Model inference | O(n) | ~50 articles x 0.1s = **~5 seconds** |
| Layer 2: Cosine matrix | Pairwise comparison | O(n^2) | 1,225 pairs x negligible = **<0.1 seconds** |
| Clustering | Union-Find | O(n * alpha(n)) | negligible |
| Primary selection | Sort per cluster | O(n log n) | negligible |
| **Total** | | | **~5 seconds per run** |

Note: The old MinHash + LSH approach was faster (~0.6s) but at the cost of accuracy.
5 seconds is well within acceptable limits for a crawler run that already takes minutes.

### Storage Requirements

| Item | Size | Notes |
|------|------|-------|
| SHA256 hash | 64 bytes/article | Hex-encoded, stored in D1 |
| bge vector | 2,048 bytes/article | 512 x float32 |
| Cluster mapping | ~100 bytes/article | article_hash -> cluster_id |
| **Per article** | **~2.1 KB** | |
| **Per run (~50 articles)** | **~105 KB** | |
| **Per month (~600 articles/day x 30)** | **~37 MB** | Fits within D1/KV limits |

---

## Complete Dedup Pipeline

```javascript
import { ANALYSIS } from '../shared/config.js';
import { ARTICLE_STATUS, ARTICLE_TYPES, getArticleType, canTransitionStatus }
  from '../shared/enums.js';

/**
 * Complete deduplication pipeline for a batch of articles.
 *
 * Input: cleaned status articles (with markdown content)
 * Output: Updated articles with content_hash, similarity_cluster,
 *         similarity_score, article_type, is_primary, status
 *
 * @param {Array<Object>} articles - Batch of cleaned articles
 * @param {D1Database} db - Cloudflare D1 database (for SHA256 lookup)
 * @param {Object} bgeModel - Pre-loaded bge-small-zh-v1.5 model instance
 * @returns {Array<Object>} - New article objects (original objects NOT mutated!)
 */
async function deduplicateBatch(articles, db, bgeModel) {
  const results = [];
  const nonExactDupes = [];

  // ─── Layer 1: SHA256 Exact Dedup ───
  for (const article of articles) {
    // Validate status transition
    if (!canTransitionStatus(article.status, ARTICLE_STATUS.DEDUPLICATED)) {
      throw new Error(
        `Invalid status transition: ${article.status} -> deduplicated`
      );
    }

    const contentHash = computeContentHash(article.content_markdown);
    const { isDuplicate, existingArticleId } = await checkExactDuplicate(contentHash, db);

    if (isDuplicate) {
      // Exact duplicate found -- mark as DUPLICATE (terminal state)
      results.push({
        ...article,
        content_hash: contentHash,
        similarity_score: 1.0,
        similarity_cluster: `cluster_${existingArticleId}`,
        article_type: ARTICLE_TYPES.DUPLICATE,
        is_primary: false,
        status: ARTICLE_STATUS.DUPLICATE,
        status_updated_at: new Date().toISOString()
      });
    } else {
      // Not an exact duplicate -- proceed to Layer 2
      nonExactDupes.push({ ...article, content_hash: contentHash });
    }
  }

  // ─── Layer 2: bge-small-zh Cosine Semantic Dedup ───
  if (nonExactDupes.length === 0) {
    return results;
  }

  // Step 2a: Encode all non-duplicate articles
  const articlesWithVectors = nonExactDupes.map(article => {
    // Skip encoding for short articles (< 200 chars)
    if (article.content_markdown.length < 200) {
      return { ...article, vector: null, _skipSemanticDedup: true };
    }
    return {
      ...article,
      vector: encodeArticle(article.content_markdown, bgeModel),
      _skipSemanticDedup: false
    };
  });

  // Step 2b: Compute pairwise similarity (only for articles with vectors)
  const encodedArticles = articlesWithVectors
    .filter(a => !a._skipSemanticDedup)
    .map(a => ({ hash: a.article_hash, vector: a.vector }));

  const similarityPairs = computeSimilarityPairs(encodedArticles);

  // Step 2c: Build similarity lookup (max similarity per article)
  const maxSimilarityMap = new Map();
  const mostSimilarMap = new Map();

  for (const { hashA, hashB, similarity } of similarityPairs) {
    if (!maxSimilarityMap.has(hashA) || similarity > maxSimilarityMap.get(hashA)) {
      maxSimilarityMap.set(hashA, similarity);
      mostSimilarMap.set(hashA, hashB);
    }
    if (!maxSimilarityMap.has(hashB) || similarity > maxSimilarityMap.get(hashB)) {
      maxSimilarityMap.set(hashB, similarity);
      mostSimilarMap.set(hashB, hashA);
    }
  }

  // Step 2d: Cluster articles
  const allHashes = articlesWithVectors.map(a => a.article_hash);
  const clusterMap = clusterArticles(similarityPairs, allHashes);

  // Step 2e: Select primary articles per cluster
  const primaryMap = selectPrimaryArticles(clusterMap, articlesWithVectors);

  // Step 2f: Build result objects (Immutability -- new objects!)
  for (const article of articlesWithVectors) {
    const maxSimilarity = maxSimilarityMap.get(article.article_hash) || 0;
    const articleType = article._skipSemanticDedup
      ? ARTICLE_TYPES.ORIGINAL
      : getArticleType(maxSimilarity);

    const newStatus = (articleType === ARTICLE_TYPES.DUPLICATE)
      ? ARTICLE_STATUS.DUPLICATE      // Terminal: skip analysis
      : ARTICLE_STATUS.DEDUPLICATED;  // Continue analysis pipeline

    const isPrimary = primaryMap.get(article.article_hash) ?? true;

    // Remove internal fields before returning
    const { vector, _skipSemanticDedup, ...cleanArticle } = article;

    results.push({
      ...cleanArticle,
      similarity_score: maxSimilarity,
      similarity_cluster: clusterMap.get(article.article_hash)
        || `cluster_${article.article_hash}`,
      article_type: articleType,
      is_primary: isPrimary,
      status: newStatus,
      status_updated_at: new Date().toISOString()
    });
  }

  // Step 2g: Store new content hashes in D1 (for future Layer 1 lookups)
  const ttlSeconds = CRAWLER.CACHE_DURATION_HOURS * 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  for (const article of nonExactDupes) {
    await db.prepare(
      'INSERT OR IGNORE INTO article_hashes (content_hash, article_id, expires_at) VALUES (?, ?, ?)'
    ).bind(article.content_hash, article.article_id, expiresAt).run();
  }

  return results;
}
```

---

## Edge Case Handling

### Edge Case 1: Short Articles (< 200 chars markdown)

**Problem**: Very short articles (breaking news alerts, one-liners) produce
unreliable embeddings. The bge model needs sufficient context to generate
meaningful vectors.

**Handling**:
```javascript
if (article.content_markdown.length < 200) {
  // Short article: skip semantic dedup, classify as ORIGINAL
  // SHA256 Layer 1 still catches exact copies of short articles
  return {
    ...article,
    similarity_score: 0,
    similarity_cluster: `cluster_${article.article_hash}`,
    article_type: ARTICLE_TYPES.ORIGINAL,
    is_primary: true,
    status: ARTICLE_STATUS.DEDUPLICATED,
    status_updated_at: new Date().toISOString(),
    _warning: 'short_article_skip_semantic_dedup'
  };
}
```

### Edge Case 2: Paywalled Articles

**Problem**: markdown.news may return truncated content for paywalled articles.
A truncated version of article A will have lower cosine similarity to the full
version of article A than expected.

**Handling**:
```javascript
// If markdown.news returns truncated content, mark it
if (article.is_paywalled) {
  // Use only the available text for dedup
  // Lower confidence in similarity scores for paywalled articles
  // Do NOT discard -- still valuable for title/summary-level analysis
  article._dedup_confidence = 'low';
}
```

### Edge Case 3: CNA (Central News Agency) Articles

**Problem**: markdown.news is blocked for CNA `.aspx` URLs. Only RSS summary
text is available.

**Handling**:
```javascript
// CNA articles: use RSS summary for SHA256 hash and bge encoding
// Summary is typically 200-400 chars, sufficient for bge embedding
// but similarity scores will be lower than full-text comparisons
if (article.source === NEWS_SOURCES.CNA && !article.content_markdown) {
  article.content_markdown = article.summary;
  article._dedup_source = 'rss_summary';
}
```

### Edge Case 4: Cross-Run Dedup

**Problem**: Articles from different crawler runs (every 2 hours) may cover the
same event. Layer 1 SHA256 hashes are persisted in D1 with TTL, but Layer 2
bge vectors are only computed within a single run.

**Handling**:
```javascript
// Cross-run dedup relies on:
// 1. Layer 1 SHA256: persisted in D1, catches exact copies across runs
// 2. Layer 2 bge: only within-run comparison (50 articles)
//
// For cross-run semantic dedup, the downstream Vectorize index
// (bge-m3 on Cloudflare) serves as a secondary check.
// This is acceptable because:
// - Exact copies (Layer 1) are the most common cross-run duplicate type
// - Rewrites across 2+ hours are rare (most rewrites appear within minutes)
// - If a rewrite slips through, T03 quality gates will catch it
```

### Edge Case 5: Empty or Invalid Content

**Problem**: If an article has empty markdown or content is entirely non-text
(e.g., all images), both SHA256 and bge will produce meaningless results.

**Handling**:
```javascript
function deduplicateBatch(articles, db, bgeModel) {
  for (const article of articles) {
    if (!article.content_markdown || article.content_markdown.trim().length === 0) {
      // Empty content: classify as ORIGINAL (cannot compare)
      results.push({
        ...article,
        content_hash: computeContentHash(''),
        similarity_score: 0,
        similarity_cluster: `cluster_${article.article_hash}`,
        article_type: ARTICLE_TYPES.ORIGINAL,
        is_primary: true,
        status: ARTICLE_STATUS.DEDUPLICATED,
        status_updated_at: new Date().toISOString(),
        _warning: 'empty_content'
      });
      continue;
    }
    // ... normal flow
  }
}
```

---

## D1 Schema for Content Hashes

Layer 1 SHA256 hashes are stored in D1 for cross-run exact dedup:

```sql
CREATE TABLE IF NOT EXISTS article_hashes (
  content_hash TEXT PRIMARY KEY,   -- 64-char hex SHA256
  article_id TEXT NOT NULL,        -- SHA256 of primary URL
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL         -- TTL for auto-cleanup
);

CREATE INDEX idx_article_hashes_expires ON article_hashes(expires_at);
```

---

## KV/D1 Field Mapping

Dedup results are written to the following fields (defined in `T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md`):

| Field | Type | Source | Example |
|-------|------|--------|---------|
| `content_hash` | string | Layer 1 SHA256 output | `"a1b2c3d4..."` |
| `similarity_cluster` | string | Clustering output | `"cluster_abc123"` |
| `similarity_score` | number (0.0-1.0) | Layer 2 max cosine similarity | `0.72` |
| `article_type` | string (ARTICLE_TYPES) | Classification output | `"different_angle"` |
| `is_primary` | boolean | Primary selection output | `true` |
| `status` | string (ARTICLE_STATUS) | `deduplicated` or `duplicate` | `"deduplicated"` |

---

## Common Mistakes

### Mistake 1: Hardcoding Thresholds
```javascript
// WRONG
if (similarity > 0.95) {
  articleType = "duplicate";
}

// CORRECT
import { ANALYSIS } from '../shared/config.js';
import { getArticleType } from '../shared/enums.js';
const articleType = getArticleType(similarity);
```
- **Reason**: Threshold SSOT is in `shared/config.js`. Hardcoding causes missed updates when thresholds change.

### Mistake 2: Mutating Original Article Objects
```javascript
// WRONG: Directly modifying the original object
article.similarity_score = maxSimilarity;
article.status = ARTICLE_STATUS.DEDUPLICATED;

// CORRECT: Create a new object (Immutability)
const updatedArticle = {
  ...article,
  similarity_score: maxSimilarity,
  status: ARTICLE_STATUS.DEDUPLICATED
};
```
- **Reason**: Follow Immutability principle to prevent hidden side effects.

### Mistake 3: Using Jaccard Thresholds for Cosine Similarity
```javascript
// WRONG: Old Jaccard thresholds applied to cosine similarity
SIMILARITY_DUPLICATE_THRESHOLD: 0.85,  // This was Jaccard!

// CORRECT: Cosine similarity thresholds (different scale)
SIMILARITY_DUPLICATE_THRESHOLD: 0.95,  // Cosine on dense embeddings
```
- **Reason**: Jaccard similarity on N-gram sets and cosine similarity on dense embeddings produce fundamentally different value distributions. Cosine similarity on bge embeddings tends to be higher for unrelated text compared to Jaccard. Thresholds MUST be calibrated independently.

### Mistake 4: Skipping Status Machine Checks
```javascript
// WRONG: Jump directly to deduplicated without checking
article.status = ARTICLE_STATUS.DEDUPLICATED;

// CORRECT: Use state machine validation
import { canTransitionStatus } from '../shared/enums.js';
if (!canTransitionStatus(article.status, ARTICLE_STATUS.DEDUPLICATED)) {
  throw new Error(`Invalid transition: ${article.status} -> deduplicated`);
}
```
- **Reason**: Articles must follow the defined state machine. Skipping states indicates missing processing steps.

### Mistake 5: Mixing bge-small-zh and bge-m3 Vectors
```javascript
// WRONG: Using bge-m3 vectors for dedup comparison
const vector = await workersAI.run('@cf/baai/bge-m3', { text: [content] });
// bge-m3 produces 1024d vectors, bge-small-zh produces 512d vectors
// These vector spaces are INCOMPATIBLE!

// CORRECT: Use bge-small-zh consistently for dedup
const vector = bgeSmallZh.encode(content);  // 512d, CPU
```
- **Reason**: Different embedding models produce vectors in different spaces. Cosine similarity between vectors from different models is meaningless. Dedup uses bge-small-zh (512d, CPU). Knowledge retrieval uses bge-m3 (1024d, Cloudflare GPU). Never mix them.

### Mistake 6: Forgetting to Persist SHA256 Hashes
```javascript
// WRONG: Only checking in-memory (lost on restart)
const seenHashes = new Set();  // Gone when process restarts!

// CORRECT: Persist to D1 with TTL
await db.prepare(
  'INSERT OR IGNORE INTO article_hashes (content_hash, article_id, expires_at) VALUES (?, ?, ?)'
).bind(contentHash, articleId, expiresAt).run();
```
- **Reason**: Same OceanRAG lesson -- in-memory state is lost on restart. SHA256 hashes must be in D1 for cross-run dedup to work.

### Mistake 7: Not Normalizing Text Before SHA256
```javascript
// WRONG: Hashing raw markdown (whitespace differences cause different hashes)
const hash = sha256(article.content_markdown);

// CORRECT: Normalize first (strip whitespace, lowercase)
const normalized = normalizeForHash(article.content_markdown);
const hash = sha256(normalized);
```
- **Reason**: The same article from different sources may have different whitespace, line breaks, or capitalization. Without normalization, SHA256 will produce different hashes for identical content.

---

## Change Log

| Version | Date | Changes | Reason | Affected Teams |
|---------|------|---------|--------|----------------|
| v0.1 | 2025-03-06 | Skeleton version | Rapid architecture setup | All teams |
| v1.0 | 2026-03-06 | Full version: MinHash+LSH algorithm, 4-level thresholds, Union-Find clustering, 5 edge cases, performance analysis, 6 Common Mistakes | Complete technical spec for T02 dedup module | T01, T02, T03 |
| v2.0 | 2026-03-07 | **COMPLETE REWRITE**: Replaced MinHash+LSH with Two-Layer dedup (SHA256 exact + bge-small-zh cosine semantic). Removed all CKIP BERT references (Decision #007). Updated thresholds from Jaccard to cosine scale. Added primary selection logic. Added 7 Common Mistakes. | CKIP BERT removed, bge-small-zh already loaded for topic filtering, MinHash overkill for ~50 articles/run, semantic embeddings superior to bag-of-words N-grams | T01, T02, T03 |

---

**Important reminder**:
Before modifying this file, you must:
1. Confirm threshold changes have been synced to `shared/config.js`
2. Confirm article type changes have been synced to `shared/enums.js`
3. Notify T01 (KV Schema) and T03 (Quality Gates)
4. M01 review for cross-team impact

---

**Document maintainer**: T02 (Data Acquisition Team)
**Last updated**: 2026-03-07
**Next review**: End of Stage 2
