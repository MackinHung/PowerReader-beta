# Crawler Specification - PowerReader Central Kitchen

## Navigation
- **Upstream docs**: CLAUDE.md, T01/CLOUDFLARE_ARCHITECTURE.md
- **Downstream docs**: T06/CRAWLER_COMPLIANCE.md
- **Maintainer**: T02 (Data Acquisition Team)
- **Last updated**: 2026-03-07

---

## Architecture Overview

The Crawler is a standalone closed-source GitHub project responsible for news crawling, filtering, deduplication, and content extraction.

```
GitHub Actions (every 3h cron)
  |
  |  Stage A: Title Collection
  |    +-- RSS sources (feedparser) ---> 8 sources with RSS
  |    +-- JSON API (UDN) -----------> cursor-based pagination
  |    +-- Homepage scraping ---------> China Times (no RSS)
  |
  |  Stage B: Full Text Extraction
  |    +-- markdown.new (POST) -------> 13/16 sources PASS
  |    +-- trafilatura (fallback) ----> CNA (.aspx blocked)
  |
  |  Processing Pipeline
  |    +-- bge-small-zh topic filter (CPU, 0.1s/article)
  |    +-- SHA256 content dedup
  |    +-- Semantic dedup + cluster
  |    +-- POST /api/articles/batch --> PowerReader
```

---

## Two-Stage Crawling Architecture

### Stage A: Title Collection (RSS + API)

Collects article metadata (title, summary, URL, published_at, source) from all 16 active news sources.

**Sources WITH RSS** (use `feedparser`):
| Source | RSS URL(s) | Reference |
|--------|-----------|-----------|
| LTN (Liberty Times) | `https://news.ltn.com.tw/rss/{category}.xml` (politics, society, life, business) | social-radar rss_sources.yaml |
| CNA (Central News Agency) | `https://feeds.feedburner.com/rsscna/{category}` (politics, finance, social, lifehealth) | social-radar rss_sources.yaml |
| PTS (Public Television) | `https://about.pts.org.tw/rss/XML/newsfeed.xml` | social-radar rss_sources.yaml |
| TheNewsLens | `https://feeds.feedburner.com/TheNewsLens` | social-radar rss_sources.yaml |
| TheReporter | `https://www.twreporter.org/a/rss2.xml` | social-radar rss_sources.yaml |
| TechNews | WordPress RSS (standard `/feed/` endpoint) | Verify at crawl time |
| iThome | Standard RSS feed | Verify at crawl time |
| Storm Media + RewCausas | `https://www.storm.mg/api/getRss/channel_id/2` (filter `/new7/` path for RewCausas) | social-radar rss_sources.yaml |

**Sources WITHOUT RSS** (use JSON API or homepage scraping):
| Source | Method | Endpoint / Pattern | Reference |
|--------|--------|-------------------|-----------|
| UDN (United Daily News) | JSON API | `https://udn.com/api/more?page={p}&id={last_id}&channelId=1&cate_id=0&type=breaknews` | social-radar udn_crawler.py |
| Economic Daily News | JSON API | Same UDN API family, `money.udn.com` subdomain | Shared UDN infrastructure |
| China Times | ⚠️ DEFERRED | `https://www.chinatimes.com/realtimenews/` | RSS 已關閉，需傳統爬蟲，暫緩 |
| Commercial Times | ⚠️ DEFERRED | `https://www.ctee.com.tw/` | JS-heavy + markdown.new 500，暫緩 |
| CommonWealth | Homepage / sitemap | `https://www.cw.com.tw/` (partial paywall) | Low priority, many paywalled |
| Business Weekly | Homepage / sitemap | `https://www.businessweekly.com.tw/` (partial paywall) | Low priority, many paywalled |
| Inside | Standard RSS or homepage | `https://www.inside.com.tw/` | Verify at crawl time |

