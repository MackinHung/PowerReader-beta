# 📘 CLAUDE.md - PowerReader (Taiwan News Bias Analysis System)

## 🎯 文件目的
這是 **Agent Teams 的冷啟動文件**,任何 Claude Agent 加入團隊時的第一份必讀文件。
包含: 專案概覽、團隊規範、共通問題、隊長工作習慣、跨團隊協作規則。

---

## 📋 目錄
1. [專案概覽](#專案概覽)
2. [Agent Teams 組織架構](#agent-teams-組織架構)
3. [隊長工作習慣 (CRITICAL!)](#隊長工作習慣-critical)
4. [團隊協作規範](#團隊協作規範)
5. [共通問題與錯誤](#共通問題與錯誤)
6. [階段檢查清單](#階段檢查清單)
7. [文件導航系統](#文件導航系統)
8. [快速參考](#快速參考)

---

## 📊 專案概覽

### 核心價值主張
- 🎯 **去中心化**: 使用分散式 GPU 算力(用戶端運行 Qwen3.5-4B)
- 🎯 **中央空廚**: 統一爬取與處理新聞數據,透過 API 提供 RAG 知識注入
- 🎯 **知識透明化**: 使用者可查看 AI 分析時注入的所有背景知識
- 🎯 **即時分析**: 透過 Cloudflare KV 同步,建立 PowerReader 網絡
- 🎯 **多元立場**: 跨媒體比對,揭示不同媒體的報導角度
- 🎯 **自我進化**: 票選制獎金系統,品質越高貢獻點數越多
- 🎯 **完全開源**: AGPL-3.0 授權,包含 Prompt 也開源

### 技術棧核心
```
前端: Cloudflare Pages (PWA) + IndexedDB
後端: Cloudflare Workers + D1 + R2 + KV + Vectorize + Workers AI
爬蟲後端: 獨立閉源 GitHub 項目 (中央空廚架構)
  - 定期爬取 → bge-small-zh 議題篩選 → 清洗 → markdown.news 處理
  - GitHub Actions (每 2 小時, CPU)
  - 透過 API 推送處理好的資料給 PowerReader
推理: Qwen3.5-4B (用戶端本地運行, think=false, t=0.5)
嵌入: Cloudflare Workers AI @cf/baai/bge-m3 (1024d, 邊緣 GPU)
篩選: bge-small-zh-v1.5 (512d, CPU, 爬蟲端議題過濾)
向量搜索: Cloudflare Vectorize (知識庫)
知識庫: 政治人物/媒體/議題/台灣特定名詞/近期事件
介面: LINE Bot + 瀏覽器插件 + Email 訂閱
```

### RAG 三層 Prompt 架構
```
Layer 1 (核心/靜態, ~300 tokens, 本地快取):
  - 偏綠/偏藍特徵定義 (批評型+宣傳型)
  - 分數錨點
  - 輸出格式 (JSON schema)

Layer 2 (RAG/動態, ~200-800 tokens, 即時 API 查詢):
  - 政治人物 → 黨派+立場標籤
  - 媒體 → 傾向分數
  - 議題 → 藍綠立場對照+爭議程度
  - 台灣特定名詞 → 定義+政治脈絡
  - 近期事件 → 背景脈絡
  ⚠️ 透明化: 使用者可展開查看注入的知識條目

Layer 3 (輸入):
  - 新聞原文
  - JSON 輸出指令
```

### 中央空廚架構 (Central Kitchen)

#### 完整流程
```
┌─────────────────────────────────────────────┐
│  Crawler 空廚 (閉源 GitHub Actions, 每 2h)   │
│                                              │
│  ① 爬取原始新聞來源                           │
│           ↓                                  │
│  ② bge-small-zh 議題篩選                     │
│     標題+摘要 vs 主題向量 (cosine > 閾值)      │
│     ├─ 是社會/政治議題 → 繼續                 │
│     └─ 否 → 丟棄                             │
│           ↓                                  │
│  ③ 內容清洗 + 格式處理                        │
│           ↓                                  │
│  ④ 交給 markdown.news 處理資料                │
│           ↓                                  │
│  ⑤ API 推送到 PowerReader                     │
└──────────────┬──────────────────────────────┘
               ↓
┌──────────────────────────────────────────────┐
│  PowerReader (開源, Cloudflare 全棧)           │
│                                               │
│  ⑥ Workers 接收 + 驗證 (API key)              │
│           ↓                                   │
│  ⑦ Workers AI bge-m3 嵌入標題                 │
│           ↓                                   │
│  ⑧ Vectorize 查詢知識庫 (topK=5)              │
│           ↓                                   │
│  ⑨ R2 存全文 + D1 存結構化資料                 │
│           ↓                                   │
│  ⑩ 客戶端取得文章+知識 → 組裝 3 層 Prompt      │
│           ↓                                   │
│  ⑪ 本地 Qwen3.5-4B 推理                       │
│           ↓                                   │
│  ⑫ 結果顯示 + 知識透明化面板                   │
└───────────────────────────────────────────────┘
```

#### Crawler API 輸出格式
```json
{
  "article_id": "sha256_of_primary_url",
  "content_hash": "sha256_of_content_markdown",
  "title": "新聞標題",
  "summary": "摘要",
  "author": "記者名 (nullable)",
  "content_markdown": "清洗後的 Markdown 全文",
  "char_count": 1847,
  "source": "liberty_times",
  "primary_url": "https://主要來源",
  "duplicate_urls": ["https://轉載1"],
  "published_at": "2026-03-07T14:00:00+08:00",
  "crawled_at": "2026-03-07T14:35:00+08:00",
  "filter_score": 0.73,
  "matched_topic": "政治新聞",
  "dedup_metadata": {
    "total_found": 5,
    "unique_content": 1,
    "similarity_scores": [0.95, 0.91]
  }
}
```

#### 雙 Repo 架構
```
📦 Crawler (私有閉源)
  └─ GitHub Actions (每 2h cron)
      ├─ 爬取 + bge-small-zh 篩選 + 清洗
      └─ 推送到 PowerReader API

📦 PowerReader (公開開源)
  ├─ Cloudflare Workers (API + 嵌入 + 知識查詢)
  ├─ Cloudflare Workers AI (bge-m3 嵌入)
  ├─ Cloudflare Vectorize (知識庫向量搜索)
  ├─ Cloudflare R2 (文章全文儲存)
  ├─ Cloudflare D1 (結構化資料)
  ├─ Cloudflare KV (設定快取)
  └─ Cloudflare Pages (PWA 前端)
```

#### Cloudflare 服務分工
| 服務 | 用途 | 免費額度 |
|------|------|---------|
| Workers | API 端點 + 業務邏輯 | 100K 請求/天 |
| Workers AI | bge-m3 嵌入 (GPU) | 10K neurons/天 |
| Vectorize | 知識庫向量搜索 | 30M 查詢維度/月 |
| R2 | 文章全文 + 靜態資源 | 10GB + 出流量免費 |
| D1 | 使用者/分析/獎勵/文章索引 | 5GB + 5M 讀/天 |
| KV | 系統設定 + 快取 | 1GB + 100K 讀/天 |
| Pages | PWA 前端 | 無限 |

### 關鍵數據指標
- **目標用戶**: 台灣新聞讀者 (LINE 台灣用戶 2200 萬, LINE TODAY 覆蓋 1800 萬)
- **預算限制**: 新手開發者專案,系統必須低成本 (Cloudflare 免費方案 $5/月, KV 寫入有限制)
- **品質目標**: 分析通過率 60-70%, 準確率需數據驗證
- **合規要求**: 爬蟲必須遵守 robots.txt, Rate limiting ≥ 2 秒/請求

---

## 🤖 Agent Teams 組織架構

### 團隊總覽
```
M01 - 需求師 & 專案邏輯檢測師 (監督層,不寫代碼)
├─ T01 - 系統架構團隊 (Cloudflare 全棧)
├─ T02 - 數據獲取團隊 (爬蟲 + 議題篩選)
├─ T03 - AI 推理團隊 (Qwen3.5-4B + Prompt 工程)
├─ T04 - 前端體驗團隊 (PWA + LINE Bot + 插件)
├─ T05 - 獎金系統團隊 (票選 + Fisher-Yates)
├─ T06 - 合規與安全團隊 (爬蟲合規 + 隱私保護)
└─ T07 - 部署監控團隊 (CI/CD + 儀表板)
```

### 團隊職責邊界
| 團隊 | 核心職責 | 禁止事項 |
|------|---------|---------|
| M01 | 需求對齊、邏輯檢測、滾動式紀錄維護 | ❌ 不寫代碼 ❌ 不直接解決技術問題 |
| T01 | Cloudflare 架構、KV Schema、API 設計 | ❌ 不實作爬蟲邏輯 ❌ 不設計 UI |
| T02 | 爬蟲、bge-small-zh 議題篩選、去重、markdown.news 整合 | ❌ 不做立場分析 ❌ 不處理前端邏輯 |
| T03 | Qwen 推理、Prompt 工程、品質驗證、知識庫維護 | ❌ 不爬取新聞 ❌ 不設計 KV Schema |
| T04 | PWA、LINE Bot、UI/UX | ❌ 不做 AI 推理 ❌ 不設計後端 API |
| T05 | 點數計算、票選洗牌、獎金分配 | ❌ 不驗證分析品質 ❌ 不設計爬蟲 |
| T06 | 爬蟲合規、隱私政策、錯誤處理 | ❌ 不實作功能 (僅審查合規性) |
| T07 | CI/CD、監控、效能測試 | ❌ 不設計業務邏輯 ❌ 不修改核心代碼 |

---

## 🎖️ 隊長工作習慣 (CRITICAL!)

### 👤 M01 隊長特別規範

#### 1️⃣ 語言使用規則 (MUST FOLLOW!)
```
隊長 ↔ 您 (專案負責人): 繁體中文
隊長 ↔ 隊員: English
隊員 ↔ 隊員: English
```

**範例**:
```markdown
# 隊長向您報告 (繁體中文)
"我發現 T02 和 T03 在文章資料格式上有矛盾,建議統一使用 Crawler API 輸出規格。"

# 隊長向 T02 隊員溝通 (English)
"@T02-Agent: Please align the article data format with T03.
Use the Crawler API output schema defined in CLAUDE.md."
```

#### 2️⃣ 隊長絕對禁止事項
❌ **禁止寫代碼** - 即使是範例代碼也只能引用,不能產生
❌ **禁止直接解決技術問題** - 應分派給相關團隊
❌ **禁止跳過 QA 階段** - 每個階段結束必須 QA
❌ **禁止單方面決策** - 重大變更必須向您確認

#### 3️⃣ 隊長必須執行事項
✅ **必須溝通協調** - 跨團隊問題由隊長協調
✅ **必須維護文檔** - 更新 MASTER_ROADMAP.md
✅ **必須階段 QA** - 每個階段結束後執行檢查清單
✅ **必須跨團隊對齊** - 定期詢問各團隊進度並對齊

---

## 🤝 團隊協作規範

### 階段檢查清單 (每個階段結束時 M01 必須執行)

#### ✅ 階段結束檢查項目
```markdown
## 階段 QA 檢查清單

### 1. 資料結構對齊
- [ ] 檢查相關團隊的資料結構是否一致 (JSON schema, API contract)
- [ ] 確認沒有欄位名稱衝突 (例如 `tokens` vs `words`)
- [ ] 確認資料型別一致 (例如 timestamp 格式統一)

### 2. 習慣與規範回顧
- [ ] 確認所有團隊遵守 SSOT (單一真理來源) 原則
- [ ] 確認沒有硬編碼字串 (必須使用 Enum 或 Config)
- [ ] 確認文檔已同步更新

### 3. 跨團隊對齊詢問
- [ ] 向上游團隊確認: "你們提供的資料格式是否符合我們的需求?"
- [ ] 向下游團隊確認: "我們提供的資料格式是否符合你們的需求?"
- [ ] 記錄所有未解決的對齊問題到 MASTER_ROADMAP.md

### 4. 邏輯矛盾檢測
- [ ] 檢查是否有兩個團隊定義了相同的邏輯
- [ ] 檢查是否有狀態機矛盾 (例如文章狀態跳躍)
- [ ] 檢查是否有安全漏洞 (參考 OceanRAG 十大錯誤)

### 5. 文檔完整性
- [ ] 確認所有交付物都有「上游文件」和「下游文件」標註
- [ ] 確認 MASTER_ROADMAP.md 已更新
- [ ] 確認變更紀錄已記錄
```

### 跨團隊溝通模板

#### 範例 1: T01 向 T02 詢問對齊
```markdown
**From**: T01 (System Architecture Team)
**To**: T02 (Data Acquisition Team)
**Subject**: Alignment Check - Crawler API Output Schema

Hi T02,

We've defined the D1 schema for storing news articles (see `KV_SCHEMA.md`).
Please confirm if the Crawler API output format aligns with our schema:

Expected schema:
{
  "article_id": "sha256_of_primary_url",
  "content_hash": "sha256_of_content_markdown",
  "title": "新聞標題",
  "source": "liberty_times"
}

**Action Required**: Please confirm your output matches the Crawler API schema in CLAUDE.md.

Best,
T01 Agent
```

#### 範例 2: M01 向您報告矛盾
```markdown
**邏輯矛盾報告 #003**
**日期**: 2026-03-07
**狀態**: 待確認

**問題描述**:
T02 的 Crawler API 輸出格式與 T01 的 D1 Schema 有欄位不一致。

**影響範圍**:
- T02 → PowerReader 的資料傳遞可能失敗
- T01 的 D1 Schema 需要調整或 T02 需要修改輸出

**建議方案**:
1. 統一使用 CLAUDE.md 中定義的 Crawler API 輸出格式
2. 更新 T01 的 D1 Schema 以匹配
3. 在 `KV_SCHEMA.md` 明確註記欄位定義

**需要您的決策**:
請確認是否採用方案 1?
```

---

## ⚠️ 共通問題與錯誤 (所有團隊必讀!)

### 🔴 從 OceanRAG 學到的十大致命錯誤

#### 1. 模型不一致災難
```javascript
// ❌ 災難案例
// Crawler 使用: bge-small-zh-v1.5 (512d)
// PowerReader 使用: bge-m3 (1024d)  // 不同維度!
// 混用這兩個模型的向量做 cosine similarity → 結果無意義

// ✅ 正確做法
// 在 shared/config.js 統一定義
export const MODELS = {
  QWEN: "qwen3.5:4b",
  EMBEDDING: "@cf/baai/bge-m3",
  FILTER: "bge-small-zh-v1.5"
};
// 篩選和嵌入分別使用各自的模型,不可混用!
```

**教訓**: 模型不一致會導致向量空間不相容,但系統不會報錯,極難察覺!

---

#### 2. 洩漏內部錯誤給客戶端
```javascript
// ❌ 錯誤: LINE Bot 暴露 traceback
yield `data: ${JSON.dumps({error: err.stack})}\n\n`;

// ✅ 正確: 通用訊息 + 伺服器日誌
yield `data: ${JSON.dumps({error: '系統錯誤,請稍後再試'})}\n\n`;
console.error(`Full error: ${err.stack}`);
```

**教訓**: 不洩漏內部資訊給用戶 (安全性 + 用戶體驗)

---

#### 3. Rate Limit 只存記憶體
```javascript
// ❌ 錯誤: in-memory dict (重啟歸零)
const rateLimitCounter = {};

// ✅ 正確: 持久化到 KV
await env.KV.put(`ratelimit:${source}:${date}`, count, {
  expirationTtl: 86400  // 24 小時過期
});
```

**教訓**: 爬蟲 Rate Limit 必須持久化,否則攻擊者只需等待重啟即可重設

---

#### 4. Enum 欄位無 DB 約束
```javascript
// ❌ 錯誤: 只在應用層驗證
if (!['自由時報', '聯合報'].includes(source)) throw Error();

// ✅ 正確: 單一真理來源 + 所有層級驗證
// shared/enums.js
export const NEWS_SOURCES = {
  LIBERTY_TIMES: "自由時報",
  UNITED_DAILY: "聯合報",
  CHINA_TIMES: "中國時報"
  // ... 其他媒體
};

// KV Schema 也要驗證
if (!Object.values(NEWS_SOURCES).includes(article.source)) {
  throw new Error("Invalid news source");
}
```

**教訓**: Enum 必須集中管理,所有層級都驗證

---

#### 5. 忘記轉義使用者輸入 (XSS)
```javascript
// ❌ 錯誤: 直接插入使用者內容
element.innerHTML = userComment;

// ✅ 正確: 統一轉義函式
import { escapeHtml } from './utils/sanitize.js';
element.innerHTML = escapeHtml(userComment);
```

**教訓**: 所有使用者輸入都必須轉義 (LINE Bot 訊息、評論、文章標題等)

---

#### 6. 測試檔案與生產碼混放
```
❌ 錯誤結構:
src/
  ├─ crawler.js
  └─ test_crawler.js  // 混放!

✅ 正確結構:
src/crawler.js
tests/test_crawler.js  // 分離!
```

**教訓**: 測試檔案必須分離,避免安全風險

---

#### 7. httpx/fetch Timeout 未分層設定
```javascript
// ❌ 錯誤: 單一 timeout (connect 超時過長)
fetch(url, { timeout: 60000 });

// ✅ 正確: 分層設定 (僅範例,實際用 Cloudflare Workers fetch)
fetch(url, {
  signal: AbortSignal.timeout(5000)  // connect timeout
  // read timeout 由 Workers 自動處理
});
```

---

#### 8. 動態欄位無白名單 (SQL Injection 風險)
```javascript
// ❌ 極度危險: 直接使用使用者輸入
const sortBy = request.query.sort_by;
const query = `SELECT * FROM articles ORDER BY ${sortBy}`;

// ✅ 正確: 白名單驗證
const ALLOWED_SORT_FIELDS = ['published_at', 'bias_score', 'controversy'];
if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
  throw new Error("Invalid sort field");
}
```

---

#### 9. Session 只驗證 JWT (IDOR 漏洞)
```javascript
// ❌ 錯誤: 只驗證 JWT
const userId = jwt.decode(token).sub;

// ✅ 正確: 交叉驗證 Session
const session = await getSession(sessionId);
if (session.user_id !== jwt.decode(token).sub) {
  throw new Error("Session mismatch");
}
```

---

#### 10. 未過濾垃圾 Chunk
```javascript
// ❌ 錯誤: 所有段落都索引
const chunks = text.split('\n\n');

// ✅ 正確: MIN_CHUNK_CHARS 過濾
const MIN_CHUNK_CHARS = 5;
const chunks = text.split('\n\n').filter(c => c.trim().length >= MIN_CHUNK_CHARS);
```

**教訓**: 過濾垃圾內容 (單一標點符號、空白行等)

---

### 🟡 本專案特有的共通問題

#### 問題 1: 嵌入模型一致性
```javascript
// ⚠️ 注意: PowerReader 使用兩個不同的嵌入模型
// 篩選用: bge-small-zh-v1.5 (512d, Crawler 端 CPU)
// 知識查詢用: bge-m3 (1024d, Cloudflare Workers AI GPU)
// 這兩個模型的向量空間不相容,不可混用!
```

#### 問題 2: Cloudflare KV 寫入限制
```javascript
// ⚠️ 注意: Cloudflare 免費方案 KV 寫入有限制
// 每日最多 1000 次寫入 (付費方案提升)
// 設計時必須考慮快取策略,避免頻繁寫入
```

#### 問題 3: LINE Bot 訊息長度限制
```javascript
// ⚠️ 注意: LINE Flex Message 有大小限制
// 必須只回傳摘要(前 200 字) + 完整連結
// 不能直接傳送整篇文章內容
```

#### 問題 4: 本地模型推理效能
```javascript
// ⚠️ 注意: Qwen3.5-4B (3.4GB) 在低階設備上可能較慢
// 推理時間約 6-10 秒/篇 (think=false, t=0.5)
// 必須提供「下載進度」(3.4GB) 和「分析進度」提示
// 電量 < 20% 且非充電時不下載模型
// 無 GPU 裝置顯示「不支援本地分析」提示
// 推理超時設定 30 秒
```

---

## ✅ 階段檢查清單

### 階段 1: 架構設計階段
- [ ] T01 完成 KV Schema 設計 (單一真理來源)
- [ ] T01 完成 API Routes 定義
- [ ] M01 檢查: KV Schema 是否所有團隊都理解?
- [ ] M01 檢查: API Routes 是否有重複定義?
- [ ] **QA**: 召開跨團隊對齊會議,確認所有介面

### 階段 2: 爬蟲與數據處理階段
- [ ] T02 完成爬蟲合規檢查清單
- [ ] T02 完成 bge-small-zh 議題篩選整合
- [ ] T06 審查: 爬蟲是否符合 robots.txt?
- [ ] T06 審查: Rate Limit 是否持久化?
- [ ] M01 檢查: T02 輸出格式是否符合 T01 的 KV Schema?
- [ ] **QA**: 測試 10 個台灣新聞網站,確認爬蟲成功率

### 階段 3: AI 推理與品質驗證階段
- [ ] T03 完成 Prompt v1.0 設計
- [ ] T03 完成 4 層品質驗證邏輯
- [ ] M01 檢查: Prompt 是否符合台灣華語習慣?
- [ ] M01 檢查: 品質驗證是否會漏掉垃圾評分?
- [ ] T06 審查: 錯誤訊息是否洩漏內部資訊?
- [ ] **QA**: 使用 20 篇金標準文章測試準確率

### 階段 4: 前端與用戶體驗階段
- [ ] T04 完成 PWA 基礎架構
- [ ] T04 完成 LINE Bot 整合
- [ ] M01 檢查: IndexedDB 快取策略是否合理?
- [ ] M01 檢查: LINE Bot 訊息是否符合長度限制?
- [ ] T06 審查: 是否有 XSS 漏洞?
- [ ] **QA**: 測試 5 個不同設備 (高階/低階/手機/桌面)

### 階段 5: 獎金系統與部署階段
- [ ] T05 完成 Fisher-Yates 洗牌邏輯
- [ ] T07 完成 CI/CD Pipeline
- [ ] M01 檢查: 票選演算法是否可驗證?
- [ ] M01 檢查: 部署流程是否會中斷服務?
- [ ] **QA**: 模擬 100 個用戶同時投票,確認系統穩定性

---

## 📬 跨團隊溝通機制 (Cross-Team Communication Hub)

### 設計背景
各團隊可能在**不同終端 (Terminal Session)** 執行,無法即時對話。
此機制透過 `shared/cross_team_comms/` 資料夾,建立**檔案型非同步訊息佇列**,
讓團隊間能放置/掃描文件來完成跨團隊協作。

### 資料夾位置
```
shared/cross_team_comms/
├─ README.md        # 完整使用說明
├─ TEMPLATE.md      # 請求檔案範本
├─ archive/         # 已完成的請求歸檔
└─ *.md             # 進行中的跨團隊請求
```

### 檔案命名規範
```
{YYYYMMDD}_{HHMM}_{FROM}_to_{TO}_{short_desc}.md
```
**範例**:
```
20260306_1430_T01_to_T02_kv_field_alignment.md
20260306_1600_M01_to_ALL_stage1_qa_meeting.md
20260307_0900_T02_to_T01_T03_new_field_request.md
```

### 狀態生命週期
```
🟡 PENDING → 🔵 ACKNOWLEDGED → ✅ COMPLETED → 📦 ARCHIVED
                                  ↘ ❌ REJECTED (需說明原因)
```

### 團隊 SOP (每次啟動 Session 必做!)
1. **掃描** — Glob `*_to_{MY_TEAM}_*.md` 和 `*_to_ALL_*.md`
2. **檢查** — 打開 PENDING 狀態的檔案
3. **處理** — 修改狀態為 ACKNOWLEDGED → 執行 → 填寫回應區 → 改為 COMPLETED
4. **建立** — 如需要其他團隊協助,建立新的請求檔案

### ⚡ 定期掃描規則 (CRITICAL!)

每個團隊 Agent 必須在以下時機掃描 `shared/cross_team_comms/`:

| 時機 | 動作 |
|------|------|
| **Session 啟動時** | 冷啟動第一步,讀 CLAUDE.md 後立即掃描 |
| **每完成一項任務後** | 做完 PHASE_PLAN.md 中的一個 deliverable 就掃一次 |
| **被阻塞時** | 等待其他團隊回應時,先做不被阻塞的任務,同時定期掃描 |
| **Session 結束前** | 確認自己發出的請求已標記完成,未完成的保持 PENDING |

**掃描步驟**:
```bash
# 1. 檢查發給自己的請求
ls shared/cross_team_comms/*_to_{MY_TEAM}_*.md
ls shared/cross_team_comms/*_to_ALL_*.md

# 2. 只處理狀態為 PENDING 的
# 3. 處理完更新狀態為 COMPLETED
# 4. 繼續自己的任務
```

### 使用規則
- ✅ 每次啟動新 Session 必須掃描
- ✅ 每完成一項任務後必須掃描
- ✅ 建立請求時填寫完整欄位 (參考 TEMPLATE.md)
- ✅ 處理完畢必須更新狀態
- ❌ 禁止刪除他人的請求檔案
- ❌ 禁止修改請求內容區 (只能改回應區和狀態)
- ❌ 禁止繞過此機制直接修改其他團隊的文件

**詳細說明請閱讀**: `shared/cross_team_comms/README.md`

---

## 🗺️ 文件導航系統

### 主節點文件
```
CLAUDE.md (本文件)
  ↓
MASTER_ROADMAP.md (M01 維護,所有決策和進度的總覽)
  ↓
├─ shared/
│   ├─ config.js (集中配置)
│   ├─ enums.js (單一真理來源 Enum 定義)
│   └─ cross_team_comms/ (跨團隊溝通資料夾) ← 🆕
├─ M01_PROJECT_LEAD/
│   ├─ LOGIC_CONTRADICTION_REPORTS.md (滾動式紀錄)
│   └─ TEAM_ALIGNMENT_CHECKLIST.md
├─ T01_SYSTEM_ARCHITECTURE/
│   ├─ KV_SCHEMA.md (SSOT)
│   ├─ API_ROUTES.md (SSOT)
│   └─ CLOUDFLARE_ARCHITECTURE.md
├─ T02_DATA_ACQUISITION/
│   ├─ CRAWLER_SPEC.md
│   ├─ NEWS_SOURCES.md (SSOT)
│   └─ DEDUPLICATION_LOGIC.md
├─ T03_AI_INFERENCE/
│   ├─ PROMPT_VERSIONS.md (滾動式紀錄)
│   ├─ QUALITY_GATES.md
│   └─ MODEL_ACCURACY_REPORT.md
├─ T04_FRONTEND/
│   ├─ PWA_SPEC.md
│   ├─ LINE_BOT_DESIGN.md
│   └─ UI_LOCALIZATION.md
├─ T05_REWARD_SYSTEM/
│   ├─ REWARD_MECHANISM.md
│   ├─ FISHER_YATES_SPEC.md
│   └─ VOTE_AUDIT_LOG.md (滾動式紀錄)
├─ T06_COMPLIANCE/
│   ├─ CRAWLER_COMPLIANCE.md (SSOT)
│   ├─ PRIVACY_POLICY.md
│   └─ ERROR_HANDLING.md (SSOT)
└─ T07_DEPLOYMENT/
    ├─ CI_CD_PIPELINE.md
    ├─ MONITORING_DASHBOARD.md
    └─ PERFORMANCE_BENCHMARKS.md
```

### 單一真理來源 (SSOT) 清單
| 主題 | 檔案 | 維護者 |
|------|------|--------|
| KV Schema | T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md | T01 |
| API Routes | T01_SYSTEM_ARCHITECTURE/API_ROUTES.md | T01 |
| 新聞來源清單 | T02_DATA_ACQUISITION/NEWS_SOURCES.md | T02 |
| 爬蟲合規規則 | T06_COMPLIANCE/CRAWLER_COMPLIANCE.md | T06 |
| 錯誤處理規範 | T06_COMPLIANCE/ERROR_HANDLING.md | T06 |
| Prompt 版本 | T03_AI_INFERENCE/PROMPT_VERSIONS.md | T03 |

### 滾動式紀錄清單
| 主題 | 檔案 | 維護者 |
|------|------|--------|
| 主要決策紀錄 | MASTER_ROADMAP.md | M01 |
| 邏輯矛盾報告 | M01_PROJECT_LEAD/LOGIC_CONTRADICTION_REPORTS.md | M01 |
| Prompt 演進歷史 | T03_AI_INFERENCE/PROMPT_VERSIONS.md | T03 |
| 票選審計日誌 | T05_REWARD_SYSTEM/VOTE_AUDIT_LOG.md | T05 |

---

## 🚀 快速參考

### 新 Agent 冷啟動流程
1. **閱讀本文件** (CLAUDE.md) - 10 分鐘
2. **閱讀您所屬團隊的文件夾** - 20 分鐘
3. **檢查 MASTER_ROADMAP.md 的最新進度** - 5 分鐘
4. **🔍 掃描跨團隊溝通資料夾** - `shared/cross_team_comms/` 中有無待處理的請求
5. **向 M01 報到,確認當前任務** - 溝通
6. **開始工作前,先檢查「階段檢查清單」** - 避免重複工作

### 常用指令速查
```bash
# (範例,實際不執行)
# 🔍 掃描跨團隊請求 (替換 {MY_TEAM} 為你的團隊代號)
ls shared/cross_team_comms/*_to_{MY_TEAM}_*.md
ls shared/cross_team_comms/*_to_ALL_*.md

# 檢查 KV Schema 定義
cat T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md

# 檢查新聞來源清單
cat T02_DATA_ACQUISITION/NEWS_SOURCES.md

# 檢查當前 Prompt 版本
cat T03_AI_INFERENCE/PROMPT_VERSIONS.md

# 檢查主要進度
cat MASTER_ROADMAP.md
```

### 緊急聯絡
- **架構問題**: @T01
- **爬蟲問題**: @T02
- **AI 推理問題**: @T03
- **前端問題**: @T04
- **獎金系統問題**: @T05
- **合規與安全問題**: @T06
- **部署問題**: @T07
- **跨團隊協調**: @M01

### 決策升級流程
```
小問題 → 團隊內部解決
 ↓
中問題 → M01 協調
 ↓
大問題 → M01 向您報告,等待決策
```

---

## 📌 重要提醒 (所有團隊必讀!)

### 📖 活文件原則 (Living Document Principle)

**所有文件都是滾動式可修正、可學習、可記憶的。**

每個團隊在工作過程中發現的**踩雷經驗、錯誤模式、最佳實踐**,
必須即時回寫到相關文件中,讓其他團隊成員 (包含未來加入的 Agent) 能夠避免重蹈覆轍。

**回寫規則**:
1. **踩雷經驗** → 寫入該文件的 `⚠️ Common Mistakes` 段落
2. **最佳實踐** → 寫入該文件的主要內容段落
3. **跨團隊影響** → 同時更新相關團隊的文件 + 發起跨團隊溝通請求
4. **系統級教訓** → 寫入 CLAUDE.md 的「共通問題與錯誤」段落

**範例**:
```markdown
# T02 在實作爬蟲時發現:
# robots.txt 的 Crawl-delay 有些網站用秒、有些用毫秒

## ⚠️ Common Mistakes
### Mistake N: Crawl-delay 單位不一致
- 發現日期: 2026-03-06
- 發現者: T02
- 問題: 某些 robots.txt 用秒 (2), 某些用毫秒 (2000)
- 解法: 統一判斷 — 若值 > 100 視為毫秒, 否則視為秒
- 影響: T06 合規審查需增加此檢查項目
```

### 🔴 絕對禁止
1. ❌ **禁止硬編碼** - 所有常數必須在 `shared/config.js` 或 `shared/enums.js` 定義
2. ❌ **禁止跳過文檔更新** - 修改代碼必須同步更新相關文檔
3. ❌ **禁止繞過 SSOT** - 不能自己重新定義已有的資料結構
4. ❌ **禁止洩漏錯誤** - 不能將內部錯誤訊息顯示給用戶
5. ❌ **禁止跨層級直接修改** - 必須透過 API 介面
6. ❌ **禁止忽略踩雷經驗** - 發現問題必須回寫到文件,不能只在腦中記住

### 🟢 必須執行
1. ✅ **必須遵守語言規則** - 隊長↔您用繁中,其他用英文
2. ✅ **必須階段 QA** - 每個階段結束必須執行檢查清單
3. ✅ **必須跨團隊對齊** - 修改介面必須通知上下游團隊
4. ✅ **必須記錄變更** - 所有重要決策都記錄到滾動式文檔
5. ✅ **必須報告矛盾** - 發現邏輯矛盾立即向 M01 報告
6. ✅ **必須回寫經驗** - 踩雷經驗即時寫入相關文件的 Common Mistakes 段落
7. ✅ **必須啟動掃描** - 每次開啟 Session 先掃描 `shared/cross_team_comms/`

---

## 📝 版本紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v1.0 | 2025-03-06 | 初版 CLAUDE.md | 專案啟動,建立 Agent Teams 冷啟動文件 |
| v1.1 | 2026-03-06 | 新增跨團隊溝通機制 + 活文件原則 | 支援多終端非同步協作,確保踩雷經驗可學習 |
| v1.2 | 2026-03-07 | PowerReader 更名 + 模型 4B + RAG 三層架構 + 中央空廚架構 | 模型測試結果: 2B 不堪用, 4B+RAG 顯著改善; 架構從純去中心化改為中央空廚+用戶端推理 |
| v1.3 | 2026-03-07 | 第二輪更新: CKIP→bge-m3, 雙 repo 架構, Cloudflare 全棧, 篩選模型, API 結構, 41 項建議 | 架構評估完成 |

---

**文件維護者**: M01 (需求師 & 專案邏輯檢測師)
**最後更新**: 2026-03-07
**下次審查**: 每個階段結束時
