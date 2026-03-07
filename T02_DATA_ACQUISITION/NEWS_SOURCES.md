# News Sources - Taiwan Major Media Registry

## Navigation
- **Upstream documents**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **Downstream documents**: T02 CRAWLER_SPEC.md, T01 KV_SCHEMA.md, T03 QUALITY_GATES.md, T06 CRAWLER_COMPLIANCE.md
- **Maintainer**: T02 (Data Acquisition Team)
- **Type**: SINGLE SOURCE OF TRUTH (SSOT)
- **Last updated**: 2026-03-07

---

## markdown.new Compatibility Summary (Tested: 2026-03-07)

| Metric | Value |
|--------|-------|
| PASS | 13/16 sources (81%) |
| FAIL | CNA (.aspx blocked → trafilatura fallback), Commercial Times (DEFERRED), Rew Causas (use Storm RSS) |
| DEFERRED | China Times (無 RSS), Commercial Times (JS-heavy + 500) — 暫緩，後續回頭解決 |
| Average response time | ~1,811ms |
| Chinese content | All passing sources correctly return Chinese content |

**Impact on crawler architecture**: With markdown.new handling content extraction, CSS selectors
are no longer needed for 13 out of 16 sources. CNA requires CSS-based extraction as the primary
method due to .aspx URLs being blocked by markdown.new.

---

## Document Purpose

This is the **single source of truth for Taiwan news sources**.
All crawler targets, source identifiers, and political stance labels use this document as the authority.

When adding or removing news sources, the following must be updated in sync:
1. This document (NEWS_SOURCES.md)
2. The `NEWS_SOURCES` object in `shared/enums.js`
3. The compliance checklist in T06 CRAWLER_COMPLIANCE.md

**Notify when modifying this document**: T01, T03, T04, T06

---

## News Source Overview

### 1. Pan-Green Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| Liberty Times | `LIBERTY_TIMES` | https://news.ltn.com.tw | Pan-Green | General Daily | Allowed (has Crawl-delay) | HIGH | PASS | One of Taiwan's largest-circulation newspapers |
| Taiwan Apple Daily | `TAIWAN_APPLE_DAILY` | https://tw.appledaily.com | Pan-Green | General Daily | N/A | DISABLED | N/A | Ceased publication in 2021, historical data only |

#### Article URL Discovery: Liberty Times
- **RSS (PRIMARY)**: Enabled via official RSS
  - Politics: `https://news.ltn.com.tw/rss/politics.xml`
  - Society: `https://news.ltn.com.tw/rss/society.xml`
  - Life: `https://news.ltn.com.tw/rss/life.xml`
  - Business: `https://news.ltn.com.tw/rss/business.xml`
- **URL Pattern**: `https://news.ltn.com.tw/news/{category}/{article_id}`

### 2. Pan-Blue Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| China Times | `CHINA_TIMES` | https://www.chinatimes.com | Pan-Blue | General Daily | Allowed | **DEFERRED** | PASS | Want Want China Times Group. ⚠️ RSS 已關閉，需傳統爬蟲，暫緩處理 |
| United Daily News | `UNITED_DAILY_NEWS` | https://udn.com | Pan-Blue | General Daily | Allowed (has Crawl-delay) | HIGH | PASS | United Daily News Group flagship |

#### Article URL Discovery: China Times
- ⚠️ **STATUS: DEFERRED** — RSS 已全面關閉，RSSHub 也失敗，需傳統爬蟲方案，暫緩處理，優先推進其他來源
- **RSS**: CLOSED (404/403). Official RSS has been fully shut down. RSSHub routes also fail (503).
- **Homepage Crawler (待實作)**: Must crawl homepage for article links
  - Realtime news listing: `https://www.chinatimes.com/realtimenews/`
  - Newspaper section listing: `https://www.chinatimes.com/newspapers/`
- **URL Pattern**: `https://www.chinatimes.com/{category}/{article_id}`
- **待解決**: 需要 homepage scraping 抓取文章 URL，可能需要 curl_cffi 或 Playwright

#### Article URL Discovery: United Daily News (UDN)
- **RSS**: FAILED. All RSSHub instances return 503/403. No official RSS available.
- **JSON API Crawler (PRIMARY)**: Use `udn_crawler.py` with UDN's internal JSON API
  - API endpoint: `https://udn.com/api/more?page={page}&channelId={id}&type=breaknews`
  - Returns JSON with article URLs and metadata