**Stage A Output** (per article):
```json
{
  "title": "article title",
  "summary": "RSS description or first paragraph",
  "url": "https://source.com/article/12345",
  "published_at": "2026-03-07T14:00:00+08:00",
  "source": "LIBERTY_TIMES"
}
```

**Reference patterns**:
- RSS collection: `social-radar/src/collector/rss_collector.py` (feedparser + XML sanitization + RSSHub fallback + adaptive stopping)
- UDN JSON API: `social-radar/src/collector/udn_crawler.py` (cursor-based pagination + retry with backoff)

### Stage B: Full Text via markdown.new

After collecting article URLs from Stage A, fetch full article text using `markdown.new`.

**How it works**:
```
POST https://markdown.new/
Content-Type: application/json

{"url": "https://news.ltn.com.tw/news/politics/breakingnews/4567890"}

Response: clean markdown text of the article
```

**Key characteristics**:
- Average response time: ~1,811ms (1.8s)
- Rate limit: 500 requests/day/IP
- GitHub Actions uses dynamic IPs, so each workflow run likely gets a different IP
- Returns clean markdown with boilerplate (nav, ads, footers) stripped
- Chinese content returned correctly for all passing sources

**Fallback for CNA**: Use `trafilatura` fallback chain (see social-radar `fulltext_fetcher.py` pattern) since CNA `.aspx` URLs return 403 from markdown.new.
- L1: `trafilatura.extract(favor_precision=True, deduplicate=True)` — CNA 為 SSR，不需 JS 渲染
- L2: Enhanced headers (`Referer`, `Accept-Language: zh-TW`)
- L3: RSS summary 保底
- Rate limiting: 同域 2-5s 間隔，跨域 0.5-1s (round-robin scheduling)
- Circuit breaker: 連續 3 次失敗 → 封鎖該域名剩餘請求

**DEFERRED sources**: China Times (中時) + Commercial Times (工商) — RSS 已關閉且需傳統爬蟲方案，暫緩處理，後續回頭解決。

---

## markdown.new Test Results (2026-03-07)

| # | Source | URL Tested | Status | Response (ms) | Notes |
|---|--------|-----------|--------|---------------|-------|
| 1 | LTN (Liberty Times) | news.ltn.com.tw | PASS | 1,523 | Clean markdown, Chinese OK |
| 2 | China Times | chinatimes.com | PASS | 2,145 | Includes article content correctly |
| 3 | UDN (United Daily News) | udn.com | PASS | 1,890 | Full article text extracted |
| 4 | CommonWealth | cw.com.tw | PASS | 1,678 | Free articles only (paywall content not included) |
| 5 | Business Weekly | businessweekly.com.tw | PASS | 1,756 | Free articles only |
| 6 | TheNewsLens | thenewslens.com | PASS | 1,432 | Social embeds stripped cleanly |
| 7 | TheReporter | twreporter.org | PASS | 2,012 | React SSR content extracted properly |
| 8 | CNA (Central News Agency) | cna.com.tw (.aspx) | **FAIL (403)** | - | `.aspx` URLs blocked; use trafilatura fallback |
| 9 | PTS (Public Television) | news.pts.org.tw | PASS | 1,345 | Clean HTML, easy extraction |
| 10 | Economic Daily News | money.udn.com | PASS | 1,901 | Same UDN infrastructure, works fine |
| 11 | Commercial Times | ctee.com.tw | **FAIL (500)** | - | JS-heavy site, conversion fails |
| 12 | Inside | inside.com.tw | PASS | 1,567 | Standard WordPress-like structure |
| 13 | TechNews | technews.tw | PASS | 1,823 | WordPress, clean extraction |
| 14 | iThome | ithome.com.tw | PASS | 1,654 | Drupal CMS, content extracted OK |
| 15 | RewCausas (New News) | storm.mg/new7/ | **N/A** | - | Use Storm RSS + filter `/new7/` URL path |
| 16 | Storm Media | storm.mg | PASS | 1,812 | Full article with author info |

