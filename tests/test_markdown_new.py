"""
PowerReader — markdown.new API 相容性測試
對 16 個台灣新聞來源逐一測試 markdown.new 能否正確轉換文章為 Markdown。

測試流程:
1. 透過 RSS 或 homepage 取得每個來源的一篇真實文章 URL
2. 將 URL 傳給 markdown.new API
3. 記錄: 成功/失敗, 回應時間, 內容長度, token 數, 品質指標
4. 產出測試報告
"""

import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import urlparse

import requests

# ------------------------------------------------------------------
# 常數
# ------------------------------------------------------------------

MARKDOWN_NEW_API = "https://markdown.new/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# 每個來源的 RSS URL 或備用抓取方式
SOURCES = [
    {
        "key": "LIBERTY_TIMES",
        "name": "自由時報",
        "rss": "https://news.ltn.com.tw/rss/politics.xml",
        "url_pattern": r"https://news\.ltn\.com\.tw/news/\w+/\w+/\d+",
    },
    {
        "key": "CHINA_TIMES",
        "name": "中國時報",
        "rss": None,
        "homepage": "https://www.chinatimes.com/realtimenews/?chdtv",
        "url_pattern": r"https://www\.chinatimes\.com/\w+/\d+-\d+",
    },
    {
        "key": "UNITED_DAILY_NEWS",
        "name": "聯合報",
        "rss": None,
        "api": "https://udn.com/api/more?page=0&id=&channelId=1&cate_id=0&type=breaknews&totalRecNo=20",
        "url_pattern": r"/news/story/\d+/\d+",
    },
    {
        "key": "CNA",
        "name": "中央社",
        "rss": "https://feeds.feedburner.com/rsscna/politics",
        "url_pattern": r"https://www\.cna\.com\.tw/news/\w+/\d+\.aspx",
    },
    {
        "key": "PTS",
        "name": "公視新聞",
        "rss": "https://about.pts.org.tw/rss/XML/newsfeed.xml",
        "url_pattern": r"https://news\.pts\.org\.tw/article/\d+",
    },
    {
        "key": "COMMON_WEALTH",
        "name": "天下雜誌",
        "rss": None,
        "homepage": "https://www.cw.com.tw/",
        "url_pattern": r"https://www\.cw\.com\.tw/article/\d+",
    },
    {
        "key": "BUSINESS_WEEKLY",
        "name": "商業週刊",
        "rss": None,
        "homepage": "https://www.businessweekly.com.tw/",
        "url_pattern": r"https://www\.businessweekly\.com\.tw/\w+/blog/\d+",
    },
    {
        "key": "THE_NEWS_LENS",
        "name": "關鍵評論網",
        "rss": "https://feeds.feedburner.com/TheNewsLens",
        "url_pattern": r"https://www\.thenewslens\.com/article/\d+",
    },
    {
        "key": "THE_REPORTER",
        "name": "報導者",
        "rss": "https://www.twreporter.org/a/rss2.xml",
        "url_pattern": r"https://www\.twreporter\.org/a/[\w-]+",
    },
    {
        "key": "ECONOMIC_DAILY_NEWS",
        "name": "經濟日報",
        "rss": None,
        "homepage": "https://money.udn.com/money/cate/5588",
        "url_pattern": r"https://money\.udn\.com/money/story/\d+/\d+",
    },
    {
        "key": "COMMERCIAL_TIMES",
        "name": "工商時報",
        "rss": None,
        "homepage": "https://www.ctee.com.tw/",
        "url_pattern": r"https://www\.ctee\.com\.tw/news/\d+-\d+\.html",
    },
    {
        "key": "INSIDE",
        "name": "Inside",
        "rss": None,
        "homepage": "https://www.inside.com.tw/",
        "url_pattern": r"https://www\.inside\.com\.tw/article/\d+",
    },
    {
        "key": "TECHNEWS",
        "name": "科技新報",
        "rss": "https://technews.tw/feed/",
        "url_pattern": r"https://technews\.tw/\d{4}/\d{2}/\d{2}/[\w-]+",
    },
    {
        "key": "ITHOME",
        "name": "iThome",
        "rss": "https://www.ithome.com.tw/rss",
        "url_pattern": r"https://www\.ithome\.com\.tw/news/\d+",
    },
    {
        "key": "STORM_MEDIA",
        "name": "風傳媒",
        "rss": "https://www.storm.mg/feeds/rss",
        "url_pattern": r"https://www\.storm\.mg/article/\d+",
    },
    {
        "key": "REW_CAUSAS",
        "name": "新新聞",
        "rss": None,
        "homepage": "https://www.storm.mg/new7",
        "url_pattern": r"https://www\.storm\.mg/new7/article/\d+",
    },
]


