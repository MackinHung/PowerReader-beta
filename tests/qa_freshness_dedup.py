"""
PowerReader T02 QA — 新鮮度 & 去重驗證
驗證目標:
  1. 每 2 小時窗口內能取得多少新鮮文章
  2. 各來源的文章總數
  3. 跨來源標題重複率 (同事件不同報導)
  4. RSS/API 可靠性

測試範圍: 14 個活躍來源 (排除 DEFERRED: 中時、工商)
"""

import hashlib
import json
import re
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import feedparser
import requests

# ------------------------------------------------------------------
# 常數
# ------------------------------------------------------------------

TW_TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TW_TZ)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# 新鮮度窗口 (小時)
FRESHNESS_WINDOWS = [2, 4, 6, 12, 24]

# ------------------------------------------------------------------
# RSS 來源定義
# ------------------------------------------------------------------

RSS_SOURCES = [
    # LTN 自由時報 (4 feeds)
    {"key": "LIBERTY_TIMES", "name": "自由時報",
     "feeds": [
         "https://news.ltn.com.tw/rss/politics.xml",
         "https://news.ltn.com.tw/rss/society.xml",
         "https://news.ltn.com.tw/rss/life.xml",
         "https://news.ltn.com.tw/rss/business.xml",
     ]},
    # CNA 中央社 (4 feeds)
    {"key": "CNA", "name": "中央社",
     "feeds": [
         "https://feeds.feedburner.com/rsscna/politics",
         "https://feeds.feedburner.com/rsscna/finance",
         "https://feeds.feedburner.com/rsscna/social",
         "https://feeds.feedburner.com/rsscna/lifehealth",
     ]},
    # PTS 公視
    {"key": "PTS", "name": "公視新聞",
     "feeds": ["https://about.pts.org.tw/rss/XML/newsfeed.xml"]},
    # TheNewsLens 關鍵評論網
    {"key": "THE_NEWS_LENS", "name": "關鍵評論網",
     "feeds": ["https://feeds.feedburner.com/TheNewsLens"]},
    # TheReporter 報導者
    {"key": "THE_REPORTER", "name": "報導者",
     "feeds": ["https://www.twreporter.org/a/rss2.xml"]},
    # TechNews 科技新報
    {"key": "TECHNEWS", "name": "科技新報",
     "feeds": ["https://technews.tw/feed/"]},
    # iThome
    {"key": "ITHOME", "name": "iThome",
     "feeds": ["https://www.ithome.com.tw/rss"]},
    # Storm 風傳媒 (含新新聞，RSS 無法區分 /new7/ 路徑)
    {"key": "STORM_MEDIA", "name": "風傳媒",
     "feeds": ["https://www.storm.mg/api/getRss/channel_id/2"]},
]

# ------------------------------------------------------------------
# API 來源定義
# ------------------------------------------------------------------

API_SOURCES = [
    {"key": "UNITED_DAILY_NEWS", "name": "聯合報",
     "api_url": "https://udn.com/api/more?page=0&id=&channelId=1&cate_id=0&type=breaknews&totalRecNo=100"},
    {"key": "ECONOMIC_DAILY_NEWS", "name": "經濟日報",
     "api_url": "https://udn.com/api/more?page=0&id=&channelId=2&cate_id=0&type=breaknews&totalRecNo=100"},
]

# 需要傳統爬蟲的來源 (本次不測試內容，僅記錄)
HOMEPAGE_SOURCES = [
    {"key": "COMMON_WEALTH", "name": "天下雜誌", "status": "needs_crawler"},
    {"key": "BUSINESS_WEEKLY", "name": "商業週刊", "status": "needs_crawler"},
    {"key": "INSIDE", "name": "Inside", "status": "needs_crawler"},
]

DEFERRED_SOURCES = [
    {"key": "CHINA_TIMES", "name": "中國時報", "reason": "RSS 已關閉"},
    {"key": "COMMERCIAL_TIMES", "name": "工商時報", "reason": "JS-heavy + markdown.new 500"},
]


# ------------------------------------------------------------------
# 工具函式
# ------------------------------------------------------------------

def parse_datetime(dt_str: str) -> datetime | None:
    """解析各種日期格式為 timezone-aware datetime。"""
    if not dt_str:
        return None

    # feedparser 的 time_struct
    if hasattr(dt_str, "tm_year"):
        try:
            import calendar
            ts = calendar.timegm(dt_str)
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            return None

    # 常見 RSS 日期格式
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",      # RFC 822
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z",            # ISO 8601
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(dt_str.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TW_TZ)
            return dt
        except (ValueError, TypeError):
            continue

    # feedparser parsed_time
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(dt_str)
    except Exception:
        pass

    return None