**Summary**: 13/16 PASS, 1 FAIL (CNA .aspx 403), 1 FAIL (Commercial Times 500), 1 N/A (RewCausas uses Storm RSS + path filter)

---

## Source-Specific Crawling Strategy

### 1. Liberty Times (LTN) -- LIBERTY_TIMES
- **Stage A**: RSS via `feedparser` -- `https://news.ltn.com.tw/rss/politics.xml`, `/society.xml`, `/life.xml`, `/business.xml`
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: breakingnews vs regular news URL structure differs; lazy-loaded images (irrelevant for text)
- **Priority**: HIGH

### 2. China Times -- CHINA_TIMES ⚠️ DEFERRED
- ⚠️ **STATUS: DEFERRED** — RSS 已關閉，需傳統爬蟲方案，暫緩處理，後續回頭解決
- **Stage A**: Homepage scraping (no RSS, RSSHub routes all fail 503) -- parse `https://www.chinatimes.com/realtimenews/` listing page for article links
- **Stage B**: markdown.new -- **PASS** (content extraction works, URL discovery is the blocker)
- **Known issues**: Anti-bot detection requires controlled request frequency; some premium articles behind paywall
- **Priority**: ~~HIGH~~ DEFERRED
- **待解決**: 需要 homepage scraping 或 curl_cffi/Playwright 方案

### 3. United Daily News (UDN) -- UNITED_DAILY_NEWS
- **Stage A**: JSON API -- `https://udn.com/api/more?page={p}&id={last_id}&channelId=1&cate_id=0&type=breaknews` (cursor-based pagination, reference: `udn_crawler.py`)
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Must distinguish `udn.com` (UDN) from `money.udn.com` (Economic Daily); member wall limits free reads; Crawl-delay in robots.txt
- **Priority**: HIGH

### 4. CommonWealth -- COMMON_WEALTH
- **Stage A**: Homepage/sitemap scraping or RSS discovery
- **Stage B**: markdown.new -- **PASS** (free articles only)
- **Known issues**: Strict paywall -- most long-form articles require subscription; backend does not return full content for paywalled articles; mark `is_paywalled: true`
- **Priority**: MEDIUM

### 5. Business Weekly -- BUSINESS_WEEKLY
- **Stage A**: Homepage/sitemap scraping
- **Stage B**: markdown.new -- **PASS** (free articles only)
- **Known issues**: Similar paywall to CommonWealth; URL category path may change
- **Priority**: MEDIUM

### 6. TheNewsLens -- THE_NEWS_LENS
- **Stage A**: RSS via `feedparser` -- `https://feeds.feedburner.com/TheNewsLens`
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: No paywall; contains embedded social media (Twitter/Instagram) that should be filtered; some articles tagged `[reader submission]`
- **Priority**: MEDIUM

### 7. TheReporter -- THE_REPORTER
- **Stage A**: RSS via `feedparser` -- `https://www.twreporter.org/a/rss2.xml` (`max_age_days: 30` due to low publish frequency)
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: React SSR with hashed class names (CSS-in-JS); article slugs are English semantic paths; multi-page long-form articles; skip photo essays (low text content)
- **Priority**: MEDIUM

### 8. CNA (Central News Agency) -- CNA
- **Stage A**: RSS via `feedparser` -- `https://feeds.feedburner.com/rsscna/{category}` (politics, finance, social, lifehealth)
- **Stage B**: **trafilatura fallback chain** (markdown.new returns 403 for `.aspx` URLs):
  - L1: `trafilatura.fetch_url()` + `trafilatura.extract(favor_precision=True, deduplicate=True)` — CNA 是 SSR，trafilatura 可直接處理
  - L2: 增強 Headers fallback (`Referer: cna.com.tw`, `Accept-Language: zh-TW`)
  - L3: RSS 摘要保底 (feedburner 提供 summary)
  - 參考: `social-radar/src/collector/fulltext_fetcher.py`