- **URL Pattern**: `https://udn.com/news/story/{section_id}/{article_id}`

### 3. Neutral/Independent Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| CommonWealth Magazine | `COMMON_WEALTH` | https://www.cw.com.tw | Neutral-left | Business Magazine | Allowed | MEDIUM | PASS | Paywall (some articles) |
| Business Weekly | `BUSINESS_WEEKLY` | https://www.businessweekly.com.tw | Neutral | Business Magazine | Allowed | MEDIUM | PASS | Paywall (some articles) |
| The News Lens | `THE_NEWS_LENS` | https://www.thenewslens.com | Neutral-left | New Media | Allowed | MEDIUM | PASS | Multi-perspective aggregation platform |
| The Reporter | `THE_REPORTER` | https://www.twreporter.org | Neutral | Non-profit Media | Allowed | MEDIUM | PASS | In-depth investigative journalism, no ads |

#### Article URL Discovery: The News Lens
- **RSS (PRIMARY)**: Enabled via Feedburner
  - Full site: `https://feeds.feedburner.com/TheNewsLens`
- **URL Pattern**: `https://www.thenewslens.com/article/{article_id}`

#### Article URL Discovery: The Reporter
- **RSS (PRIMARY)**: Enabled via official RSS
  - Full site: `https://www.twreporter.org/a/rss2.xml`
  - Note: `max_age_days: 30` (low update frequency)
- **URL Pattern**: `https://www.twreporter.org/a/{article_slug}`

#### Article URL Discovery: CommonWealth Magazine
- **RSS**: Not available in social-radar config. Needs homepage crawler or sitemap discovery.
- **URL Pattern**: `https://www.cw.com.tw/article/{article_id}`

#### Article URL Discovery: Business Weekly
- **RSS**: Not available in social-radar config. Needs homepage crawler or sitemap discovery.
- **URL Pattern**: `https://www.businessweekly.com.tw/focus/blog/{article_id}`

### 4. Public Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| CNA | `CNA` | https://www.cna.com.tw | Public | National News Agency | Allowed | HIGH | **FAIL** | Official news source, frequently cited by other media. **.aspx blocked by markdown.new** |
| PTS News | `PTS` | https://news.pts.org.tw | Public | Public Television | Allowed | HIGH | PASS | Taiwan's only public television station |

#### Article URL Discovery: CNA
- **RSS (PRIMARY)**: Enabled via Feedburner
  - Politics: `https://feeds.feedburner.com/rsscna/politics`
  - Finance: `https://feeds.feedburner.com/rsscna/finance`
  - Society: `https://feeds.feedburner.com/rsscna/social`
  - Life: `https://feeds.feedburner.com/rsscna/lifehealth`
  - Note: Instant news feed (`cikiCna`) is disabled (feedburner 404)
- **URL Pattern**: `https://www.cna.com.tw/news/{category}/{article_id}.aspx`
- **Content Extraction**: Use trafilatura fallback (markdown.new FAILS on .aspx URLs)
  - L1: trafilatura (`favor_precision=True, deduplicate=True`) — CNA 是 SSR，不需 JS
  - L2: 增強 Headers (`Referer: cna.com.tw` + `Accept-Language: zh-TW`)
  - L3: RSS 摘要作最後保底
  - 參考: `social-radar/src/collector/fulltext_fetcher.py`

#### Article URL Discovery: PTS
- **RSS (PRIMARY)**: Enabled via official RSS
  - Full site: `https://about.pts.org.tw/rss/XML/newsfeed.xml`
- **URL Pattern**: `https://news.pts.org.tw/article/{article_id}`

### 5. Economic Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| Economic Daily News | `ECONOMIC_DAILY_NEWS` | https://money.udn.com | Neutral-blue | Economic Daily | Allowed | MEDIUM | PASS | United Daily News Group, business-focused |
| Commercial Times | `COMMERCIAL_TIMES` | https://www.ctee.com.tw | Neutral-blue | Economic Daily | Allowed | **DEFERRED** | **FAIL** | Want Want China Times Group, business-focused. ⚠️ JS-heavy + markdown.new 500，暫緩處理 |

#### Article URL Discovery: Economic Daily News
- **RSS**: FAILED (same as UDN, RSSHub instances return 503/403).
- **JSON API Crawler**: Use same approach as UDN (`udn_crawler.py`), targeting `money.udn.com` subdomain.
- **URL Pattern**: `https://money.udn.com/money/story/{section_id}/{article_id}`