def cjk_jaccard(title_a: str, title_b: str) -> float:
    """CJK 字元級 Jaccard 相似度。"""
    # 移除標點和空白
    clean_a = re.sub(r"[^\w]", "", title_a)
    clean_b = re.sub(r"[^\w]", "", title_b)

    if not clean_a or not clean_b:
        return 0.0

    set_a = set(clean_a)
    set_b = set(clean_b)

    intersection = len(set_a & set_b)
    union = len(set_a | set_b)

    return intersection / union if union > 0 else 0.0


def title_hash(title: str) -> str:
    """標題 SHA256 hash (用於精確去重)。"""
    clean = re.sub(r"\s+", "", title.strip())
    return hashlib.sha256(clean.encode("utf-8")).hexdigest()[:16]


# ------------------------------------------------------------------
# RSS 收集
# ------------------------------------------------------------------

def collect_rss_articles(source: dict) -> list[dict]:
    """從 RSS feeds 收集文章。"""
    articles = []
    seen_urls = set()

    for feed_url in source["feeds"]:
        try:
            feed = feedparser.parse(feed_url)

            if feed.bozo and not feed.entries:
                print(f"    [WARN] Feed parse error: {feed_url}")
                continue

            for entry in feed.entries:
                title = getattr(entry, "title", "") or ""
                link = getattr(entry, "link", "") or ""

                if not title or not link:
                    continue

                # Storm 相對路徑修正
                if not link.startswith("http"):
                    if "storm.mg" in feed_url:
                        link = f"https://www.storm.mg{link}"
                    else:
                        continue

                # 去 utm 參數
                link = link.split("?utm_")[0]

                if link in seen_urls:
                    continue
                seen_urls.add(link)

                # 解析發布時間
                pub_time = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    pub_time = parse_datetime(entry.published_parsed)
                elif hasattr(entry, "published") and entry.published:
                    pub_time = parse_datetime(entry.published)
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    pub_time = parse_datetime(entry.updated_parsed)

                actual_source = source["key"]

                summary = getattr(entry, "summary", "") or ""
                # 清理 HTML tags
                summary = re.sub(r"<[^>]+>", "", summary).strip()[:200]

                articles.append({
                    "source": actual_source,
                    "title": title.strip(),
                    "url": link.strip(),
                    "published_at": pub_time,
                    "summary": summary,
                    "title_hash": title_hash(title),
                })

        except Exception as e:
            print(f"    [ERROR] {feed_url}: {e}")

    return articles


# ------------------------------------------------------------------
# UDN API 收集
# ------------------------------------------------------------------

def collect_udn_articles(source: dict) -> list[dict]:
    """從 UDN JSON API 收集文章 (支援分頁，每頁最多 20 篇)。"""
    articles = []
    seen_urls = set()
    max_pages = 5  # 最多抓 5 頁 = 100 篇

    for page in range(max_pages):
        try:
            # 構建分頁 URL
            base = source["api_url"].replace("page=0", f"page={page}")
            resp = requests.get(base, headers=HEADERS, timeout=15)

            if resp.status_code != 200:
                print(f"    [WARN] Page {page} returned {resp.status_code}")
                break

            data = resp.json()
            items = data.get("lists", [])

            if not items:
                break

            for item in items:
                title = item.get("title", "")
                title_link = item.get("titleLink", "")
                time_str = item.get("time", {}).get("date", "")

                if not title or not title_link:
                    continue

                clean_path = title_link.split("?")[0]
                if source["key"] == "ECONOMIC_DAILY_NEWS":
                    url = f"https://money.udn.com{clean_path}"
                else:
                    url = f"https://udn.com{clean_path}"

                if url in seen_urls:
                    continue
                seen_urls.add(url)

                pub_time = parse_datetime(time_str) if time_str else None

                articles.append({
                    "source": source["key"],
                    "title": title.strip(),
                    "url": url,
                    "published_at": pub_time,
                    "summary": "",
                    "title_hash": title_hash(title),
                })

            # 檢查是否還有下一頁
            if data.get("end", False):
                break

            if page < max_pages - 1:
                time.sleep(1)  # 分頁間禮貌延遲

        except Exception as e:
            print(f"    [ERROR] UDN API page {page}: {e}")
            break

    return articles


# ------------------------------------------------------------------
# 去重分析
# ------------------------------------------------------------------

