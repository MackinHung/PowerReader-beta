# T02 Data Acquisition Team - Phase Plan

**Scope**: News crawling (16 sources), bge-small-zh topic filtering, markdown.new full-text extraction, SHA256 + cosine semantic deduplication, Union-Find clustering, push to PowerReader API via GitHub Actions.

**Architecture ref**: MASTER_ROADMAP.md Decision #005 (Central Kitchen), #007 (CKIP BERT removed), #009 (bge-small-zh topic filtering), #010 (every 3h cron).

---

## Pipeline Overview

```
Stage 1: RSS / Crawler
  │  feedparser for RSS sources, JSON API / homepage scrape for non-RSS sources
  │  Output: { title, summary, url, published_at, source } per article
  ↓
Stage 2: bge-small-zh Topic Filtering
  │  Embed title+summary → cosine similarity vs topic vectors
  │  Above threshold → keep; below → discard
  │  CPU 0.1s/article, model already loaded
  ↓
Stage 3: markdown.new Full-Text Extraction
  │  POST { url } to https://markdown.new/ → clean markdown
  │  500 req/day/IP but GitHub Actions uses dynamic IPs
  │  3-5s intervals between requests
  │  Fallback: RSS summary content (CNA) or trafilatura (Commercial Times)
  ↓
Stage 4: SHA256 Exact Dedup + bge-small-zh Cosine Semantic Dedup
  │  Layer 1: SHA256(content_markdown) → exact duplicate removal
  │  Layer 2: bge-small-zh embed full text → cosine > 0.85 = semantic duplicate
  │  (bge-small-zh already loaded from Stage 2, no extra model cost)
  ↓
Stage 5: Union-Find Clustering + Primary Selection
  │  Group semantically similar articles (cosine 0.60-0.85) into clusters
  │  Pick richest content per cluster as primary
  │  Remaining become duplicate_urls
  ↓
Stage 6: Push to PowerReader API
  │  POST /api/articles/batch with Crawler API output schema (see CLAUDE.md)
  │  API key auth, retry with exponential backoff
  └─ Done
```

---

## Execution Environment: GitHub Actions

| Constraint | Value |
|-----------|-------|
| Platform | `ubuntu-latest`, 2 cores, 7GB RAM, no GPU |
| Frequency | Every 3 hours (`cron: '0 */3 * * *'`), 8 runs/day |
| Monthly budget | ~2,000 min free tier |
| Python | 3.11+ |
| Model caching | pip cache + HuggingFace cache (`~/.cache/huggingface/`) for bge-small-zh |
| bge-small-zh | `BAAI/bge-small-zh-v1.5`, 130MB, CPU, 512d vectors |
| Rate limits | Per T06 CRAWLER_COMPLIANCE.md: >= 2s between requests per source |

---

## Reference Code

Existing crawler patterns in `social-radar/src/collector/`:
- `rss_collector.py` - RSS feed parsing via feedparser
- `udn_crawler.py` - UDN-specific HTML crawler
- `fulltext_fetcher.py` - Full-text extraction patterns

When crawlers hit walls (wrong selectors, blocked, anti-bot, etc.) --> **MUST ask the project owner for help**. Do not spend more than 30 minutes debugging a single source.

---

## Phase 1: Title Collection Foundation (Priority: HIGH)

**Goal**: RSS + API crawlers for getting article titles, summaries, and URLs from all 16 sources. No full-text extraction yet.

**Deliverables**:
1. Project scaffold: `pyproject.toml`, `src/` layout, `shared/config.py` with constants from `shared/config.js`
2. RSS collector: generic `rss_collector.py` using `feedparser`, handles RSS feeds for sources that provide them (Liberty Times, CNA, PTS, Storm Media, TechNews, iThome, etc.)
3. JSON API / homepage collectors for non-RSS sources:
   - UDN / Economic Daily News: JSON API endpoint (reference `udn_crawler.py`)
   - China Times: homepage scrape for article links
   - Other sources as needed