#### Article URL Discovery: Commercial Times
- ⚠️ **STATUS: DEFERRED** — markdown.new 回傳 500，Homepage JS-heavy 無法爬取 URL，暫緩處理
- **RSS**: Not available. Same group as China Times (RSS closed).
- **Homepage Crawler (待實作)**: Must crawl homepage for article links.
- **URL Pattern**: `https://www.ctee.com.tw/news/{article_id}.html`
- **待解決方案** (優先序): RSSHub (`rsshub.app/ctee/realtime`) → curl_cffi → Playwright

### 6. Tech/New Media

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| Inside | `INSIDE` | https://www.inside.com.tw | Neutral | Tech Media | Allowed | LOW | PASS | Tech industry news |
| TechNews | `TECHNEWS` | https://technews.tw | Neutral | Tech Media | Allowed | LOW | PASS | Tech and science news |
| iThome | `ITHOME` | https://www.ithome.com.tw | Neutral | IT Media | Allowed | LOW | PASS | IT industry professional coverage |

#### Article URL Discovery: Inside
- **RSS**: Not available in social-radar config. Needs homepage crawler or sitemap.
- **URL Pattern**: `https://www.inside.com.tw/article/{article_id}`

#### Article URL Discovery: TechNews
- **RSS**: Not available in social-radar config. Needs homepage crawler or sitemap.
- **URL Pattern**: `https://technews.tw/{year}/{month}/{day}/{article_slug}/`

#### Article URL Discovery: iThome
- **RSS**: Not available in social-radar config. Needs homepage crawler or sitemap.
- **URL Pattern**: `https://www.ithome.com.tw/news/{article_id}`

### 7. Investigative Journalism

| Source (Chinese) | Enum Key | Homepage URL | Political Stance | Category | robots.txt | Crawl Priority | markdown.new | Notes |
|------------------|----------|-------------|-----------------|----------|-----------|---------------|-------------|-------|
| Rew Causas | `REW_CAUSAS` | https://www.storm.mg/new7 | Neutral-green | Political Magazine | Allowed | MEDIUM | **FAIL** | Merged into Storm Media, but retains independent editorial. **Use Storm Media RSS instead** |
| Storm Media | `STORM_MEDIA` | https://www.storm.mg | Neutral | New Media | Allowed | MEDIUM | PASS | In-depth political and social coverage |

#### Article URL Discovery: Storm Media
- **RSS (PRIMARY)**: Enabled via API-based RSS
  - Full site: `https://www.storm.mg/api/getRss/channel_id/2`
  - ⚠️ **注意**: RSS 回傳相對路徑 (e.g. `/11108787?utm_source=rss`)，需補全為 `https://www.storm.mg/11108787`
- **URL Pattern**: `https://www.storm.mg/article/{article_id}`

#### Article URL Discovery: Rew Causas
- **RSS**: No separate RSS. Rew Causas articles are included in Storm Media's RSS feed.
- **Filter method**: Filter Storm Media RSS entries by URL path containing `/new7/`
- **URL Pattern**: `https://www.storm.mg/new7/article/{article_id}`

---

## RSS Availability Summary

| Source | RSS Status | RSS Type | Enabled in social-radar | Notes |
|--------|-----------|----------|------------------------|-------|
| CNA | Available | Feedburner | Yes (4 feeds) | politics, finance, social, life. Instant feed disabled (404) |
| PTS | Available | Official | Yes | Single combined feed |
| Liberty Times (LTN) | Available | Official | Yes (4 feeds) | politics, society, life, business |
| UDN | **FAILED** | RSSHub | No | All RSSHub instances return 503/403. Use JSON API crawler |
| China Times | **CLOSED** | N/A | No | Official RSS fully shut down (404/403). RSSHub also fails (503) |
| Storm Media | Available | API-based | Yes | `/api/getRss/channel_id/2`, verified 44 entries |
| The News Lens | Available | Feedburner | Yes | Single combined feed |
| The Reporter | Available | Official | Yes | `rss2.xml`, low frequency (max_age_days: 30) |
| Google News TW | Available | Topic feeds | Yes (3 feeds) | Aggregator, not a primary source for PowerReader |
| CommonWealth | Not configured | N/A | No | Not in social-radar RSS config |
| Business Weekly | Not configured | N/A | No | Not in social-radar RSS config |
| Economic Daily | Not configured | N/A | No | Same UDN group, RSSHub fails |
| Commercial Times | Not configured | N/A | No | Same China Times group, RSS closed |
| Inside | Not configured | N/A | No | Not in social-radar RSS config |
| TechNews | Not configured | N/A | No | Not in social-radar RSS config |
| iThome | Not configured | N/A | No | Not in social-radar RSS config |