- **Known issues**: `.aspx` backend; article IDs are date+sequence format (e.g., 202603060123); archived articles may 404
- **Priority**: HIGH

### 9. PTS (Public Television) -- PTS
- **Stage A**: RSS via `feedparser` -- `https://about.pts.org.tw/rss/XML/newsfeed.xml`
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Both text and video news exist; filter by `/article/` path for text news; video news pages have only summary text (below `MIN_ARTICLE_CHARS`)
- **Priority**: HIGH

### 10. Economic Daily News -- ECONOMIC_DAILY_NEWS
- **Stage A**: JSON API (same UDN API family, `money.udn.com` subdomain)
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Shares domain infrastructure with UDN; CSS selectors nearly identical; exclude `/realtime/` stock data pages
- **Priority**: MEDIUM

### 11. Commercial Times -- COMMERCIAL_TIMES ⚠️ DEFERRED
- ⚠️ **STATUS: DEFERRED** — markdown.new 500 + Homepage JS-heavy，暫緩處理，後續回頭解決
- **Stage A**: Homepage scraping -- `https://www.ctee.com.tw/` (JS SPA，需 Playwright)
- **Stage B**: **FAIL** -- markdown.new returns 500 (JS-heavy site, all conversion methods fail)
- **Known issues**: Same media group as China Times but completely different URL structure; very long industry reports should be capped at `MAX_ARTICLE_CHARS`; financial tables should be excluded
- **Priority**: ~~MEDIUM~~ DEFERRED
- **待解決方案** (優先序): RSSHub (`rsshub.app/ctee/realtime`) → curl_cffi (仿 FTV) → Playwright (仿 Dcard)

### 12. Inside -- INSIDE
- **Stage A**: RSS or homepage scraping -- `https://www.inside.com.tw/`
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Article IDs are number+slug hybrid; sponsored/advertorial articles should be detected and excluded from bias analysis
- **Priority**: LOW

### 13. TechNews -- TECHNEWS
- **Stage A**: RSS via `feedparser` (WordPress standard RSS feed)
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: URL contains full date path (year/month/day); WordPress architecture with stable HTML but heavy plugin scripts; some translated (non-original) articles
- **Priority**: LOW

### 14. iThome -- ITHOME
- **Stage A**: RSS via `feedparser` (standard RSS feed)
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Security news contains technical log fragments -- filter `<code>` and `<pre>` blocks; some opinion column articles are blog-style, not news
- **Priority**: LOW

### 15. RewCausas (New News) -- REW_CAUSAS
- **Stage A**: Use Storm Media RSS (`https://www.storm.mg/api/getRss/channel_id/2`) and filter articles where URL path starts with `/new7/`
- **Stage B**: markdown.new -- **N/A** (no separate crawl needed; shares Storm domain; full text obtained via Storm RSS + markdown.new for storm.mg)
- **Known issues**: Merged into Storm Media website; differentiate by `/new7/` URL path; high proportion of political commentary articles
- **Priority**: MEDIUM

### 16. Storm Media -- STORM_MEDIA
- **Stage A**: RSS via `feedparser` -- `https://www.storm.mg/api/getRss/channel_id/2` (exclude `/new7/` path for Storm-proper articles)
  - ⚠️ **注意**: RSS 回傳相對路徑 (e.g. `/11108787?utm_source=rss`)，需補全: `https://www.storm.mg` + link
- **Stage B**: markdown.new -- **PASS**
- **Known issues**: Shares domain with RewCausas; some `reader submission` articles; partial paywall on deep reports
- **Priority**: MEDIUM

**Reference**: Full source registry at `T02_DATA_ACQUISITION/NEWS_SOURCES.md` (SSOT); social-radar RSS config at `social-radar/config/rss_sources.yaml`

---

## Execution Environment

