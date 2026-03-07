# Crawler Compliance

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **下游文件**: T02_DATA_ACQUISITION/CRAWLER_SPEC.md, T02_DATA_ACQUISITION/NEWS_SOURCES.md, T07_DEPLOYMENT/CI_CD_PIPELINE.md
- **維護者**: T06 (Compliance & Security Team)
- **類型**: SINGLE SOURCE OF TRUTH (SSOT)
- **最後更新**: 2026-03-07

---

## 文件目的

這是 **爬蟲合規規範的唯一定義**。T02 (Data Acquisition Team) 實作的所有爬蟲行為必須遵守本文件。
T06 負責審查 T02 的爬蟲實作是否符合此規範。任何偏離本文件的行為都必須經過 T06 書面核准。

**修改此文件時必須通知**: T02, T07, M01

---

## 0. 中央空廚架構背景 (v1.3 新增)

### 0.1 雙 Repo 架構

本系統的爬蟲在 v1.2 起採用「中央空廚 (Central Kitchen)」架構,Crawler 與 PowerReader 分屬兩個獨立的 GitHub Repository:

| Repository | 開源性 | 授權 | 執行環境 | 說明 |
|-----------|--------|------|---------|------|
| **Crawler** | 閉源 (Private) | - | GitHub Actions (每 2 小時 cron, CPU) | 爬取 + bge-small-zh-v1.5 議題篩選 + 清洗 + API 推送 |
| **PowerReader** | 開源 (Public) | AGPL-3.0 | Cloudflare Workers + Workers AI | 接收資料 + bge-m3 嵌入 + 知識查詢 + 前端服務 |

**合規意涵**:
- Crawler 的爬取行為發生在 **GitHub Actions 環境** (Ubuntu runner),不在 Cloudflare Workers 中
- 本文件的 robots.txt、Rate Limit、User-Agent 規範適用於 Crawler repo 的 GitHub Actions 執行環境
- PowerReader 不主動爬取新聞,僅被動接收 Crawler 推送的處理後資料

### 0.2 Crawler → PowerReader API 推送

Crawler 處理完資料後,透過 API 推送至 PowerReader。此推送必須經過認證:

```javascript
// ✅ 正確: API 推送使用 API Key 認證
const response = await fetch('https://powerreader.example.com/api/v1/articles/ingest', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CRAWLER_API_KEY}`,  // 環境變數,不硬編碼
    'User-Agent': CRAWLER.USER_AGENT
  },
  body: JSON.stringify(articleBatch)
});