def analyze_duplicates(all_articles: list[dict]) -> dict:
    """分析跨來源重複文章。"""
    # 1. 精確標題重複 (hash match)
    hash_groups = defaultdict(list)
    for art in all_articles:
        hash_groups[art["title_hash"]].append(art)

    exact_dupes = {h: arts for h, arts in hash_groups.items() if len(arts) > 1}

    # 2. 模糊標題比對 (Jaccard >= 0.6 視為同事件)
    fuzzy_clusters = []
    used = set()

    for i, art_a in enumerate(all_articles):
        if i in used:
            continue

        cluster = [art_a]
        used.add(i)

        for j, art_b in enumerate(all_articles):
            if j in used or j <= i:
                continue
            if art_a["source"] == art_b["source"]:
                continue  # 同來源不算跨來源重複

            sim = cjk_jaccard(art_a["title"], art_b["title"])
            if sim >= 0.5:
                cluster.append(art_b)
                used.add(j)

        if len(cluster) > 1:
            fuzzy_clusters.append(cluster)

    return {
        "exact_duplicates": exact_dupes,
        "fuzzy_clusters": fuzzy_clusters,
    }


# ------------------------------------------------------------------
# 新鮮度分析
# ------------------------------------------------------------------

def analyze_freshness(all_articles: list[dict]) -> dict:
    """分析文章新鮮度分布。"""
    results = {}

    articles_with_time = [a for a in all_articles if a["published_at"] is not None]
    articles_no_time = [a for a in all_articles if a["published_at"] is None]

    for window_h in FRESHNESS_WINDOWS:
        cutoff = NOW - timedelta(hours=window_h)
        fresh = [a for a in articles_with_time if a["published_at"] >= cutoff]
        results[f"within_{window_h}h"] = len(fresh)

    results["has_timestamp"] = len(articles_with_time)
    results["no_timestamp"] = len(articles_no_time)
    results["total"] = len(all_articles)

    return results


# ------------------------------------------------------------------
# 主程序
# ------------------------------------------------------------------