| Item | Specification |
|------|--------------|
| Platform | GitHub Actions (ubuntu-latest) |
| CPU | 2 cores (private repo) |
| RAM | 7 GB |
| Disk | 14 GB SSD |
| GPU | None |
| Frequency | Every 3 hours (cron: `0 */3 * * *`) |
| Monthly consumption | ~1,620 min / 2,000 min quota |

---

## GitHub Actions Configuration

```yaml
name: PowerReader Crawler
on:
  schedule:
    - cron: '0 */3 * * *'  # Every 3 hours
  workflow_dispatch: {}

env:
  POWERREADER_API_KEY: ${{ secrets.POWERREADER_API_KEY }}
  POWERREADER_API_URL: https://powerreader.workers.dev/api
```

---

## Topic Filtering Model (Stage D) — Implemented

**Model**: bge-small-zh-v1.5 (512d, ~130MB)
**Implementation**: `src/crawler/topic_filter.py`
**Method**: cosine similarity vs 7 topic category averaged embeddings
**Threshold**: 0.55 (calibrated 2026-03-07, CLI: `--threshold`)
**Performance**: 6ms/article (batch), model load 12s (one-time)
**Filter rate**: ~50% keep (389 candidates → 193 kept in test run)

### 7 Topic Categories (4 reference texts each)

| Category | Chinese | Example reference |
|----------|---------|-------------------|
| 政治動態 | Political dynamics | 總統府立法院行政院政策施政 |
| 社會議題 | Social issues | 社會問題弱勢族群權益保障 |
| 經濟政策 | Economic policy | 財政預算稅制改革經濟發展 |
| 國防外交 | Defense/diplomacy | 兩岸關係台海軍事國防安全 |
| 司法人權 | Judiciary/rights | 司法改革法院判決審判訴訟 |
| 環境能源 | Environment/energy | 能源政策核電再生能源減碳 |
| 教育文化 | Education/culture | 教育改革課綱大學入學制度 |

### Filtering Flow
```python
from src.crawler.topic_filter import TopicFilter

tf = TopicFilter(threshold=0.55)
result = tf.classify(title="...", summary="...")
# result = {"keep": True, "score": 0.65, "topic": "政治動態", "all_scores": {...}}

# Batch mode (used in pipeline)
results = tf.classify_batch(articles)  # 6ms/article
```

### Known Edge Cases
- WBC 棒球賽 + 政治人物 → 被分類為「國防外交」(KEEP) — 可接受
- 純體育賽事 (球迷加油) → 正確 SKIP (score < 0.55)
- 校園徵才類 → 偶爾 KEEP (score 0.55-0.58) — 邊界 case

---

## Pipeline Flow (Implemented)

```
Stage A: Collect article metadata from all sources (RSS + API)
  - 10 sources, ~550 articles per run
  - Freshness filter (default 6h window)
     ↓
Stage D: Topic filter via bge-small-zh-v1.5
  - 7 categories, threshold=0.55, ~55% keep rate
  - Batch classify for efficiency (~14s/400 articles)
     ↓
Cross-source dedup: title_hash exact match
  - Removes UDN/EDN duplicate entries (~30 per run)
     ↓
Round-robin scheduling: interleave by domain
  - Apply --limit after scheduling to preserve diversity
     ↓
Stage B: Extract full text (per article, with rate limiting)
  - markdown.new (primary) + trafilatura (CNA .aspx fallback)
  - Circuit breaker: 3 consecutive failures blocks domain
     ↓
Stage C: Clean and validate content quality
  - 4-phase: frontmatter → article body → noise removal → quality
  - MIN_ARTICLE_CHARS=100, MIN_PARAGRAPH_COUNT=2
     ↓
Stage E: Content deduplication
  - Layer 1: SHA256 exact (content_hash)
  - Layer 2: bge-small-zh cosine semantic classification
    - original (<0.50) / different_angle (0.50-0.80)
    - rewrite (0.80-0.95) / duplicate (>0.95, removed)
  - Union-Find clustering, primary = longest content
     ↓
Stage F: Push to PowerReader API
  - POST /api/v1/articles/batch (max 50 per request)
  - Bearer token auth (POWERREADER_API_KEY)
  - Retry with exponential backoff (3 attempts)
```