// ❌ 錯誤: 無認證直接推送
const response = await fetch(url, { method: 'POST', body: data });
```

**安全要求**:
- `CRAWLER_API_KEY` 必須儲存為 GitHub Actions Secret,不得寫入版控
- PowerReader 端必須驗證 API Key 有效性,拒絕未認證的推送請求
- 推送頻率受 GitHub Actions cron 控制 (每 2 小時),不需額外 Rate Limit

### 0.3 bge-small-zh-v1.5 議題篩選

Crawler 在推送前使用 bge-small-zh-v1.5 (512d, CPU) 進行議題篩選:

- **用途**: 判斷爬取的文章是否屬於社會/政治議題,非相關內容直接丟棄
- **隱私**: 此步驟僅處理公開新聞內容,**不涉及任何使用者個人資料**
- **注意**: bge-small-zh-v1.5 (512d) 與 PowerReader 端的 bge-m3 (1024d) 向量空間不相容,不可混用

---

## 1. 法律基礎

### 1.1 台灣個人資料保護法 (PDPA)

台灣《個人資料保護法》(個資法) 適用於本系統的爬蟲行為:

- **第 19 條**: 非公務機關蒐集個人資料,應有特定目的,並符合法定要件
- **第 20 條**: 非公務機關利用個人資料,不得逾越蒐集之特定目的
- **本系統適用**: 我們僅爬取公開新聞內容 (非個人資料),但文章中可能包含記者姓名、受訪者姓名等個人資料

**合規措施**:
1. 記者署名為公開資訊,可直接儲存 (`author` 欄位, nullable) — 詳見 Section 5.3 (v1.4)
2. 不儲存記者個人聯絡方式 (電話、Email、社群帳號)
3. 不儲存受訪者身分資訊 (受訪者非公開 byline)
4. 僅保留新聞內容用於立場分析

### 1.2 著作權法合理使用

台灣《著作權法》第 52 條 (引用) 及第 65 條 (合理使用四要件):

| 要件 | 本系統評估 |
|------|-----------|
| 利用之目的及性質 | 非營利學術研究/公共利益,具轉化性使用 (立場分析,非原文轉載) |
| 著作之性質 | 已公開發表的新聞報導 (事實性內容,非創作性作品) |
| 所利用之質量及其在整個著作所占之比例 | 僅擷取標題及部分內文進行分析,不重製全文 |
| 利用結果對著作潛在市場與價值之影響 | 分析結果引導讀者回到原站閱讀,不替代原報導 |

**合規措施**:
1. 不儲存完整原文 (處理後刪除原始 HTML)
2. 前端顯示時附帶原文連結,導流回原站
3. 分析結果為衍生著作,具備轉化性
4. 專案採 AGPL-3.0 開源,非營利用途

---

## 2. robots.txt 遵守規範

### 2.1 核心原則

**在爬取任何頁面之前,必須先檢查該來源的 robots.txt。無例外。**

### 2.2 robots.txt 快取策略

```javascript
// robots.txt 快取在 KV,TTL = 24 小時
// Key 格式: robotstxt:{domain_hash}
// 來源: shared/config.js CRAWLER.CACHE_DURATION_HOURS = 24

{
  "domain": "news.ltn.com.tw",
  "fetched_at": "2026-03-06T10:00:00+08:00",
  "rules": {
    "user_agent_mediaBiasBot": {
      "disallow": ["/member/", "/api/"],
      "crawl_delay": 5
    },
    "user_agent_star": {
      "disallow": ["/private/"],
      "crawl_delay": 2
    }
  },
  "raw_text": "User-agent: *\nDisallow: /private/\nCrawl-delay: 2"
}
```

### 2.3 解析與執行規則

| 規則 | 行為 | 說明 |
|------|------|------|
| `Disallow: /path/` | 跳過該路徑下所有頁面 | 不嘗試,不重試 |
| `Crawl-delay: N` | 使用 `max(N * 1000, CRAWLER.RATE_LIMIT_DELAY_MS)` | 取 robots.txt 與 config.js 的較大值 |
| robots.txt 不存在 (HTTP 404) | 允許爬取,使用預設 Rate Limit | 記錄警告日誌 |
| robots.txt 回傳 5xx | 暫停該來源 1 小時 | 視為「不確定是否允許」,保守處理 |
| robots.txt 解析失敗 | 跳過該來源整輪爬取 | 記錄錯誤日誌,下次重新獲取 |

### 2.4 Disallow 執行方式: 跳過整個來源

當某路徑被 Disallow 時,**跳過該來源的該路徑底下所有頁面**。不嘗試繞過、不嘗試替代路徑。

```javascript
// ✅ 正確: 檢查 Disallow 後跳過
async function shouldCrawl(url, robotsRules) {
  const path = new URL(url).pathname;
  for (const disallowed of robotsRules.disallow) {
    if (path.startsWith(disallowed)) {
      console.log(`Skipping ${url}: disallowed by robots.txt`);
      return false;
    }
  }
  return true;
}