def run_qa():
    """執行完整 QA 驗證。"""
    print("=" * 70)
    print(f"PowerReader T02 QA — 新鮮度 & 去重驗證")
    print(f"測試時間: {NOW.isoformat()}")
    print(f"活躍來源: {len(RSS_SOURCES) + len(API_SOURCES)} (RSS/API)")
    print(f"需爬蟲來源: {len(HOMEPAGE_SOURCES)}")
    print(f"暫緩來源: {len(DEFERRED_SOURCES)}")
    print("=" * 70)

    all_articles = []
    source_stats = {}

    # ----- Phase 1: RSS 收集 -----
    print("\n[Phase 1] RSS sources collection")
    print("-" * 40)

    for src in RSS_SOURCES:
        print(f"\n  [{src['key']}] {src['name']} ({len(src['feeds'])} feeds)")
        time.sleep(1)  # 禮貌延遲

        articles = collect_rss_articles(src)

        source_stats[src["key"]] = len(articles)
        print(f"    -> {len(articles)} articles")

        all_articles.extend(articles)

    # ----- Phase 2: API 收集 -----
    print("\n\n[Phase 2] API sources collection")
    print("-" * 40)

    for src in API_SOURCES:
        print(f"\n  [{src['key']}] {src['name']}")
        time.sleep(1)

        articles = collect_udn_articles(src)
        source_stats[src["key"]] = len(articles)
        print(f"    → {len(articles)} 篇")

        all_articles.extend(articles)

    # ----- Phase 3: 新鮮度分析 -----
    print("\n\n[Phase 3] Freshness analysis")
    print("-" * 40)

    freshness = analyze_freshness(all_articles)
    print(f"\n  文章總數: {freshness['total']}")
    print(f"  有時間戳: {freshness['has_timestamp']}")
    print(f"  無時間戳: {freshness['no_timestamp']}")
    print()

    for window_h in FRESHNESS_WINDOWS:
        count = freshness[f"within_{window_h}h"]
        pct = (count / freshness["total"] * 100) if freshness["total"] > 0 else 0
        bar = "#" * int(pct / 2) + "." * (50 - int(pct / 2))
        print(f"  {window_h:2d}h 內: {count:4d} 篇 ({pct:5.1f}%) {bar}")

    # 各來源 2h 新鮮度
    print(f"\n  --- 各來源 2h 新鮮文章 ---")
    cutoff_2h = NOW - timedelta(hours=2)
    for src_key in sorted(source_stats.keys()):
        src_articles = [a for a in all_articles if a["source"] == src_key]
        fresh_2h = [a for a in src_articles
                    if a["published_at"] is not None and a["published_at"] >= cutoff_2h]
        total = len(src_articles)
        fresh = len(fresh_2h)
        print(f"  {src_key:25s} | 總數: {total:3d} | 2h 新鮮: {fresh:3d}")

    # ----- Phase 4: 去重分析 -----
    print("\n\n[Phase 4] Cross-source dedup analysis")
    print("-" * 40)

    dedup = analyze_duplicates(all_articles)

    print(f"\n  精確標題重複: {len(dedup['exact_duplicates'])} 組")
    for h, arts in list(dedup["exact_duplicates"].items())[:5]:
        sources = [a["source"] for a in arts]
        title = arts[0]["title"][:40]
        print(f"    [{', '.join(sources)}] {title}...")

    print(f"\n  模糊相似群組 (Jaccard ≥ 0.5): {len(dedup['fuzzy_clusters'])} 組")
    for cluster in dedup["fuzzy_clusters"][:10]:
        sources = list(set(a["source"] for a in cluster))
        titles = [a["title"][:30] for a in cluster[:3]]
        print(f"    [{', '.join(sources)}] ({len(cluster)} 篇)")
        for t in titles:
            print(f"      → {t}...")

    # 去重後文章數
    unique_hashes = set()
    unique_articles = []
    for art in all_articles:
        if art["title_hash"] not in unique_hashes:
            unique_hashes.add(art["title_hash"])
            unique_articles.append(art)

    print(f"\n  去重前: {len(all_articles)} 篇")
    print(f"  精確去重後: {len(unique_articles)} 篇")
    print(f"  模糊聚合後: ~{len(all_articles) - sum(len(c) - 1 for c in dedup['fuzzy_clusters'])} 篇 (估計)")

    # ----- Phase 5: 摘要報告 -----
    print("\n\n" + "=" * 70)
    print("QA Summary")
    print("=" * 70)

    print(f"""
  測試時間:        {NOW.strftime('%Y-%m-%d %H:%M:%S')} (UTC+8)
  活躍來源數:      {len(source_stats)} 個
  文章總數:        {freshness['total']} 篇
  2h 新鮮文章:     {freshness['within_2h']} 篇
  精確重複組:      {len(dedup['exact_duplicates'])} 組
  模糊相似組:      {len(dedup['fuzzy_clusters'])} 組
  精確去重後:      {len(unique_articles)} 篇
""")

    # 2h 窗口評估
    if freshness["within_2h"] >= 30:
        verdict = "[PASS] Sufficient - enough fresh articles per 2h window"
    elif freshness["within_2h"] >= 15:
        verdict = "[WARN] Marginal - consider expanding to 3h window"
    else:
        verdict = "[FAIL] Insufficient - need more sources or adjust frequency"
    print(f"  2h 窗口評估: {verdict}")

    # 去重率
    if len(all_articles) > 0:
        dedup_rate = (1 - len(unique_articles) / len(all_articles)) * 100
        print(f"  跨來源重複率: {dedup_rate:.1f}%")

    # 各來源數量排行
    print(f"\n  --- 來源文章數排行 ---")
    for src_key, count in sorted(source_stats.items(), key=lambda x: -x[1]):
        bar = "#" * (count // 2)
        print(f"  {src_key:25s} | {count:3d} 篇 {bar}")

    # 未測試來源
    print(f"\n  --- 未測試來源 ---")
    for src in HOMEPAGE_SOURCES:
        print(f"  [ ] {src['name']} ({src['key']}) -- {src['status']}")
    for src in DEFERRED_SOURCES:
        print(f"  [-] {src['name']} ({src['key']}) -- {src['reason']}")

    # ----- 儲存報告 -----
    report = {
        "test_time": NOW.isoformat(),
        "source_stats": source_stats,
        "freshness": freshness,
        "total_articles": len(all_articles),
        "unique_articles": len(unique_articles),
        "exact_duplicate_groups": len(dedup["exact_duplicates"]),
        "fuzzy_clusters": len(dedup["fuzzy_clusters"]),
        "articles_sample": [
            {
                "source": a["source"],
                "title": a["title"],
                "url": a["url"],
                "published_at": a["published_at"].isoformat() if a["published_at"] else None,
            }
            for a in all_articles[:200]  # 前 200 篇樣本
        ],
        "fuzzy_cluster_details": [
            {
                "sources": list(set(a["source"] for a in cluster)),
                "titles": [a["title"] for a in cluster],
                "count": len(cluster),
            }
            for cluster in dedup["fuzzy_clusters"][:30]
        ],
    }

    report_path = "tests/qa_freshness_dedup_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n  詳細報告: {report_path}")

    return report


if __name__ == "__main__":
    run_qa()