---

## URL Patterns and CSS Selectors

> **NOTE**: CSS selectors are NOT used for content extraction (markdown.new handles that).
> These selectors are preserved as FALLBACK documentation in case markdown.new fails for a specific source.
> For CNA (.aspx blocked by markdown.new), CSS selectors ARE used as the primary extraction method.

### Liberty Times (LIBERTY_TIMES)

```
URL Pattern:
  Article: https://news.ltn.com.tw/news/{category}/{article_id}
  Example: https://news.ltn.com.tw/news/politics/breakingnews/4567890

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.whiteTitle, div.news_title h1
  Content:  div.text p, div.news_content p
  Date:     span.time, time.date
  Author:   span.author, div.writer

Known Issues:
  - Some pages use lazy loading for image blocks
  - Breaking news (breakingnews) and regular news have different URL structures
  - Homepage listing uses AJAX pagination
```

### China Times (CHINA_TIMES)

```
URL Pattern:
  Article: https://www.chinatimes.com/{category}/{article_id}
  Example: https://www.chinatimes.com/realtimenews/20260306001234-260407

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title
  Content:  div.article-body p
  Date:     time[datetime], span.date
  Author:   span.author

Known Issues:
  - Paywall: Some exclusive reports require subscription (Premium label)
  - Has anti-bot detection, must control request frequency
  - Category path contains both realtime (realtimenews) and general (newspapers)
  - RSS CLOSED: Must use homepage crawler to discover article URLs
```

### United Daily News (UNITED_DAILY_NEWS)

```
URL Pattern:
  Article: https://udn.com/news/story/{section_id}/{article_id}
  Example: https://udn.com/news/story/6656/7654321

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title__text
  Content:  section.article-body__editor p
  Date:     time.article-content__time
  Author:   span.article-content__author

Known Issues:
  - UDN group shares domain (udn.com), must distinguish /news/ vs /global/ vs /health/
  - Has member wall: Monthly free article limit
  - Heavy JavaScript rendering, some articles require DOM load wait
  - Crawl-delay specified in robots.txt, must strictly comply
  - RSS FAILED: Must use JSON API crawler (udn_crawler.py)
```

### CommonWealth Magazine (COMMON_WEALTH)

```
URL Pattern:
  Article: https://www.cw.com.tw/article/{article_id}
  Example: https://www.cw.com.tw/article/5130123

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title, h2.title
  Content:  div.article-body p, article.content p
  Date:     time.published-date
  Author:   a.author-name, span.author

Known Issues:
  - Strict paywall: Most long-form articles require subscription, free access shows only first 2-3 paragraphs
  - Paywalled article HTML does not contain full text (backend restriction, not frontend hiding)
  - Should mark is_paywalled = true, only crawl free articles with complete content
```

### Business Weekly (BUSINESS_WEEKLY)

```
URL Pattern:
  Article: https://www.businessweekly.com.tw/focus/blog/{article_id}
  Example: https://www.businessweekly.com.tw/focus/blog/3014567

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title
  Content:  div.article-content p, div.single-post-content p
  Date:     span.date, time.publish-date
  Author:   span.author-name

Known Issues:
  - Paywall: Similar to CommonWealth, some articles restricted to subscribers
  - Category path in URL (focus/blog, business/indep) may change
  - Article pages load heavy ad scripts, affecting crawl speed
```

### The News Lens (THE_NEWS_LENS)

```
URL Pattern:
  Article: https://www.thenewslens.com/article/{article_id}
  Example: https://www.thenewslens.com/article/201234

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title
  Content:  div.article-body-content p
  Date:     time.article-date
  Author:   a.article-author, span.author-name

Known Issues:
  - No paywall, but has embedded social media content (Twitter/Instagram embed)
  - Must filter embedded iframes, keep only body paragraphs
  - Some articles are external submissions, title contains [Reader Submission] tag
```

### The Reporter (THE_REPORTER)

```
URL Pattern:
  Article: https://www.twreporter.org/a/{article_slug}
  Example: https://www.twreporter.org/a/taiwan-election-2026-analysis

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1, article header h1
  Content:  article div[class*="content"] p, div.article-body p
  Date:     time[datetime], div.date
  Author:   span.author, a[href*="/author/"]

Known Issues:
  - Uses React SSR, HTML structure is regular but class names contain hashes (CSS-in-JS)
  - Article slug is English semantic path (not numeric ID)
  - Long-form investigative reports may have pagination, must detect "next page" links
  - Photo essays (photo essay) are image-heavy with minimal text, should skip
```