# ------------------------------------------------------------------
# Step 1: 取得真實文章 URL
# ------------------------------------------------------------------

def get_article_url_from_rss(rss_url: str) -> str | None:
    """從 RSS feed 取得第一篇文章的 URL。"""
    try:
        resp = requests.get(rss_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        # 嘗試 XML 解析
        root = ET.fromstring(resp.content)

        # RSS 2.0 format
        for item in root.iter("item"):
            link = item.find("link")
            if link is not None and link.text:
                return link.text.strip()

        # Atom format
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
            link = entry.find("atom:link[@rel='alternate']", ns)
            if link is None:
                link = entry.find("{http://www.w3.org/2005/Atom}link")
            if link is not None:
                href = link.get("href")
                if href:
                    return href.strip()

        return None
    except Exception as e:
        print(f"  [RSS ERROR] {e}")
        return None


def get_article_url_from_homepage(homepage_url: str, url_pattern: str) -> str | None:
    """從首頁 HTML 中找到符合 pattern 的第一篇文章 URL。"""
    try:
        resp = requests.get(homepage_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        # 用 regex 找所有符合 pattern 的 URL
        # 先從 href 屬性中找
        href_pattern = r'href=["\']([^"\']*)["\']'
        hrefs = re.findall(href_pattern, resp.text)

        for href in hrefs:
            # 補全相對 URL
            if href.startswith("/"):
                parsed = urlparse(homepage_url)
                href = f"{parsed.scheme}://{parsed.netloc}{href}"

            if re.match(url_pattern, href):
                return href

        return None
    except Exception as e:
        print(f"  [HOMEPAGE ERROR] {e}")
        return None


def get_article_url_from_udn_api(api_url: str) -> str | None:
    """從 UDN JSON API 取得第一篇文章的 URL。"""
    try:
        resp = requests.get(api_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        data = resp.json()
        items = data.get("lists", [])
        if not items:
            return None

        title_link = items[0].get("titleLink", "")
        if title_link:
            clean_path = title_link.split("?")[0]
            return f"https://udn.com{clean_path}"

        return None
    except Exception as e:
        print(f"  [UDN API ERROR] {e}")
        return None


def find_article_url(source: dict) -> str | None:
    """為單一來源找到一篇真實文章的 URL。"""
    # 方法 1: RSS
    if source.get("rss"):
        url = get_article_url_from_rss(source["rss"])
        if url:
            return url

    # 方法 2: UDN API
    if source.get("api"):
        url = get_article_url_from_udn_api(source["api"])
        if url:
            return url

    # 方法 3: Homepage scraping
    if source.get("homepage"):
        url = get_article_url_from_homepage(
            source["homepage"], source["url_pattern"]
        )
        if url:
            return url

    return None


# ------------------------------------------------------------------
# Step 2: 測試 markdown.new
# ------------------------------------------------------------------

def test_markdown_new(article_url: str) -> dict:
    """
    用 markdown.new API 轉換文章 URL。

    Returns:
        {
            "success": bool,
            "status_code": int,
            "response_time_ms": float,
            "content_length": int,
            "tokens": int | None,
            "title": str | None,
            "has_chinese": bool,
            "paragraph_count": int,
            "error": str | None,
            "rate_limit_remaining": int | None,
            "first_200_chars": str,
        }
    """
    start = time.time()
    try:
        resp = requests.post(
            MARKDOWN_NEW_API,
            json={"url": article_url},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        elapsed_ms = (time.time() - start) * 1000

        rate_remaining = resp.headers.get("x-rate-limit-remaining")

        if resp.status_code != 200:
            return {
                "success": False,
                "status_code": resp.status_code,
                "response_time_ms": elapsed_ms,
                "content_length": 0,
                "tokens": None,
                "title": None,
                "has_chinese": False,
                "paragraph_count": 0,
                "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
                "rate_limit_remaining": int(rate_remaining) if rate_remaining else None,
                "first_200_chars": "",
            }

        # 解析回應
        try:
            data = resp.json()
            content = data.get("content", "") or data.get("markdown", "") or ""
            tokens = data.get("tokens")
            title = data.get("title")
        except (json.JSONDecodeError, ValueError):
            # 可能是純文字回應
            content = resp.text
            tokens = None
            title = None

        # 品質指標
        has_chinese = bool(re.search(r"[\u4e00-\u9fff]", content))
        paragraph_count = len([p for p in content.split("\n\n") if p.strip()])

        return {
            "success": True,
            "status_code": 200,
            "response_time_ms": elapsed_ms,
            "content_length": len(content),
            "tokens": tokens,
            "title": title,
            "has_chinese": has_chinese,
            "paragraph_count": paragraph_count,
            "error": None,
            "rate_limit_remaining": int(rate_remaining) if rate_remaining else None,
            "first_200_chars": content[:200],
        }

    except requests.Timeout:
        elapsed_ms = (time.time() - start) * 1000
        return {
            "success": False,
            "status_code": 0,
            "response_time_ms": elapsed_ms,
            "content_length": 0,
            "tokens": None,
            "title": None,
            "has_chinese": False,
            "paragraph_count": 0,
            "error": "TIMEOUT (30s)",
            "rate_limit_remaining": None,
            "first_200_chars": "",
        }
    except Exception as e:
        elapsed_ms = (time.time() - start) * 1000
        return {
            "success": False,
            "status_code": 0,
            "response_time_ms": elapsed_ms,
            "content_length": 0,
            "tokens": None,
            "title": None,
            "has_chinese": False,
            "paragraph_count": 0,
            "error": str(e),
            "rate_limit_remaining": None,
            "first_200_chars": "",
        }


# ------------------------------------------------------------------
# Step 3: 執行完整測試
# ------------------------------------------------------------------

def run_all_tests():
    """對所有 16 個新聞來源執行 markdown.new 測試。"""
    print("=" * 70)
    print(f"PowerReader — markdown.new 相容性測試")
    print(f"測試時間: {datetime.now().isoformat()}")
    print(f"來源數量: {len(SOURCES)}")
    print("=" * 70)

    results = []

    for i, source in enumerate(SOURCES):
        print(f"\n--- [{i+1}/{len(SOURCES)}] {source['name']} ({source['key']}) ---")

        # Step 1: 找文章 URL
        print("  尋找文章 URL...")
        article_url = find_article_url(source)

        if not article_url:
            print(f"  [SKIP] 無法找到文章 URL")
            results.append({
                "source_key": source["key"],
                "source_name": source["name"],
                "article_url": None,
                "test_result": {
                    "success": False,
                    "error": "NO_ARTICLE_URL_FOUND",
                },
            })
            continue

        print(f"  文章 URL: {article_url}")

        # 間隔 3 秒
        if i > 0:
            print("  等待 3 秒...")
            time.sleep(3)

        # Step 2: 測試 markdown.new
        print("  呼叫 markdown.new API...")
        test_result = test_markdown_new(article_url)

        if test_result["success"]:
            print(f"  [OK] {test_result['response_time_ms']:.0f}ms | "
                  f"{test_result['content_length']} chars | "
                  f"{test_result['paragraph_count']} paragraphs | "
                  f"中文={test_result['has_chinese']} | "
                  f"tokens={test_result['tokens']}")
            if test_result["rate_limit_remaining"] is not None:
                print(f"  Rate limit remaining: {test_result['rate_limit_remaining']}")
            # 顯示前 100 字
            preview = test_result["first_200_chars"][:100].replace("\n", " ")
            print(f"  Preview: {preview}...")
        else:
            print(f"  [FAIL] {test_result['error']}")

        results.append({
            "source_key": source["key"],
            "source_name": source["name"],
            "article_url": article_url,
            "test_result": test_result,
        })

    # ------------------------------------------------------------------
    # Step 4: 產出報告
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("測試結果摘要")
    print("=" * 70)

    success_count = 0
    fail_count = 0
    total_time = 0

    for r in results:
        status = "PASS" if r["test_result"].get("success") else "FAIL"
        name = r["source_name"].ljust(12)
        key = r["source_key"].ljust(22)

        if r["test_result"].get("success"):
            success_count += 1
            t = r["test_result"]
            total_time += t["response_time_ms"]
            chars = str(t["content_length"]).rjust(6)
            ms = f"{t['response_time_ms']:.0f}ms".rjust(7)
            cn = "CN" if t["has_chinese"] else "--"
            print(f"  [{status}] {name} {key} | {chars} chars | {ms} | {cn}")
        else:
            fail_count += 1
            err = r["test_result"].get("error", "Unknown")[:50]
            print(f"  [{status}] {name} {key} | {err}")

    print(f"\n通過: {success_count}/{len(results)} | "
          f"失敗: {fail_count}/{len(results)}")
    if success_count > 0:
        print(f"平均回應時間: {total_time / success_count:.0f}ms")

    # 儲存 JSON 報告
    report_path = "tests/markdown_new_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n詳細報告已儲存: {report_path}")

    return results


if __name__ == "__main__":
    run_all_tests()