// ❌ 錯誤: 忽略 Disallow 規則
async function crawlArticle(url) {
  // 直接爬取,沒有檢查 robots.txt
  const response = await fetch(url);
  return response.text();
}
```

### 2.5 Crawl-delay 單位處理

```javascript
// ⚠️ 某些 robots.txt 用秒,某些用毫秒
// 統一判斷: 若值 > 100 視為毫秒,否則視為秒
function normalizeCrawlDelay(value) {
  const numericValue = parseFloat(value);
  if (isNaN(numericValue) || numericValue <= 0) {
    return CRAWLER.RATE_LIMIT_DELAY_MS; // 預設 2000ms
  }
  // 若 > 100,視為毫秒; 否則視為秒
  const delayMs = numericValue > 100 ? numericValue : numericValue * 1000;
  // 取 robots.txt 與系統預設的較大值
  return Math.max(delayMs, CRAWLER.RATE_LIMIT_DELAY_MS);
}
```

---

## 3. Rate Limiting 規範

### 3.1 最低延遲要求

**每個來源每次請求間隔至少 2000 毫秒** (來源: `shared/config.js` `CRAWLER.RATE_LIMIT_DELAY_MS = 2000`)。

若 robots.txt 的 Crawl-delay 大於 2000ms,則使用 robots.txt 的值。

### 3.2 持久化要求 (CRITICAL)

**Rate Limit 計數器必須持久化在 KV,禁止使用記憶體儲存。**

來自 OceanRAG 教訓: In-memory rate limits reset on restart,導致重啟後短時間內大量請求衝擊目標網站。

```javascript
// ✅ 正確: 持久化到 KV
// Key 格式: ratelimit:{source}:{date} (來源: KV_SCHEMA.md)
async function checkRateLimit(env, source) {
  const today = new Date().toISOString().split('T')[0];
  const key = `ratelimit:${source}:${today}`;
  const record = await env.RATE_LIMITS.get(key, { type: 'json' });

  if (record) {
    const elapsed = Date.now() - new Date(record.last_request_at).getTime();
    if (elapsed < record.delay_ms) {
      const waitTime = record.delay_ms - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // 更新計數器
  const updatedRecord = {
    source,
    date: today,
    request_count: (record?.request_count || 0) + 1,
    last_request_at: new Date().toISOString(),
    delay_ms: Math.max(CRAWLER.RATE_LIMIT_DELAY_MS, getRobotsDelay(source))
  };

  await env.RATE_LIMITS.put(key, JSON.stringify(updatedRecord), {
    expirationTtl: 86400 // 24 小時過期
  });

  return updatedRecord;
}

// ❌ 錯誤: 記憶體儲存 (重啟歸零)
const rateLimitCounter = {};  // 禁止!
```

### 3.3 Circuit Breaker 機制

當某來源連續失敗或觸發限制時,啟動 Circuit Breaker:

| 觸發條件 | 懲罰 | 恢復方式 |
|----------|------|---------|
| 連續 3 次 HTTP 429 (Too Many Requests) | 暫停該來源 1 小時 | 1 小時後自動重試 |
| 連續 5 次 HTTP 5xx | 暫停該來源 1 小時 | 1 小時後自動重試 |
| robots.txt 回傳 5xx | 暫停該來源 1 小時 | 1 小時後重新獲取 robots.txt |
| 單日請求超過 MAX_ARTICLES_PER_RUN (300) | 停止本輪爬取 | 下一輪 CRON 自動恢復 |

```javascript
// Circuit Breaker 狀態儲存在 KV
// Key 格式: circuit:{source_hash}
{
  "source": "自由時報",
  "state": "open",           // "closed" | "open" | "half_open"
  "opened_at": "2026-03-06T10:00:00+08:00",
  "failure_count": 3,
  "last_failure_reason": "HTTP 429",
  "reopen_at": "2026-03-06T11:00:00+08:00"  // 1 小時後
}
```

---

## 4. User-Agent 規範

### 4.1 格式要求

```
MediaBiasBot/1.0 (+https://github.com/your-repo)
```

來源: `shared/config.js` `CRAWLER.USER_AGENT`

**執行環境**: User-Agent 由 Crawler 在 **GitHub Actions** 環境中發送 (非 Cloudflare Workers)。GitHub Actions runner 的出口 IP 為 GitHub 所有,目標網站管理員可透過 User-Agent 中的 GitHub repo URL 聯繫我們。

### 4.2 規則

| 規則 | 說明 |
|------|------|
| 必須使用真實 Bot 名稱 | `MediaBiasBot/1.0` |
| 必須包含聯絡 URL | 括號內附 GitHub repo 連結 |
| 禁止偽裝瀏覽器 | 不得使用 Chrome/Firefox/Safari 的 User-Agent |
| 禁止使用空 User-Agent | 必須每次請求都攜帶 |
| 禁止隨機輪換 User-Agent | 保持一致,方便網站管理員識別 |

```javascript
// ✅ 正確: 使用統一的 Bot User-Agent
const headers = {
  'User-Agent': CRAWLER.USER_AGENT  // "MediaBiasBot/1.0 (+https://github.com/your-repo)"
};

// ❌ 錯誤: 偽裝瀏覽器
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ❌ 錯誤: 空 User-Agent
const headers = {};
```

---

## 5. 資料處理規範

### 5.1 僅爬取公開內容

| 允許 | 禁止 |
|------|------|
| 公開新聞文章頁面 | 付費牆後方內容 |
| 公開的新聞列表頁 | 需登入才能閱讀的內容 |
| RSS Feed (若有提供) | API 端點 (除非有明確授權) |
| 公開的 Open Graph 元資料 | 會員專區內容 |

### 5.2 付費牆偵測

```javascript
// 必須偵測並跳過付費牆內容
function isPaywalled(html) {
  const paywallIndicators = [
    'class="paywall"',
    'class="premium-content"',
    'data-paywall="true"',
    '訂閱才能閱讀',
    '付費會員專屬',
    '登入後繼續閱讀'
  ];
  return paywallIndicators.some(indicator =>
    html.toLowerCase().includes(indicator.toLowerCase())
  );
}

// ✅ 正確: 偵測到付費牆就跳過
if (isPaywalled(html)) {
  console.log(`Skipping paywalled article: ${url}`);
  return null;
}

// ❌ 錯誤: 嘗試繞過付費牆
// 任何繞過行為 (注入 Cookie、偽造 Referer、使用快取版本) 皆違規
```

### 5.3 作者資訊處理 (v1.4 更新)

**決策 (2026-03-07, 專案負責人核准)**: 記者署名為新聞文章中的**公開資訊**，不需要匿名化處理。

**理由**:
1. 記者署名 (byline) 已公開刊登於原始新聞網站，任何人皆可閱讀
2. 本系統連結回原文 (導流要求)，使用者可直接在原站看到記者姓名
3. 對已公開的記者署名做 SHA-256 雜湊不提供實質隱私保護
4. 保留記者姓名有助於使用者辨識報導風格差異

**規則**:
- ✅ 可儲存記者署名 (`author` 欄位，nullable)
- ✅ 記者署名來源為新聞文章的公開署名區域
- ❌ 禁止儲存記者的個人聯絡方式 (電話、Email、社群帳號)
- ❌ 禁止儲存受訪者身分資訊 (受訪者非公開 byline)

```javascript
// ✅ 正確: 儲存公開的記者署名
const article = {
  author: rawAuthor || null,  // "王小明" (nullable)
  // ...
};

// ❌ 錯誤: 儲存記者私人聯絡資訊
const article = {
  author: "王小明",
  author_email: "wang@news.com",  // 禁止!
  author_phone: "0912345678",     // 禁止!
};
```

> **注意**: `SECURITY.ANONYMIZE_CONTRIBUTORS` 設定僅適用於**使用者貢獻者** (分析提交者)，不適用於新聞記者。使用者身分仍須 SHA-256 匿名化。

### 5.4 原始 HTML 處理

```
爬取流程 (中央空廚架構 v1.4):
1. [Crawler/GitHub Actions] 下載 HTML → 暫存記憶體
2. [Crawler/GitHub Actions] 擷取結構化資料 (標題、內文、發布時間、來源、記者署名)
3. [Crawler/GitHub Actions] 清洗 + Markdown 格式化 → 刪除原始 HTML
4. [Crawler/GitHub Actions] 透過 API 推送至 PowerReader
5. [PowerReader/Cloudflare] R2 儲存清洗後的 Markdown 全文 (非原始 HTML)
6. [PowerReader/Cloudflare] D1 儲存結構化索引資料 (標題、來源、發布時間、記者署名等)
```

**重要**: R2 儲存的是經過清洗的 Markdown 全文,**不是原始 HTML**。原始 HTML 在 Crawler 端處理完畢後即刪除。

```javascript
// ✅ 正確: 處理後不保留原始 HTML
async function processArticle(url) {
  const html = await fetch(url).then(r => r.text());  // 暫存記憶體
  const structured = extractArticleData(html);         // 擷取結構化資料
  // author 保留原始署名 (公開資訊，見 Section 5.3)
  await pushToAPI(structured);                         // 推送至 PowerReader
  // html 變數在函式結束後自動被 GC 回收
  // 不儲存原始 HTML 到任何持久化儲存
}

// ❌ 錯誤: 把原始 HTML 存到 R2
await env.R2_BUCKET.put(`raw/${articleHash}.html`, html);  // 禁止!
```

---

## 6. T06 審查清單 (Review Checklist for T02)

T06 在每個階段結束時,必須對 T02 的爬蟲實作執行以下審查:

### 6.1 robots.txt 合規

- [ ] 每次爬取前是否檢查 robots.txt?
- [ ] robots.txt 是否快取在 KV (TTL 24h)?
- [ ] Disallow 路徑是否正確跳過?
- [ ] Crawl-delay 是否被尊重 (取 max 值)?
- [ ] robots.txt 不可用時是否保守處理 (暫停 1h)?

### 6.2 Rate Limiting 合規

- [ ] 每次請求間隔是否 >= 2000ms?
- [ ] Rate Limit 計數器是否持久化在 KV (非記憶體)?
- [ ] Circuit Breaker 是否在連續失敗時啟動?
- [ ] 單輪爬取是否不超過 MAX_ARTICLES_PER_RUN (300)?

### 6.3 User-Agent 合規

- [ ] User-Agent 是否為 `MediaBiasBot/1.0 (+https://github.com/your-repo)`?
- [ ] 是否包含聯絡 URL?
- [ ] 是否沒有偽裝瀏覽器?
- [ ] 是否每次請求都攜帶?

### 6.4 資料處理合規

- [ ] 是否僅爬取公開內容?
- [ ] 是否偵測並跳過付費牆?
- [ ] 作者欄位是否僅包含公開署名 (無私人聯絡資訊)?
- [ ] 原始 HTML 是否在處理後刪除?
- [ ] 結構化 JSON 是否符合 KV_SCHEMA.md?

### 6.5 錯誤處理合規

- [ ] 錯誤訊息是否不洩漏內部細節?
- [ ] 重試邏輯是否有退避策略 (exponential backoff)?
- [ ] 是否有最大重試次數限制 (MAX_RETRIES = 3)?
- [ ] 錯誤是否記錄到結構化日誌?

### 6.6 中央空廚架構合規 (v1.3 新增)

- [ ] Crawler → PowerReader API 推送是否使用 API Key 認證?
- [ ] API Key 是否儲存為 GitHub Actions Secret (非硬編碼)?
- [ ] PowerReader 端是否驗證推送請求的 API Key?
- [ ] bge-small-zh-v1.5 篩選結果是否不含使用者個資?
- [ ] R2 儲存的是清洗後 Markdown (非原始 HTML)?
- [ ] Crawler 端處理完畢後原始 HTML 是否已刪除?

---

## 7. 違規報告流程

### 7.1 違規等級

| 等級 | 定義 | 範例 | 處理時限 |
|------|------|------|---------|
| CRITICAL | 違反法律或可能導致法律訴訟 | 繞過付費牆、爬取個資、偽裝 User-Agent | 立即停止爬蟲,24 小時內修復 |
| HIGH | 違反 robots.txt 或 Rate Limit | 忽略 Disallow、Rate Limit 存記憶體 | 48 小時內修復 |
| MEDIUM | 合規漏洞但未造成實際損害 | 未偵測付費牆、作者未匿名化 | 本階段結束前修復 |
| LOW | 最佳實踐偏離 | 日誌不夠詳細、Circuit Breaker 閾值過高 | 下一階段修復 |

### 7.2 報告流程

```
1. T06 發現違規
2. 建立違規報告 (使用 shared/cross_team_comms/ 機制)
   檔案名: {YYYYMMDD}_{HHMM}_T06_to_T02_violation_{short_desc}.md
3. 標記違規等級 (CRITICAL/HIGH/MEDIUM/LOW)
4. T02 收到後修改狀態為 ACKNOWLEDGED
5. T02 修復後標記 COMPLETED,附上修復說明
6. T06 複查,確認修復有效
7. CRITICAL 等級同時通知 M01 和專案負責人
```

### 7.3 報告範本

```markdown
# 違規報告

**等級**: HIGH
**發現日期**: 2026-03-06
**發現者**: T06
**違規團隊**: T02
**違規項目**: Rate Limit 計數器使用記憶體儲存

**問題描述**:
T02 的爬蟲使用 JavaScript 物件 (in-memory) 儲存 Rate Limit 計數器,
Workers 重啟或重新部署時計數器會歸零,導致短時間內大量請求。

**違反條款**: 本文件 第 3.2 節 - 持久化要求

**影響範圍**: 所有新聞來源

**建議修復方案**:
改為使用 KV 持久化儲存,參考本文件 第 3.2 節 程式碼範例。

**修復期限**: 48 小時
```

---

## 8. 程式碼範例總覽

### 8.1 完整爬取流程 (正確)

```javascript
// ✅ 完整合規爬取流程
import { CRAWLER } from '../shared/config.js';
import { NEWS_SOURCES } from '../shared/enums.js';

async function crawlSource(env, sourceKey) {
  const sourceName = NEWS_SOURCES[sourceKey];
  if (!sourceName) {
    throw new Error(`Unknown source: ${sourceKey}`);
  }

  // Step 1: 檢查 robots.txt
  const robotsRules = await getRobotsRules(env, sourceName);
  if (!robotsRules) {
    console.log(`Skipping ${sourceName}: robots.txt unavailable`);
    return [];
  }

  // Step 2: 檢查 Circuit Breaker
  const circuitState = await getCircuitState(env, sourceName);
  if (circuitState === 'open') {
    console.log(`Skipping ${sourceName}: circuit breaker open`);
    return [];
  }

  // Step 3: 取得文章列表
  const articleUrls = await getArticleUrls(sourceName);

  const results = [];
  for (const url of articleUrls) {
    // Step 4: 檢查 Disallow
    if (!await shouldCrawl(url, robotsRules)) {
      continue;
    }

    // Step 5: 執行 Rate Limit (KV 持久化)
    await checkRateLimit(env, sourceName);

    // Step 6: 爬取
    try {
      const html = await fetch(url, {
        headers: { 'User-Agent': CRAWLER.USER_AGENT },
        signal: AbortSignal.timeout(5000)
      }).then(r => r.text());

      // Step 7: 付費牆偵測
      if (isPaywalled(html)) {
        console.log(`Skipping paywalled: ${url}`);
        continue;
      }

      // Step 8: 擷取 + 儲存 (記者署名為公開資訊,直接保留)
      const article = extractArticleData(html);
      // article.author 保留原始署名 (nullable, 詳見 Section 5.3 v1.4)
      // ❌ 禁止儲存記者私人聯絡資訊 (電話/Email/社群)
      // html 不持久化儲存

      results.push(article);
    } catch (err) {
      console.error(`Crawl failed for ${url}: ${err.message}`);
      await recordFailure(env, sourceName);
    }
  }

  return results;
}
```

### 8.2 常見錯誤範例

```javascript
// ❌ 錯誤 1: 沒有檢查 robots.txt
async function badCrawl(url) {
  return await fetch(url).then(r => r.text());
}

// ❌ 錯誤 2: 偽裝瀏覽器 User-Agent
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
};

// ❌ 錯誤 3: Rate Limit 存記憶體
let lastRequestTime = {};  // 重啟歸零!

// ❌ 錯誤 4: 儲存原始 HTML
await env.R2.put(`raw/${hash}.html`, rawHtml);

// ❌ 錯誤 5: 儲存作者真名
const article = { author: "王小明" };

// ❌ 錯誤 6: 忽略付費牆
// 沒有偵測付費牆,直接擷取所有內容

// ❌ 錯誤 7: 繞過 Disallow
// 發現 /api/ 被 Disallow,改用 /api/v2/ 嘗試繞過
```

---

## 9. Common Mistakes

### Mistake 1: Crawl-delay 單位不一致

- **問題**: 某些 robots.txt 用秒 (`Crawl-delay: 2`),某些用毫秒 (`Crawl-delay: 2000`)
- **解法**: 統一判斷 --- 若值 > 100 視為毫秒,否則視為秒。再與 `CRAWLER.RATE_LIMIT_DELAY_MS` 取較大值
- **影響**: T02 實作、T06 審查

### Mistake 2: robots.txt 快取忘記設 TTL

- **問題**: robots.txt 快取在 KV 但沒設過期時間,網站更新 robots.txt 後系統仍使用舊規則
- **解法**: TTL 設定 24 小時 (`CRAWLER.CACHE_DURATION_HOURS * 3600`)
- **影響**: 可能違反更新後的 Disallow 規則

### Mistake 3: Circuit Breaker 狀態沒有持久化

- **問題**: Circuit Breaker 狀態存記憶體,Workers 重啟後 Circuit 重新關閉,繼續對故障來源發請求
- **解法**: Circuit Breaker 狀態也必須持久化到 KV
- **影響**: 對故障來源造成額外壓力

### Mistake 4: ~~匿名化 Salt 硬編碼~~ (v1.4 已移除)

- **已移除原因**: v1.4 決策 — 記者署名為公開資訊，不再需要匿名化處理。此 Mistake 不再適用。
- **仍適用場景**: 使用者身分匿名化 (user_hash) 的 Salt 仍必須使用環境變數，不得硬編碼。

### Mistake 5: 忽略 User-agent 特定規則

- **問題**: robots.txt 中可能有針對 `MediaBiasBot` 的特定規則,但解析器只讀 `User-agent: *`
- **解法**: 先查找 `User-agent: MediaBiasBot`,若無則 fallback 到 `User-agent: *`
- **影響**: 可能遺漏針對本爬蟲的限制

### Mistake 6: 重試不加延遲

- **問題**: `MAX_RETRIES = 3` 但每次重試之間沒有延遲,3 次請求在 1 秒內全部送出
- **解法**: 使用指數退避 (exponential backoff),`RETRY_DELAY_MS * 2^attempt` (5s, 10s, 20s)
- **影響**: 加重目標伺服器壓力,可能觸發更嚴格的封鎖

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 | 影響團隊 |
|------|------|---------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 | - |
| v1.0 | 2026-03-06 | 完整內容: 法律基礎、robots.txt、Rate Limit、User-Agent、資料處理、審查清單、違規流程、程式碼範例、Common Mistakes | T02 爬蟲實作前完成合規規範 | T02, T07, M01 |
| v1.3 | 2026-03-07 | 對齊 v1.3 架構: 新增中央空廚架構背景 (Section 0)、雙 repo 架構、API 認證要求、bge-small-zh 篩選隱私說明、GitHub Actions 執行環境、R2/D1 儲存更新、審查清單 6.6 | 架構升級 v1.2-v1.3 | T02, T07, M01 |
| v1.4 | 2026-03-07 | 作者資訊處理變更 (Option B 核准): Section 5.3 改為保留記者署名明文 (公開資訊不需匿名化)、Section 1.1 合規措施更新、Section 5.4 流程更新、審查清單 6.4 更新、程式碼範例更新、Common Mistake #4 移除 | 專案負責人核准: 記者署名為公開資訊,SHA-256 雜湊不提供實質隱私保護 | T01, T02, M01 |

---

**重要提醒**:
修改此文件前,必須:
1. 提 GitHub PR 討論
2. 通知所有下游團隊 (T02, T07)
3. 更新 MASTER_ROADMAP.md 決策紀錄
4. M01 審查跨團隊影響

---

**文件維護者**: T06 (Compliance & Security Team)
**最後更新**: 2026-03-07 (v1.4)
**下次審查**: 階段 2 結束時 (T02 爬蟲實作完成後)