### CNA (CNA)

```
URL Pattern:
  Article: https://www.cna.com.tw/news/{category}/{article_id}.aspx
  Example: https://www.cna.com.tw/news/aipl/202603060123.aspx

markdown.new: FAIL (Tested: 2026-03-07)
  Reason: .aspx URLs are blocked by markdown.new

CSS Selectors (PRIMARY — used because markdown.new FAILS):
  Title:    h1.centralContent h1, div.centralContent h1 span
  Content:  div.paragraph p
  Date:     div.updatetime span, time.date
  Author:   div.paragraph span.author

Known Issues:
  - URL uses .aspx extension (ASP.NET backend)
  - Article ID format is date + serial number (e.g., 202603060123)
  - Some old articles may be archived, URL may fail (return 404)
  - Author field is sometimes embedded at the end of a paragraph rather than a separate element
  - MUST use CSS-based extraction; markdown.new does not work for this source
```

### PTS News (PTS)

```
URL Pattern:
  Article: https://news.pts.org.tw/article/{article_id}
  Example: https://news.pts.org.tw/article/654321

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title
  Content:  div.article-content p, div.post-article p
  Date:     span.article-time, time.date
  Author:   span.reporter

Known Issues:
  - Has both text news and video news, should filter text news by article path
  - Video news pages may have only a brief summary (below MIN_ARTICLE_CHARS)
  - HTML structure is relatively clean, low crawl difficulty
```

### Economic Daily News (ECONOMIC_DAILY_NEWS)

```
URL Pattern:
  Article: https://money.udn.com/money/story/{section_id}/{article_id}
  Example: https://money.udn.com/money/story/5613/7654321

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article-title__text
  Content:  section.article-body__editor p
  Date:     time.article-content__time
  Author:   span.article-content__author

Known Issues:
  - Shares udn.com domain with United Daily News, but on money subdomain
  - CSS selector structure highly similar to UDN (same system)
  - Stock market real-time data pages are not news articles, should exclude /realtime/ path
```

### Commercial Times (COMMERCIAL_TIMES)

```
URL Pattern:
  Article: https://www.ctee.com.tw/news/{article_id}.html
  Example: https://www.ctee.com.tw/news/20260306700123-430501.html

markdown.new: FAIL (Tested: 2026-03-07)
  Reason: JS-heavy rendering, markdown.new returns incomplete content

CSS Selectors (PRIMARY — used because markdown.new FAILS):
  Title:    h1.article-title
  Content:  div.entry-content p, article.article-body p
  Date:     time[datetime], span.post-date
  Author:   span.author

Known Issues:
  - Same group as China Times (Want Want), but completely different URL structure
  - Some industry report articles are extremely long, should set MAX_ARTICLE_CHARS limit
  - Financial data tables should not be included in text analysis (pure numbers)
  - MUST use CSS-based extraction; markdown.new returns incomplete content
```

### Inside (INSIDE)

```
URL Pattern:
  Article: https://www.inside.com.tw/article/{article_id}
  Example: https://www.inside.com.tw/article/35123-taiwan-ai-startup

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.entry-title
  Content:  div.entry-content p
  Date:     time.entry-date, span.date
  Author:   a.author-link, span.author

Known Issues:
  - Article ID uses mixed numeric + slug format
  - Has sponsored content (sponsored) that should be identified and tagged, not included in stance analysis
  - Tech articles contain lots of English terms, word segmentation may produce fragments
```

### TechNews (TECHNEWS)

```
URL Pattern:
  Article: https://technews.tw/{year}/{month}/{day}/{article_slug}/
  Example: https://technews.tw/2026/03/06/taiwan-semiconductor-outlook/

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.entry-title
  Content:  div.indent p
  Date:     span.body span.date
  Author:   a[href*="/author/"]

Known Issues:
  - URL contains full date path (year/month/day)
  - WordPress architecture, stable HTML structure but contains many plugin scripts
  - Translated articles account for a significant proportion, must identify if Taiwan-original
```

### iThome (ITHOME)