---

## Rate Limiting Strategy

### markdown.new Limits
- **Daily limit**: 500 requests/day/IP
- **Check header**: `x-rate-limit-remaining` -- MUST check before each request
- **Response time**: ~1.8s average
- **Interval**: 3-5 seconds between requests to markdown.new
- **GitHub Actions dynamic IP**: each workflow run likely gets a different IP, effectively multiplying daily quota

### Per-Source Delays
- **Same domain**: 2-5 seconds between consecutive requests (reference: `fulltext_fetcher.py` lines 227-229)
- **Different domain**: 0.5-1 second between requests (reference: `fulltext_fetcher.py` lines 231-232)
- **UDN-specific**: page delay 3-8s, article delay 2-5s (reference: `udn_crawler.py` lines 80-94)

### Round-Robin Scheduling
Avoid hammering a single domain by interleaving requests across domains (reference: `fulltext_fetcher.py` `_build_schedule()`):
```
Instead of: LTN, LTN, LTN, UDN, UDN, UDN, CNA, CNA
Do:         LTN, UDN, CNA, LTN, UDN, CNA, LTN, UDN
```

### Robots.txt Compliance
- Always respect `Crawl-delay` directives
- Use `max(robots_crawl_delay, configured_delay)` as the actual delay
- Unit disambiguation: if Crawl-delay value > 100, treat as milliseconds; otherwise treat as seconds

---

## Error Handling

### Transient Errors (retry with backoff)
- **HTTP 429** (Too Many Requests): exponential backoff, start at 30s
- **HTTP 500** (Internal Server Error): retry up to 2 times
- **HTTP 502** (Bad Gateway): retry up to 2 times
- **HTTP 503** (Service Unavailable): retry with 30-60s backoff (reference: `udn_crawler.py` lines 59-62)

### Permanent Errors (skip, log, do NOT retry)
- **HTTP 403** (Forbidden): log and skip; domain may be blocking the crawler
- **HTTP 404** (Not Found): log and skip; article may have been archived or deleted

### Consecutive Failure Threshold
- **3 consecutive failures per domain** -> block remaining requests to that domain for the current run (reference: `fulltext_fetcher.py` lines 254-258)
- Blocked domains are logged and reported in run metrics
- Successful requests reset the consecutive failure counter for that domain

### markdown.new Specific
- **Timeout**: 30 seconds per request
- **403 response**: permanent error for that URL (do not retry)
- **500 response**: may be JS-heavy site; fall back to trafilatura
- **Rate limit exhausted** (`x-rate-limit-remaining: 0`): stop all markdown.new requests for this run

### Critical Team Rule
- When crawlers hit unexpected walls (new anti-bot measures, structural changes, mass failures) -> **ask the project owner for help** before attempting workarounds
- Document the issue in `shared/cross_team_comms/` for cross-team visibility

---

## API Push Format

See CLAUDE.md Central Kitchen Architecture -> Crawler API Output Format

---

## Security and Compliance

- Crawling respects `robots.txt`
- Rate limiting: >= 2 seconds/request, persisted to GitHub Actions cache
- Push to PowerReader uses API Key authentication
- No user data is stored
- User-Agent: `MediaBiasBot/1.0` (transparent identification)

### Compliance Statements (T06 CRAWLER_COMPLIANCE.md v1.4 Alignment)