4. Output per article: `{ title, summary, url, published_at, source }` as a list of dicts
5. Source registry: Python enum mirroring `shared/enums.js` NEWS_SOURCES, with source-specific config (RSS URL, API endpoint, crawl priority)
6. robots.txt compliance: rate limiting >= 2s/request, `User-Agent: PowerReaderBot/1.0`
7. Article URL normalization: handle AMP URLs, UDN subdomain routing (`money.udn.com` = ECONOMIC_DAILY_NEWS), Storm/New7 path routing
8. Basic error handling: per-source failure counter, max 3 retries with exponential backoff
9. Unit tests for RSS parsing, URL normalization, source routing
10. GitHub Actions workflow skeleton: `cron: '0 */3 * * *'`, pip cache, HuggingFace cache

**Dependencies**:
- T01: API Routes finalized (article batch endpoint URL + auth)
- T06: Compliance review for initial 5 HIGH-priority sources (Liberty Times, China Times, UDN, CNA, PTS)

**Provides to others**:
- T03: Article titles + summaries available for testing prompt design
- T07: GitHub Actions workflow spec for CI/CD integration

---

## Phase 2: markdown.new Integration + Topic Filtering (Priority: HIGH)

**Goal**: Add bge-small-zh topic filtering on title+summary, then fetch full text via markdown.new for articles that pass filtering.

**Deliverables**:
1. bge-small-zh model loader: load `BAAI/bge-small-zh-v1.5` (512d) at pipeline start, keep in memory for reuse in Stage 2 + Stage 4
2. Topic vector definitions: load topic vectors from config (provided by project owner). Format: `{ topic_name: "政治新聞", vector: [...512d...], threshold: 0.45 }`
3. Topic filtering pipeline: embed `title + " " + summary` with bge-small-zh, compute cosine similarity against all topic vectors, keep articles where max similarity >= threshold
4. markdown.new integration:
   - POST `{"url": article_url}` to `https://markdown.new/` API
   - Parse response to extract clean markdown content
   - Rate limit: 3-5 second intervals between requests
   - Timeout: 10s per request
5. Source-specific fallbacks for markdown.new failures:
   - CNA (.aspx pages blocked): use RSS `<description>` full content OR `trafilatura` fallback
   - Commercial Times (JS-rendered): `trafilatura` fallback
   - RewCausas (New7): use Storm Media RSS feed with `/new7/` path filter
   - Generic fallback: skip article, log warning, do not crash pipeline
6. Content validation: reject if `char_count < MIN_ARTICLE_CHARS` (100), detect paywall truncation
7. Integration tests: run topic filter + markdown.new on 3 articles per source, validate output schema
8. Logging: per-source success/failure/skip counts, markdown.new response times

**markdown.new Test Results** (16 sources):
| Status | Count | Sources |
|--------|-------|---------|
| PASS | 13 | Liberty Times, China Times, UDN, PTS, CommonWealth, BusinessWeekly, TheNewsLens, TheReporter, EconomicDailyNews, Inside, TechNews, iThome, StormMedia |
| FAIL | 3 | CNA (.aspx blocked), Commercial Times (JS rendered), RewCausas (use Storm RSS filter) |

Average response time: 1,811ms.

**Dependencies**:
- Phase 1 complete (title + URL collection working)
- Project owner: topic vector definitions (the actual topic strings + thresholds)

**Provides to others**:
- T03: Filtered articles with full markdown text for prompt testing
- T06: markdown.new compliance review (third-party service usage)

---

## Phase 3: Deduplication + Clustering (Priority: HIGH)

**Goal**: Two-layer deduplication (exact + semantic) and Union-Find clustering to group same-event coverage and select primary articles.

**Deliverables**:
1. SHA256 exact deduplication:
   - Hash `content_markdown` with SHA256 (`content_hash` field in output)
   - If hash matches an existing article in the current batch --> mark as exact duplicate, skip
   - Also check against recent articles via PowerReader API (GET `/api/articles/hash/{hash}`)