```
URL Pattern:
  Article: https://www.ithome.com.tw/news/{article_id}
  Example: https://www.ithome.com.tw/news/165432

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.page-header
  Content:  div.field-name-body p
  Date:     span.created, div.submitted span.date
  Author:   span.author a

Known Issues:
  - Security news articles contain lots of technical log fragments, should filter <code> and <pre> blocks
  - Some articles are "tech perspective" columns, blog-style not news reporting
  - IT-specific terminology is dense, political stance analysis may not apply (should tag category=tech)
```

### Rew Causas (REW_CAUSAS)

```
URL Pattern:
  Article: https://www.storm.mg/new7/article/{article_id}
  Example: https://www.storm.mg/new7/article/5012345

markdown.new: FAIL (Tested: 2026-03-07)
  Reason: Use Storm Media RSS feed and filter by /new7/ path instead

CSS Selectors (FALLBACK):
  Title:    h1.article_title
  Content:  div.article_content p
  Date:     span.info_time
  Author:   span.info_author a

Known Issues:
  - Merged into Storm Media website, URL path distinguished by /new7/
  - Shares same domain as STORM_MEDIA, must distinguish by URL path
  - Political commentary articles are a high proportion, suitable for stance analysis
  - Obtain article URLs from Storm Media RSS feed filtered by /new7/ path
```

### Storm Media (STORM_MEDIA)

```
URL Pattern:
  Article: https://www.storm.mg/article/{article_id}
  Example: https://www.storm.mg/article/5012345

markdown.new: PASS (Tested: 2026-03-07)

CSS Selectors (FALLBACK):
  Title:    h1.article_title
  Content:  div.article_content p
  Date:     span.info_time
  Author:   span.info_author a

Known Issues:
  - Shares domain with Rew Causas, must exclude /new7/ path
  - Has "submission" articles (reader submissions), should tag separately
  - Paywall: Some in-depth reports require subscription (Premium label)
```

---

## Source Classification Statistics

| Category | Count | Sources | Crawl Strategy |
|----------|-------|---------|---------------|
| Pan-Green Media | 1 (active) | Liberty Times | Every 3 hours |
| Pan-Blue Media | 2 | China Times, United Daily News | Every 3 hours |
| Neutral/Independent | 4 | CommonWealth, Business Weekly, The News Lens, The Reporter | Every 6 hours (some paywalled) |
| Public Media | 2 | CNA, PTS | Every 3 hours |
| Economic Media | 2 | Economic Daily News, Commercial Times | Every 6 hours |
| Tech/New Media | 3 | Inside, TechNews, iThome | Every 12 hours |
| Investigative | 2 | Rew Causas, Storm Media | Every 6 hours |
| **Ceased publication** | 1 | Taiwan Apple Daily (ceased 2021) | DISABLED |

**Active sources total**: 16
**Ceased publication**: 1 (Taiwan Apple Daily)

---

## Crawl Priority Definitions

| Priority | Crawl Frequency | Applicable Sources | Description |
|----------|----------------|-------------------|-------------|
| HIGH | Every 3 hours (CRON `0 */3 * * *`) | Liberty Times, China Times, UDN, CNA, PTS | High circulation, frequent updates, high contrast value for stance analysis |
| MEDIUM | Every 6 hours (CRON `0 */6 * * *`) | CommonWealth, Business Weekly, The News Lens, The Reporter, Economic Daily, Commercial Times, Rew Causas, Storm Media | Medium update frequency, focused on in-depth reporting |
| LOW | Every 12 hours (CRON `0 */12 * * *`) | Inside, TechNews, iThome | Tech category, lower value for political stance analysis |
| DISABLED | Not crawled | Taiwan Apple Daily | Ceased publication, Enum Key retained for historical compatibility only |

---

## Adding New Sources Checklist

When adding a new source, complete the following steps in order:

### Step 1: Compliance Review (T06 review)
- [ ] Confirm the source's `robots.txt` allows crawling news article paths
- [ ] Confirm the `Crawl-delay` value in `robots.txt` (if any), and ensure >= `CRAWLER.RATE_LIMIT_DELAY_MS` (2000ms)
- [ ] Confirm the source's Terms of Service does not explicitly prohibit automated crawling
- [ ] Confirm the source operates legally in Taiwan

### Step 2: Technical Verification (T02 implementation)
- [ ] Obtain at least 3 article URLs and verify URL Pattern stability
- [ ] Test markdown.new compatibility (record PASS/FAIL and test date)
- [ ] If markdown.new FAILS: confirm CSS selectors can extract: title, content, publish date, author
- [ ] Confirm article length >= `ANALYSIS.MIN_ARTICLE_CHARS` (100 characters)
- [ ] Test paywall: confirm free article content can be fully extracted
- [ ] Check RSS availability (official RSS, Feedburner, RSSHub, or API endpoints)
- [ ] If no RSS: document homepage crawling strategy for URL discovery