1. **Author handling**: Author field stored as nullable plain text (public byline only). Private contact information (phone, email, social accounts) is never collected or stored.
2. **HTML disposal**: Raw HTML is processed in-memory then discarded. Only cleaned Markdown is retained and pushed to PowerReader. No intermediate HTML files are written to disk.
3. **Paywall respect**: Crawler respects paywall markers and does not attempt to circumvent subscription walls. Paywalled articles return partial content (summary only) or are skipped.
4. **API authentication**: All API pushes to PowerReader require Bearer token in Authorization header (`POWERREADER_API_KEY` environment variable, stored in GitHub Actions Secrets).

---

## Monitoring Metrics

Each run records:
- `total_crawled`: total articles fetched from all sources
- `filtered_count`: articles passing topic filter
- `fulltext_count`: articles with successful full text extraction
- `pushed_count`: articles successfully pushed to PowerReader
- `failed_count`: failed articles
- `blocked_domains`: domains that hit consecutive failure threshold
- `rate_limit_remaining`: markdown.new rate limit remaining at end of run
- `duration_seconds`: total elapsed time

Pushed to PowerReader D1 `crawler_runs` table.

---

## Common Mistakes

### Mistake 1: Hardcoded filter threshold
- **Problem**: Threshold hardcoded in source code; changing it requires code modification and redeployment
- **Correct approach**: Read from config file or environment variable

### Mistake 2: Not handling markdown.new downtime
- **Problem**: When markdown.new service is unavailable, entire batch of articles is lost
- **Correct approach**: Failed articles are written to a retry queue; next run retries them

### Mistake 3: Mixing bge-small-zh and bge-m3 vectors
- **Problem**: The two models have incompatible vector spaces (512d vs 1024d)
- **Correct approach**: Filtering uses bge-small-zh; knowledge retrieval uses bge-m3; never mix them

### Mistake 4: Not checking x-rate-limit-remaining before markdown.new calls
- **Problem**: Blindly sending requests to markdown.new without checking remaining quota leads to 429 errors and wasted time on retries
- **Correct approach**: Check `x-rate-limit-remaining` response header after each request; if 0, stop all markdown.new requests for the current run and fall back to trafilatura for remaining articles

### Mistake 5: Using markdown.new for CNA .aspx URLs
- **Problem**: CNA URLs use `.aspx` extension (ASP.NET backend); markdown.new returns 403 for these URLs
- **Correct approach**: Always use `trafilatura` as the full text extraction method for CNA articles; never send CNA URLs to markdown.new
- **Discovery date**: 2026-03-07 (markdown.new integration testing)

### Mistake 6: Not implementing round-robin scheduling (hammering one domain)
- **Problem**: Processing all articles from one source sequentially before moving to the next causes rapid-fire requests to a single domain, triggering rate limits and IP bans
- **Correct approach**: Build a round-robin schedule using domain bucketing (reference: `fulltext_fetcher.py` `_build_schedule()`); interleave requests across different domains with appropriate cross-domain delays (0.5-1s)
- **Lesson source**: social-radar fulltext_fetcher.py production experience

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-03-06 | Skeleton version |
| v2.0 | 2026-03-07 | Full crawler spec: central kitchen + bge-small-zh filtering + markdown.news + API push |
| v3.0 | 2026-03-07 | Two-stage architecture (RSS/API + markdown.new); markdown.new test results (13/16 PASS); source-specific crawling strategy for all 16 sources; rate limiting strategy with round-robin scheduling; error handling with consecutive failure threshold; pipeline flow; GitHub Actions config; 3 new Common Mistakes |
| v4.0 | 2026-03-07 | Topic filter implemented (7 categories, threshold 0.55, 6ms/article); 4 T06 compliance statements added; pipeline tested end-to-end (15/15 success, 100%) |
| v5.0 | 2026-03-07 | Stage E (content dedup: SHA256 + bge-small-zh cosine, Union-Find clustering); Stage F (API push with retry); GitHub Actions workflow rewritten for Python; requirements.txt; pipeline flow updated to match implementation |

**Document maintainer**: T02 (Data Acquisition Team)
**Last updated**: 2026-03-07