2. bge-small-zh cosine semantic deduplication:
   - Embed full `content_markdown` with bge-small-zh (model already loaded from Phase 2)
   - Compute pairwise cosine similarity within the current batch
   - Classification tiers:
     - `>= 0.85`: DUPLICATE (skip, add URL to primary's `duplicate_urls`)
     - `0.60 - 0.85`: SAME_EVENT (cluster together, keep all)
     - `< 0.60`: ORIGINAL (no relation)
3. Union-Find clustering:
   - Build Union-Find structure from DUPLICATE + SAME_EVENT pairs
   - Each cluster gets a cluster ID
   - Primary selection: pick article with longest `content_markdown` (richest content) as primary
   - Other articles in cluster: their URLs go into primary's `duplicate_urls`, their similarity scores go into `dedup_metadata.similarity_scores`
4. Output: Crawler API schema per CLAUDE.md, including `dedup_metadata: { total_found, unique_content, similarity_scores }`
5. Edge case handling:
   - Short articles (<200 chars): skip semantic dedup (not enough signal), keep as ORIGINAL
   - Empty content after markdown.new: skip entirely, log warning
   - Single-article batch: no dedup needed, pass through
6. Unit tests for SHA256 dedup, cosine similarity, Union-Find, primary selection, all edge cases

**Dependencies**:
- Phase 2 complete (filtered articles with full markdown text)
- T01: API endpoint for checking existing article hashes (optional, can defer to Phase 4)

**Provides to others**:
- T03: Deduplicated articles with cluster metadata for cross-media bias comparison
- T04: Cluster data for "same event, different perspectives" UI feature

---

## Phase 4: Full Pipeline + API Push (Priority: HIGH)

**Goal**: End-to-end pipeline running on GitHub Actions, pushing deduplicated articles to PowerReader API.

**Deliverables**:
1. Pipeline orchestrator: `main.py` that runs Stage 1-6 sequentially per batch
2. PowerReader API push:
   - POST `/api/articles/batch` with array of Crawler API output schema (CLAUDE.md)
   - API key authentication (stored as GitHub Actions secret `POWERREADER_API_KEY`)
   - Retry with exponential backoff: 3 retries, initial delay 5s
   - Batch size: max 50 articles per API call
3. Full source coverage: all 16 sources operational with source-specific configs
4. Priority-based scheduling within a single cron run:
   - Process HIGH sources first (Liberty Times, China Times, UDN, CNA, PTS)
   - Then MEDIUM (CommonWealth, BusinessWeekly, TheNewsLens, TheReporter, EconomicDailyNews, CommercialTimes, RewCausas, StormMedia)
   - Then LOW (Inside, TechNews, iThome)
   - If pipeline exceeds time budget (25 min), skip remaining LOW sources
5. GitHub Actions workflow finalized:
   - `cron: '0 */3 * * *'`
   - pip cache for dependencies
   - HuggingFace cache for bge-small-zh model
   - Secret: `POWERREADER_API_KEY`
   - Timeout: 30 minutes max
6. Per-run summary logging: articles collected / filtered / fetched / deduplicated / pushed, per-source breakdown
7. Error budget: if any single source fails, continue with remaining sources (no full-pipeline crash)
8. Integration test: full pipeline dry-run with `--dry-run` flag (skip API push, print output)

**Dependencies**:
- Phase 3 complete (dedup + clustering working)
- T01: PowerReader API `/api/articles/batch` endpoint deployed and accepting requests
- T01: API key provisioned for crawler

**Provides to others**:
- All teams: Complete multi-source news data flowing through the system
- T07: Pipeline execution metrics for monitoring dashboard

---

## Phase 5: Hardening + Monitoring (Priority: MEDIUM)

**Goal**: Production-ready reliability, failure alerting, and drift detection.

**Deliverables**:
1. CSS drift detection for non-RSS sources:
   - Weekly validation job: fetch 1 article per source, verify title + content extraction still works
   - If extraction fails, create GitHub Issue automatically (via `gh` CLI)
   - Does NOT apply to markdown.new-based extraction (markdown.new handles selector changes)
2. Failure alerting:
   - If any source fails for 3 consecutive runs --> alert via GitHub Issue
   - If overall pipeline success rate drops below 80% --> alert
   - If markdown.new response time exceeds 5s average --> log warning
3. Rate limit management:
   - Per-source request counter persisted in a local JSON file (committed to repo as state)
   - Track daily request counts per source
   - Auto-throttle if approaching rate limits
4. markdown.new fallback health check:
   - Monitor CNA trafilatura fallback quality
   - Monitor Commercial Times trafilatura fallback quality
   - If fallback quality degrades, create GitHub Issue
5. Pipeline performance monitoring:
   - Track per-run timing: Stage 1 (collect), Stage 2 (filter), Stage 3 (fetch), Stage 4 (dedup), Stage 5 (cluster), Stage 6 (push)
   - Track bge-small-zh inference time per article
   - Ensure full pipeline completes within 25 minutes
6. Cross-team data format validation: automated schema check against Crawler API output schema (CLAUDE.md)
7. GitHub Actions cost monitoring: track monthly minutes usage, alert at 80% of free tier (1,600 of 2,000 min)

**Dependencies**:
- Phase 4 complete (full pipeline operational)
- T07: Monitoring dashboard integration (optional, can use GitHub Issues as primary alerting)
- T06: Final compliance audit

**Provides to others**:
- T07: Crawler health metrics for monitoring dashboard
- M01: Production readiness report

---

## Risks and Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| markdown.new API goes down or changes | Full-text extraction fails for 13/16 sources | trafilatura fallback for all sources, RSS summary as last resort |
| markdown.new rate limit (500/day/IP) | Cannot fetch all articles | GitHub Actions dynamic IPs mitigate this; batch prioritize HIGH sources first |
| bge-small-zh topic filtering too aggressive | Misses relevant articles at boundary | Calibrate thresholds with project owner; start permissive (0.35), tighten later |
| bge-small-zh topic filtering too permissive | Too many irrelevant articles pass through | Tighten threshold; add negative topic vectors for sports/entertainment |
| CNA .aspx pages permanently blocked by markdown.new | CNA full text unavailable | RSS summary fallback (CNA RSS provides substantial content); trafilatura fallback |
| CSS selector changes by news sites (non-RSS sources) | Title/URL collection breaks | Phase 5 drift detection + GitHub Issue alerting; RSS preferred over HTML scraping |
| Anti-bot detection (China Times, UDN) | IP blocked | Strict rate limiting (>= 2s), GitHub Actions rotating IPs, User-Agent compliance |
| GitHub Actions free tier exhaustion | Pipeline stops running | Monitor monthly minutes; reduce cron frequency as backup (every 4h) |
| bge-small-zh model download fails in CI | Pipeline cannot start | HuggingFace cache in GitHub Actions; pre-download in setup step with retry |
| Paywall expansion by sources | Less content available | Detect and flag `is_paywalled`, prioritize free sources; log paywall rate trends |

---

## Common Mistakes

### Mistake 1: Calling markdown.new without rate limiting
```python
# WRONG: blast requests as fast as possible
for url in article_urls:
    response = requests.post("https://markdown.new/", json={"url": url})

# CORRECT: 3-5s intervals
import time
for url in article_urls:
    response = requests.post("https://markdown.new/", json={"url": url}, timeout=10)
    time.sleep(4)  # 4s interval
```
- **Reason**: markdown.new has rate limits (500/day/IP). Even with GitHub Actions dynamic IPs, bursting can trigger temporary blocks.

### Mistake 2: Loading bge-small-zh twice
```python
# WRONG: load model separately for filtering and dedup
filter_model = SentenceTransformer("BAAI/bge-small-zh-v1.5")  # Stage 2
dedup_model = SentenceTransformer("BAAI/bge-small-zh-v1.5")   # Stage 4, wastes 130MB RAM

# CORRECT: load once, reuse
model = SentenceTransformer("BAAI/bge-small-zh-v1.5")
# Pass `model` to both filtering and dedup stages
```
- **Reason**: bge-small-zh is used for both topic filtering (Stage 2) and semantic dedup (Stage 4). Loading it once saves 130MB RAM and ~5s startup time.

### Mistake 3: Using bge-small-zh vectors with bge-m3 vectors
```python
# WRONG: comparing vectors from different models
crawler_vec = bge_small_zh.encode(text)    # 512d
api_vec = bge_m3.encode(text)              # 1024d
similarity = cosine_similarity(crawler_vec, api_vec)  # MEANINGLESS!

# CORRECT: only compare vectors from the same model
vec_a = bge_small_zh.encode(text_a)  # 512d
vec_b = bge_small_zh.encode(text_b)  # 512d
similarity = cosine_similarity(vec_a, vec_b)  # valid
```
- **Reason**: bge-small-zh (512d) and bge-m3 (1024d) have incompatible vector spaces. See MASTER_ROADMAP Decision #007.

### Mistake 4: Not handling markdown.new failures gracefully
```python
# WRONG: crash the entire pipeline on one failure
content = fetch_markdown(url)  # raises exception → pipeline dies

# CORRECT: skip and continue
try:
    content = fetch_markdown(url)
except (requests.Timeout, requests.HTTPError) as e:
    logger.warning(f"markdown.new failed for {url}: {e}, trying fallback")
    content = try_fallback(url, source)
    if content is None:
        logger.warning(f"All extraction methods failed for {url}, skipping")
        continue
```
- **Reason**: One source failure should not kill the entire pipeline. The error budget allows skipping individual articles.

### Mistake 5: Forgetting CNA uses .aspx URLs
```python
# WRONG: assume all URLs work with markdown.new
content = fetch_markdown("https://www.cna.com.tw/news/aipl/202603060123.aspx")
# → blocked by markdown.new!

# CORRECT: source-specific routing
if source == NEWS_SOURCES.CNA:
    content = fetch_cna_fallback(url)  # RSS content or trafilatura
else:
    content = fetch_markdown(url)
```
- **Reason**: CNA uses .aspx pages which are blocked by markdown.new. Must use RSS summary content or trafilatura fallback.

### Mistake 6: Deduplicating across batches without API check
```python
# WRONG: only dedup within current batch
hashes = set()
for article in batch:
    if article.content_hash in hashes:
        skip(article)
    hashes.add(article.content_hash)
# → duplicate of yesterday's article gets pushed again!

# CORRECT: also check against PowerReader API
for article in batch:
    if article.content_hash in local_hashes:
        skip(article)
    elif api_hash_exists(article.content_hash):
        skip(article)
    local_hashes.add(article.content_hash)
```
- **Reason**: SHA256 exact dedup must check both the current batch and recently pushed articles via the PowerReader API.

---

## Summary Timeline

| Phase | Depends On | Est. Effort | Key Output |
|-------|-----------|-------------|------------|
| 1 - Title Collection Foundation | T01 API Routes, T06 compliance review | 3-4 days | RSS + API crawlers for 16 sources, GitHub Actions skeleton |
| 2 - markdown.new + Topic Filtering | Phase 1, project owner topic vectors | 3-4 days | bge-small-zh filtering + markdown.new full text |
| 3 - Deduplication + Clustering | Phase 2 | 2-3 days | SHA256 exact + bge cosine semantic dedup + Union-Find |
| 4 - Full Pipeline + API Push | Phase 3, T01 API deployed | 2-3 days | End-to-end pipeline on GitHub Actions |
| 5 - Hardening + Monitoring | Phase 4, T07 monitoring | 2-3 days | Drift detection, alerting, rate limit management |