### Step 3: Update SSOT Documents
- [ ] Add the source's complete information row in this document (NEWS_SOURCES.md)
- [ ] Add Enum Key in the `NEWS_SOURCES` object in `shared/enums.js`
- [ ] Assign political stance label (requires T03 team assistance)
- [ ] Set crawl priority (HIGH / MEDIUM / LOW)

### Step 4: Cross-Team Notifications
- [ ] Notify T01: KV_SCHEMA.md does not need modification (schema is generic), but confirm KV write volume changes
- [ ] Notify T03: New source may require Prompt fine-tuning (different media writing styles)
- [ ] Notify T04: Frontend dropdown must update source list
- [ ] Notify T06: Update CRAWLER_COMPLIANCE.md compliance checklist
- [ ] Create cross-team request file in `shared/cross_team_comms/`

### Step 5: Record Changes
- [ ] Update the "Change Log" section of this document
- [ ] Update MASTER_ROADMAP.md decision log

---

## Common Mistakes

### Mistake 1: Hard-coding source names
```javascript
// WRONG
if (source === "Liberty Times") { ... }

// CORRECT
import { NEWS_SOURCES } from '../shared/enums.js';
if (source === NEWS_SOURCES.LIBERTY_TIMES) { ... }
```
- **Reason**: Hard-coding causes missed updates when source names change, and prevents static analysis of references.
- **Lesson source**: OceanRAG Enum management failure case

### Mistake 2: Ignoring robots.txt Crawl-delay
```javascript
// WRONG: Only check Allow/Disallow, ignore Crawl-delay
if (robotsTxt.isAllowed('/news/')) {
  await fetch(url); // Immediate request
}

// CORRECT: Also comply with Crawl-delay
if (robotsTxt.isAllowed('/news/')) {
  const delay = Math.max(robotsTxt.getCrawlDelay(), CRAWLER.RATE_LIMIT_DELAY_MS);
  await sleep(delay);
  await fetch(url);
}
```
- **Reason**: Violating Crawl-delay may result in IP blocking or legal issues.
- **Note**: Some robots.txt use inconsistent units for Crawl-delay (seconds vs milliseconds). If value > 100, treat as milliseconds; otherwise treat as seconds.

### Mistake 3: Not distinguishing UDN group multi-site domains
```javascript
// WRONG: Tagging money.udn.com articles as UNITED_DAILY_NEWS
const source = NEWS_SOURCES.UNITED_DAILY_NEWS; // But it's actually Economic Daily!

// CORRECT: Distinguish by subdomain
function resolveUdnSource(url) {
  const hostname = new URL(url).hostname;
  if (hostname === 'money.udn.com') return NEWS_SOURCES.ECONOMIC_DAILY_NEWS;
  if (hostname === 'udn.com') return NEWS_SOURCES.UNITED_DAILY_NEWS;
  throw new Error(`Unknown UDN subdomain: ${hostname}`);
}
```
- **Reason**: UDN group (udn.com, money.udn.com) shares domain but belongs to different media brands.

### Mistake 4: Not distinguishing Storm Media and Rew Causas URLs
```javascript
// WRONG: Tagging /new7/ path articles as STORM_MEDIA
const source = NEWS_SOURCES.STORM_MEDIA;

// CORRECT: Distinguish by URL path
function resolveStormSource(url) {
  const path = new URL(url).pathname;
  if (path.startsWith('/new7/')) return NEWS_SOURCES.REW_CAUSAS;
  return NEWS_SOURCES.STORM_MEDIA;
}
```
- **Reason**: After Rew Causas merged into Storm Media's website, the /new7/ path is the only differentiator, but they share the same domain.

### Mistake 5: Treating paywall-truncated articles as complete
```javascript
// WRONG: Not checking if paywall-truncated
const content = extractContent(html);
await saveArticle(content); // Might only have first 2 paragraphs!

// CORRECT: Detect paywall markers
function extractContent(html, source) {
  const content = extractMainText(html);
  const isPaywalled = html.includes('premium') || html.includes('subscribe-wall');
  if (isPaywalled && content.length < 500) {
    return { content, is_paywalled: true, is_complete: false };
  }
  return { content, is_paywalled: false, is_complete: true };
}
```
- **Reason**: Truncated article stance analysis results are unreliable, and MinHash deduplication will produce incorrect low similarity scores.

### Mistake 6: Apple Daily Enum Key still in crawl list
```javascript
// WRONG: Scheduling crawls for ceased Apple Daily
const sourcesToCrawl = Object.keys(NEWS_SOURCES); // Includes TAIWAN_APPLE_DAILY!

// CORRECT: Filter out ceased sources
const DISABLED_SOURCES = [NEWS_SOURCES.TAIWAN_APPLE_DAILY];
const sourcesToCrawl = Object.values(NEWS_SOURCES)
  .filter(source => !DISABLED_SOURCES.includes(source));
```
- **Reason**: Taiwan Apple Daily ceased publication in 2021, Enum Key retained only for historical compatibility and should not be scheduled for crawling.

### Mistake 7: Using markdown.new for CNA .aspx URLs
```javascript
// WRONG: Sending CNA .aspx URLs to markdown.new
const markdown = await fetch(`https://markdown.new/${cnaUrl}`);
// Returns error or empty content — .aspx URLs are blocked!

// CORRECT: Use CSS-based extraction for CNA
function extractContent(url, source) {
  if (source === NEWS_SOURCES.CNA) {
    // CNA uses .aspx — markdown.new FAILS
    return extractWithCssSelectors(url, CNA_SELECTORS);
  }
  // All other PASS sources use markdown.new
  return extractWithMarkdownNew(url);
}
```
- **Reason**: markdown.new blocks .aspx URLs. CNA is the only source requiring CSS-based extraction as the primary method.
- **Discovery date**: 2026-03-07
- **Impact**: T02 crawler must implement dual extraction paths (markdown.new + CSS fallback)

### Mistake 8: Assuming all sources have RSS feeds
```javascript
// WRONG: Assuming every source has an RSS feed for URL discovery
const rssUrl = getRssFeed(source);
const articles = await parseRss(rssUrl); // Fails for UDN and China Times!

// CORRECT: Check RSS availability per source
function discoverArticleUrls(source) {
  switch (source) {
    case NEWS_SOURCES.UNITED_DAILY_NEWS:
    case NEWS_SOURCES.ECONOMIC_DAILY_NEWS:
      // UDN group: RSSHub FAILED, use JSON API crawler
      return crawlUdnJsonApi(source);
    case NEWS_SOURCES.CHINA_TIMES:
    case NEWS_SOURCES.COMMERCIAL_TIMES:
      // China Times group: RSS CLOSED, use homepage crawler
      return crawlHomepage(source);
    default:
      // Most sources: RSS available
      return parseRss(getRssFeed(source));
  }
}
```
- **Reason**: UDN's RSSHub instances all return 503/403. China Times' official RSS is fully shut down (404/403). These sources require alternative URL discovery strategies (JSON API or homepage crawling).
- **Discovery date**: 2026-03-07 (verified from social-radar rss_sources.yaml)
- **Impact**: T02 crawler must implement three URL discovery strategies: RSS, JSON API, and homepage crawling

---

## Change Log

| Version | Date | Changes | Reason | Affected Teams |
|---------|------|---------|--------|---------------|
| v0.1 | 2025-03-06 | Skeleton version | Quick architecture setup | All teams |
| v1.0 | 2026-03-06 | Full version: 17 sources with detailed info, URL Patterns, CSS selectors, known issues, new source checklist, 6 Common Mistakes | Complete SSOT content, support T02 crawler development | T01, T02, T03, T04, T06 |
| v2.0 | 2026-03-07 | markdown.new compatibility audit (13/16 PASS), Article URL Discovery sections per source, RSS availability summary from social-radar rss_sources.yaml, CSS selectors reclassified as FALLBACK (except CNA), 2 new Common Mistakes (#7 markdown.new + CNA, #8 RSS availability), updated checklist for markdown.new testing | Transition to markdown.new for content extraction; document RSS availability for URL discovery strategy | T01, T02, T03, T06 |

---

**Important Reminder**:
Before modifying this document, you must:
1. Submit a GitHub PR for discussion
2. Notify all downstream teams (T01, T03, T04, T06)
3. Synchronize updates to the `NEWS_SOURCES` object in `shared/enums.js`
4. M01 reviews cross-team impact

---

**Document maintainer**: T02 (Data Acquisition Team)
**Last updated**: 2026-03-07
**Next review**: End of Phase 2
