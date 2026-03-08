# PWA 技術規格書 (Progressive Web App Specification)

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js, T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md
- **下游文件**: T04_FRONTEND/UI_LOCALIZATION.md, T04_FRONTEND/LINE_BOT_DESIGN.md, T07_DEPLOYMENT/CI_CD_PIPELINE.md
- **維護者**: T04 (Frontend Experience Team)
- **類型**: SSOT - PWA 技術規格
- **最後更新**: 2026-03-08

---

## 文件目的
此文件是 **台灣新聞立場分析 PWA 的唯一技術規格**。
定義 Web App Manifest、Service Worker 策略、IndexedDB 結構、頁面架構、本地模型管理、離線能力與效能目標。

所有前端實作必須遵循本文件,不可自行定義快取策略或資料結構。

**修改此文件時必須通知**: T01 (API 介面), T03 (模型規格), T07 (部署)

---

## 1. Web App Manifest

### manifest.json

```json
{
  "name": "台灣新聞立場分析",
  "short_name": "新聞立場",
  "description": "透過公民算力分析台灣新聞媒體立場與爭議程度",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#1A73E8",
  "background_color": "#FFFFFF",
  "lang": "zh-TW",
  "dir": "ltr",
  "categories": ["news", "education"],
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/home.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "首頁 - 今日熱門新聞"
    }
  ]
}
```

### Manifest 欄位對照表

| 欄位 | 值 | 來源 |
|------|-----|------|
| `name` | `台灣新聞立場分析` | `shared/config.js` FRONTEND.PWA_NAME |
| `short_name` | `新聞立場` | `shared/config.js` FRONTEND.PWA_SHORT_NAME |
| `display` | `standalone` | 全螢幕 App 體驗,隱藏瀏覽器 UI |
| `orientation` | `any` | 桌面網頁版為主 (Decision #017) |
| `lang` | `zh-TW` | `shared/config.js` LOCALIZATION.DEFAULT_LOCALE |

### 安裝提示策略

攔截 `beforeinstallprompt` 事件,延遲至使用者完成第一次分析後才顯示安裝提示,避免首次訪問干擾。

**Implementation**: see `js/app.js`

---

## 2. Service Worker 策略

### 2.1 快取架構總覽

```
Service Worker
├── Cache-First (靜態資源)
│   ├── HTML shells
│   ├── CSS / JS bundles
│   ├── 字型檔案
│   └── 圖片資源
├── Network-First (API 請求)
│   ├── /api/articles/*
│   ├── /api/analysis/*
│   ├── /api/user/*
│   └── Fallback → IndexedDB 離線資料
└── Background Sync (離線提交)
    ├── 分析結果提交
    └── 投票提交 (Phase 2+ 延後)
```

### 2.1.1 v2.0 新增: 事件快取策略

```
Service Worker (v2.0 additions)
├── Stale-While-Revalidate (事件聚合)
│   ├── /api/v1/events (事件列表 — 快速顯示舊資料同時更新)
│   ├── /api/v1/events/:cluster_id (事件詳細)
│   └── /api/v1/blindspot/events (盲區事件)
├── Network-First (個人化 API)
│   ├── /api/v1/user/me/reading-bias (個人偏見)
│   ├── /api/v1/sources/:source (來源透明度)
│   └── /api/v1/subscribe (訂閱操作)
└── IndexedDB (新 Store)
    ├── events (事件聚合快取)
    └── reading_history (本地閱讀紀錄)
```

### 2.2 Cache-First 策略 (靜態資源)

**適用範圍**: HTML、CSS、JS、字型、圖片等靜態資源
**TTL**: 10 天 (= `shared/config.js` CLOUDFLARE.KV_STATIC_TTL = 864000 秒)
**機制**: Install 時預快取所有 `STATIC_ASSETS` → Fetch 時先查快取 (帶 `x-cache-time` TTL 檢查) → 過期則背景更新 → 完全無快取時才走網路

**Implementation**: see `sw.js` — `STATIC_ASSETS`, `cacheFirst()`, `fetchAndCache()`

### 2.3 Network-First 策略 (API 請求)

**適用範圍**: 所有 `/api/*` 端點
**Fallback**: 網路失敗時從 IndexedDB 讀取離線資料 → 若 IndexedDB 也無資料則回傳 503 離線提示

**Implementation**: see `sw.js` — `networkFirst()`

### 2.4 Background Sync (離線同步)

**適用範圍**: 使用者在離線時提交的分析結果和投票

**機制**:
- 離線提交 → 寫入 IndexedDB `pending_sync` Store → 註冊 `submit-pending` sync tag
- SW 收到 sync 事件 → 遍歷 pending items → POST 到 API → 成功則刪除
- 重試上限: `MAX_SYNC_RETRIES = 5` (超過則標記 `failed_permanent`,通知 client)
- App 啟動時: `recoverFailedSyncItems()` 檢查永久失敗項目 → 顯示重試/捨棄 toast

**Implementation**: see `sw.js` (SW side) + `js/db.js` (client side)

### 2.5 Service Worker 路由決策

- `/api/*` → Network-First
- 其他靜態資源 → Cache-First

**Implementation**: see `sw.js`

---

## 3. IndexedDB 結構

### 3.1 資料庫總覽

| 設定 | 值 | 來源 |
|------|-----|------|
| 資料庫名稱 | `TaiwanNewsBias` | `shared/config.js` FRONTEND.INDEXEDDB_NAME |
| 版本 | `1` | `shared/config.js` FRONTEND.INDEXEDDB_VERSION |
| 快取天數 | `10` 天 | `shared/config.js` FRONTEND.INDEXEDDB_CACHE_DAYS |
| 持久儲存 | `true` | `shared/config.js` FRONTEND.STORAGE_PERSIST |

### 3.1.1 v2.0 新增 Object Stores

| Store 名稱 | keyPath | 用途 |
|------------|---------|------|
| `events` | `cluster_id` | 事件聚合快取 (三色分布, 來源列表) |
| `reading_history` | `id` (auto) | 本地閱讀紀錄 (article_id + timestamp, 用於偏見計算) |
| `source_tendencies` | `source` | 來源傾向快取 (avg_bias, sample_count, last_updated) |

### 3.2 Object Stores 定義

| Store | keyPath | 索引 | 用途 |
|-------|---------|------|------|
| `articles` | `article_hash` | `by_source`, `by_status`, `by_published`, `by_cached_at` | 新聞文章快取 |
| `user_analyses` | `id` (auto) | `by_article`, `by_synced`, `by_created` | 使用者本地分析結果 |
| `cached_results` | `cache_key` | `by_cached_at` | API 回應快取 |
| `pending_sync` | `id` | `by_type`, `by_created` | 離線待同步佇列 |
| `model_files` | `key` | `by_stored_at` | 本地模型檔案 (OPFS fallback) |

**Implementation**: see `js/db.js`

### 3.3 各 Store 資料結構

#### articles Store

```javascript
// keyPath: article_hash
{
  "article_hash": "sha256_hash",       // 主鍵,與 KV Schema 一致
  "url": "https://...",
  "source": "自由時報",                 // Must use enums.js NEWS_SOURCES
  "title": "新聞標題",
  "published_at": "2026-03-06T10:00:00+08:00",
  "status": "published",               // Must use enums.js ARTICLE_STATUS
  "bias_score": 65,
  "bias_category": "center_right",     // Must use enums.js BIAS_CATEGORIES
  "controversy_score": 42,
  "controversy_level": "high",         // Must use enums.js CONTROVERSY_LEVELS
  "tokens": ["台灣", "新聞"],
  "cached_at": "2026-03-06T12:00:00+08:00"  // 本地快取時間,用於 TTL 清理
}
```

#### user_analyses Store

```javascript
// keyPath: id (autoIncrement)
{
  "id": 1,
  "article_hash": "sha256_hash",
  "bias_score": 58,
  "controversy_score": 35,
  "reasoning": "使用者的分析理由...",
  "model_version": "Qwen3-4B-q4f16_1-MLC",   // Must match config.js MODELS.QWEN
  "inference_mode": "local",              // "local" | "server"
  "synced": false,                        // 是否已同步到伺服器
  "created_at": "2026-03-06T12:30:00+08:00"
}
```

#### cached_results Store

```javascript
// keyPath: cache_key
{
  "cache_key": "/api/articles/trending?page=1",
  "data": { /* API 回應的完整 JSON */ },
  "cached_at": "2026-03-06T12:00:00+08:00"
}
```

### 3.4 快取清理機制

App 啟動時掃描 `articles` 和 `cached_results` Store,刪除 `cached_at` 超過 10 天 (TTL from `config.js`) 的記錄。

**Implementation**: see `js/db.js`

### 3.5 持久儲存 (Persistent Storage)

App 啟動時請求 `navigator.storage.persist()`,避免瀏覽器自動清理 IndexedDB。

**Implementation**: see `js/db.js`

---

## 4. 頁面架構

### 4.1 頁面總覽

| 頁面 | 路由 | 說明 | 資料來源 |
|------|------|------|---------|
| Home (事件聚合) | `/` | 事件聚合首頁,依爭議程度排序的事件卡片 | API: `/api/v1/events` |
| Event Detail | `/event/:cluster_id` | 單一事件的三營陣分布 + 跨媒體來源光譜 | API: `/api/v1/events/:cluster_id` |
| Article Detail | `/article/:hash` | 單篇新聞的三軸雷達圖 + 立場分析 | API: `/api/v1/articles/:hash` |
| Analysis | `/analyze/:hash` | Qwen 本地分析表單 | 本地推理 + API 提交 |
| Blindspot | `/blindspot` | 報導盲區事件列表 | API: `/api/v1/blindspot/events` |
| Source Transparency | `/source/:source` | 來源傾向分析 + 擁有者/類型 | API: `/api/v1/sources/:source` |
| Reading Bias | `/profile/bias` | 個人閱讀偏見分析 + 三色餅圖 | API: `/api/v1/user/me/reading-bias` |
| Profile | `/profile` | 使用者點數、貢獻歷史、徽章 | API: `/api/v1/user/me/points` |
| Compare | `/compare` | 事件聚合式跨媒體比較 + 盲區提示 | API: `/api/v1/events/:cluster_id` |
| Settings | `/settings` | 模型管理、通知、訂閱、語言 | 本地 IndexedDB |

### 4.2 Home 頁面 (事件聚合首頁)

> **v2.0 變更**: 從文章列表改為事件 (cluster) 聚合視圖。每張卡片代表一個事件,非單篇文章。

```
+------------------------------------------+
|  PowerReader               [搜尋] [設定]  |
+------------------------------------------+
|  今日事件                  2026年3月8日    |
+------------------------------------------+
|  [極高爭議]                                |
|  事件: 立法院審議前瞻計畫               |
|  ┌─────────────────────────────────────┐  |
|  │ ████████░░░░░░░░░░░░░░░░████████████│  |
|  │ 泛綠 35%  泛白 15%   泛藍 50%       │  |
|  └─────────────────────────────────────┘  |
|  5 家媒體 | 12 篇報導 | 🔴 藍營盲區       |
|  自由時報·中央社·聯合報·中國時報·新頭殼   |
+------------------------------------------+
|  [高度爭議]                                |
|  事件: 兩岸經貿政策討論                   |
|  ┌─────────────────────────────────────┐  |
|  │ ██████████████░░░░░████████████████ │  |
|  │ 泛綠 42%  泛白 8%    泛藍 50%       │  |
|  └─────────────────────────────────────┘  |
|  4 家媒體 | 8 篇報導 | ⚠️ 觀點失衡        |
+------------------------------------------+
|  [更多事件 ▼]                              |
+------------------------------------------+
|  首頁  盲區  分析  比較  我的              |
+------------------------------------------+
```

**功能要點**:
- **事件卡片**: 每張卡片 = 一個 event cluster (Jaccard ≥ 0.45 聚合)
- **三色分布條**: 橫向色帶顯示 泛綠(#2E7D32) / 泛白(#757575) / 泛藍(#1565C0) 的報導比例
  - ⚠️ REUSES EXISTING: `articles.bias_score` → `getCampFromScore()` 計算每篇歸屬
- **盲區標記**: 事件卡片右下角顯示 blindspot badge (若有)
  - `detectBlindspot(campCounts)` → 綠營盲區/藍營盲區/觀點失衡
- **來源計數**: `{N} 家媒體 | {M} 篇報導`
- 預設依爭議程度 (`controversy_score` 平均) 降序排列
- 支援無限捲動 (infinite scroll),每次載入 20 個事件
- 離線時顯示 IndexedDB 快取的最後一批事件
- **72h 分析截止指示器**: 保留 (以事件中最早文章為基準)
- 點擊事件卡片 → 進入 Event Detail 頁面

### 4.3 Article Detail 頁面 (立場視覺化 + 三軸雷達圖)

> **v2.0 變更**: 新增三軸雷達圖、來源傾向連結、事件上下文。

```
+------------------------------------------+
|  [←返回]  文章詳細          [分享] [分析]  |
+------------------------------------------+
|  文章標題                                  |
|  來源: 自由時報 | 2026年3月8日 14:30       |
|  [查看來源資訊 →]                          |
+------------------------------------------+
|  三軸雷達圖                                |
|        泛綠(75)                            |
|         /\                                 |
|        /  \                                |
|       /    \                               |
|      /      \                              |
|     /________\                             |
|  泛白(50)  泛藍(25)                        |
|                                            |
|  營陣判定: 泛綠 (bias_score: 35)           |
+------------------------------------------+
|  爭議程度: ████████░░ 高度爭議 (72)        |
+------------------------------------------+
|  所屬事件: 立法院審議前瞻計畫             |
|  ┌─────────────────────────────────────┐  |
|  │ ████████░░░░░░░░░████████████████████│  |
|  │ 泛綠 35%  泛白 15%   泛藍 50%       │  |
|  └─────────────────────────────────────┘  |
|  [查看事件全貌 →]                          |
+------------------------------------------+
|  跨媒體比較 (同事件)                       |
|  自由時報  ●━━━━━━●━━━━━━━━━━●  35        |
|  聯合報    ●━━━━━━━━━━●━━━━━●  68         |
|  中央社    ●━━━━━━━━●━━━━━━━●  51         |
+------------------------------------------+
|  分析統計                                  |
|  參與人數: 128 | 通過率: 65%              |
|  共識分數: 72/100                          |
+------------------------------------------+
|  [前往原文 ↗] [我要分析 →]                 |
+------------------------------------------+
```

**三軸雷達圖規格**:
- **泛綠軸**: `100 - bias_score` (score=0 → 綠=100, score=100 → 綠=0)
- **泛藍軸**: `bias_score` (直接使用)
- **泛白軸**: `100 - abs(bias_score - 50) * 2` (⚠️ DERIVED, 使用 `getWhiteAxisValue()`)
- 三角形繪製: Canvas 或 SVG, 三軸 0-100
- CAMP_COLORS: 綠=#2E7D32, 灰=#757575, 藍=#1565C0
- 填充區域半透明 (opacity: 0.3)
- ⚠️ REUSES EXISTING: `articles.bias_score` — 三軸全部從 bias_score 推導

**功能要點**:
- 來源名稱為可點擊連結 → 進入 Source Transparency 頁面
- 所屬事件區塊顯示三色分布條 + 連結到 Event Detail
- 跨媒體比較列出同事件所有文章,每篇附帶 camp badge
- 原文連結開啟外部瀏覽器,不在 App 內載入
- **72h 分析截止指示器**: 保留原邏輯

### 4.4 Analysis 行為 (Mode A — 自動分析)

> **v2.1 變更 (Decision #017)**: 不再有獨立的 Analysis「頁面」。
> 分析行為整合進 Article Detail 頁面,後台自動觸發。
> 分析結果是文章的一部分,不是工具。

**功能要點**:
- **Mode A (自動)**: 打開文章 → 後台自動觸發 WebLLM (WebGPU) 推理 (無需按按鈕)
- 本地 Qwen3-4B 透過 WebLLM Service Worker 執行 WebGPU 推理 (詳見第 5 節 模型管理)
- 推理模式: think=false, t=0.5 (決策 #004)
- 文章底部顯示進度條 (可下拉隱藏)
- 完成後結果嵌入文章底部 (立場分析、AI 分析參考等)
- 完成通知: `+1 完成 · +1 代幣` (3 秒後淡出)
- 離線時暫存至 `pending_sync` Store,上線後自動提交
- **多版本分析**: 使用者可查看/切換同一篇文章的不同分析版本 (Decision #021)
- **Cooldown UI (來自 T05 獎金系統)**:
  - 使用者處於冷卻期時,自動分析暫停
  - 顯示倒數計時器: 剩餘冷卻時間 (mm:ss 格式)
  - 顯示冷卻原因提示文字
  - i18n keys: `reward.cooldown.active`, `reward.cooldown.remaining`

### 4.5 Profile 頁面 (點數系統)

**功能要點**:
- 顯示總點數
- ~~投票權數 (10 點 = 1 票)~~ **(Phase 2+ 延後)** — 保留點數系統顯示,投票功能延後實作
- 貢獻歷史清單 (日期、文章、是否通過驗證)
- 點數趨勢折線圖 (近 30 天)
- 匿名化使用者 ID (顯示 user_hash 前 8 碼)

### 4.6 Compare 頁面 (事件聚合式跨媒體比較)

> **v2.0 變更**: 改為事件導向比較,加入盲區提示和三方摘要。

**功能要點**:
- 選擇事件 (event cluster),列出所有報導此事件的媒體
- **三色分布條**: 事件頂部顯示整體營陣分布
- **來源光譜**: 每個來源一行,顯示 camp badge + bias_score
- **盲區提示**: 若事件缺少某營陣報導,醒目標示 (⚠️ 配色 + 文字)
- **三方摘要** (Phase 5): 按 綠/白/藍 分別摘要報導角度
  - ⚠️ 需 LLM: 使用 Workers AI 產生,非本地推理
  - 免費用戶: 顯示各方標題列表
  - 訂閱者: 顯示完整 AI 摘要
- 雷達圖: 各媒體的三軸雷達重疊比較
- 支援分享比較結果圖片

### 4.7 Settings 頁面

**功能要點**:
- **WebLLM 狀態**: WebGPU 支援 + 模型下載狀態 + benchmark 結果 (GPU/WASM) + 重新偵測按鈕
- **推理設定**: timeout tier 顯示 + 資源用量上限 (80%)
- 通知設定: Push notification 開關
- 快取管理: 查看 IndexedDB 用量,手動清理
- 關於: 版本、開源授權 (AGPL-3.0)、隱私政策連結

### 4.8 Event Detail 頁面 (事件詳細 + 三營陣分布)

> **v2.0 新增**: 每個事件聚合的完整分析頁面。

```
+------------------------------------------+
|  [←返回]  事件詳細          [分享]         |
+------------------------------------------+
|  立法院審議前瞻計畫                       |
|  5 家媒體 | 12 篇報導 | 2026年3月8日      |
+------------------------------------------+
|  三營陣分布                                |
|  ┌─────────────────────────────────────┐  |
|  │ ████████░░░░░░░░░████████████████████│  |
|  │ 泛綠 35%  泛白 15%   泛藍 50%       │  |
|  └─────────────────────────────────────┘  |
|  ⚠️ 報導盲區: 中立來源偏少               |
+------------------------------------------+
|  各媒體報導                                |
|  ┌──────────────────────────────────────┐ |
|  │ 🟢 自由時報     bias: 28  [泛綠]     │ |
|  │    標題: XXXXXX                       │ |
|  │ 🟢 新頭殼       bias: 32  [泛綠]     │ |
|  │    標題: XXXXXX                       │ |
|  │ ⚪ 中央社       bias: 48  [泛白]     │ |
|  │    標題: XXXXXX                       │ |
|  │ 🔵 聯合報       bias: 72  [泛藍]     │ |
|  │    標題: XXXXXX                       │ |
|  │ 🔵 中國時報     bias: 78  [泛藍]     │ |
|  │    標題: XXXXXX                       │ |
|  └──────────────────────────────────────┘ |
+------------------------------------------+
|  爭議程度: ████████░░ 高度爭議 (72)        |
|  共識分數: 45/100 (低共識)                 |
+------------------------------------------+
|  [跨媒體比較 →] [查看三方摘要 →]           |
+------------------------------------------+
```

**功能要點**:
- **三色分布條**: 同首頁卡片,但更大更詳細 (顯示百分比數字)
- **來源光譜**: 每篇文章按 bias_score 排列,附 camp badge (色點 + 文字)
  - ⚠️ REUSES EXISTING: `articles.bias_score` + `getCampFromScore()`
- **盲區提示**: 若缺少某營陣報導,在分布條下方醒目標示
- **爭議程度**: 事件內所有文章的 `controversy_score` 平均
- **共識分數**: 所有文章 bias_score 的標準差反函數 (std 越小 → 共識越高)
  - `consensus = max(0, 100 - std(bias_scores) * 3)` — ⚠️ DERIVED

### 4.9 Blindspot 頁面 (報導盲區)

> **v2.0 新增**: 台灣版盲區偵測。

```
+------------------------------------------+
|  [←返回]  報導盲區                        |
+------------------------------------------+
|  報導盲區是指某個事件只被特定營陣的       |
|  媒體報導,缺少其他觀點的報導。            |
+------------------------------------------+
|  🔴 藍營盲區 (綠營獨占報導)               |
|  ┌──────────────────────────────────────┐ |
|  │ 事件: 環境保護法修正案               │ |
|  │ ████████████████████░░░░░░░░░░░░░░░ │ |
|  │ 泛綠 85%    泛白 15%    泛藍 0%     │ |
|  │ 3 家媒體 | 僅有泛綠來源報導          │ |
|  └──────────────────────────────────────┘ |
+------------------------------------------+
|  🔴 綠營盲區 (藍營獨占報導)               |
|  ┌──────────────────────────────────────┐ |
|  │ 事件: 兩岸論壇討論                   │ |
|  │ ░░░░░░░░░░░░░░░████████████████████ │ |
|  │ 泛綠 0%    泛白 10%    泛藍 90%     │ |
|  │ 2 家媒體 | 僅有泛藍來源報導          │ |
|  └──────────────────────────────────────┘ |
+------------------------------------------+
|  ⚠️ 觀點失衡                              |
|  ... (更多事件)                            |
+------------------------------------------+
```

**功能要點**:
- API: `GET /api/v1/blindspot/events` — 由 Cron Worker 定期掃描 event_clusters
- 盲區分類使用 `BLINDSPOT_TYPES` enum + `detectBlindspot()`
  - ⚠️ REUSES EXISTING: `articles.bias_score` + `getCampFromScore()` per cluster
- 按嚴重程度排序: green_only/blue_only > white_missing > imbalanced
- 每個盲區事件顯示三色分布條 + 缺失營陣標記
- 點擊進入 Event Detail 頁面
- 底部導航新增「盲區」tab (取代原本的「分析」快捷)

### 4.10 Source Transparency 頁面 (來源透明度)

> **v2.0 新增**: 每個新聞來源的傾向分析面板。

```
+------------------------------------------+
|  [←返回]  來源透明度                      |
+------------------------------------------+
|  自由時報                                  |
|  類型: 傳統紙媒 | 創立: 1980              |
|  擁有者: 聯邦企業集團                      |
+------------------------------------------+
|  社群傾向分析 (30天滑動)                   |
|  ●━━━━━━●━━━━━━━━━━━●                     |
|  泛綠方向 (平均 bias: 32)                  |
|  有效樣本: 45 篇 | 信賴度: 高             |
+------------------------------------------+
|  近期營陣分布                              |
|  ┌─────────────────────────────────────┐  |
|  │ ██████████████████░░░░░░░░░░░░░░░░░│  |
|  │ 泛綠 72%    泛白 20%    泛藍 8%    │  |
|  └─────────────────────────────────────┘  |
+------------------------------------------+
|  月度趨勢 (近6個月)                        |
|  35 ─┐     ┌──┐                           |
|  30 ─┤─────┘  └──┐                        |
|  25 ─┤            └──                      |
|      Sep Oct Nov Dec Jan Feb               |
+------------------------------------------+
|  此來源的近期文章                          |
|  ... (文章列表)                            |
+------------------------------------------+
```

**功能要點**:
- **社群推導 (Decision #014)**: 來源傾向不是預設標籤,而是由該來源近 30 天文章的 `AVG(bias_score)` 計算
  - ⚠️ REUSES EXISTING: `articles.bias_score` + `articles.source`
  - 最低 `THREE_CAMP.MIN_SAMPLES` (10 篇) 才顯示傾向,否則顯示「資料不足」
- **擁有者/類型資訊**: 靜態資料,存在 D1 `source_tendencies` 表的 metadata 欄位
- **月度趨勢**: 折線圖顯示近 6 個月的平均 bias_score 變化
  - ⚠️ REUSES EXISTING: `articles.bias_score` + `articles.published_at`
- 近期文章列表: 該來源最新 10 篇,附 camp badge

### 4.11 Reading Bias 頁面 (個人閱讀偏見)

> **v2.0 新增**: 追蹤使用者閱讀行為,提醒偏見。

```
+------------------------------------------+
|  [←返回]  我的閱讀偏見報告                |
+------------------------------------------+
|  近 30 天閱讀分布                          |
|       ┌───────────┐                        |
|      /    泛綠     \                       |
|     /     62%       \                      |
|    │   ┌───────┐    │                      |
|    │   │ 泛白  │    │                      |
|    │   │ 18%   │    │                      |
|     \  └───────┘  /                        |
|      \   泛藍   /                          |
|       \  20%  /                            |
|        └─────┘                             |
+------------------------------------------+
|  偏見分析                                  |
|  您主要閱讀泛綠來源的報導。               |
|  建議: 嘗試閱讀更多泛藍或中立來源,       |
|  以獲得更全面的觀點。                      |
+------------------------------------------+
|  建議閱讀                                  |
|  以下是您較少閱讀的營陣的近期熱門文章:    |
|  🔵 聯合報: XXXXX                          |
|  ⚪ 中央社: XXXXX                          |
+------------------------------------------+
|  徽章成就                                  |
|  🏅 跨媒體達人 (閱讀 3+ 來源同事件)       |
|  🏅 盲區發現者 (閱讀 10 篇盲區文章)       |
+------------------------------------------+
```

**功能要點**:
- **三色餅圖**: 30 天內閱讀過的文章按 camp 分類,顯示比例
  - ⚠️ REUSES EXISTING: `user_reading_history` 記錄 article_id → `articles.bias_score` → camp
- **偏見分析文字**: 規則式生成 (非 LLM),基於三色比例判斷
  - 某營陣 > 60%: 「您主要閱讀 {camp} 來源的報導」
  - 各營陣 30-40%: 「您的閱讀分布相當均衡」
- **建議閱讀**: 推薦使用者較少閱讀的營陣的熱門文章
  - ⚠️ REUSES EXISTING: `articles.bias_score` + `articles.controversy_score`
- **徽章**: 顯示已獲得的 `BADGE_TYPES` 成就
- **訂閱者增強**: 完整版報告 (含每週趨勢 + 營陣偏移警報)
  - 免費用戶: 僅顯示 30 天餅圖 + 簡單建議

### 4.12 Subscription 頁面 (訂閱機制)

> **v2.0 新增**: 訂閱者權益,不鎖功能。

**訂閱者權益 (Decision #015)**:
| 功能 | 免費用戶 | 公民贊助者 (訂閱) |
|------|---------|-----------------|
| 閱讀所有文章 | Yes | Yes |
| Qwen 本地分析 | Yes | Yes |
| 三色分布條 | Yes | Yes |
| 盲區瀏覽 | Yes | Yes |
| 投票權倍率 | 1x | 2x (`THREE_CAMP.SUBSCRIBER_VOTE_MULTIPLIER`) |
| 搶先體驗 | - | 新功能提前 24h 體驗 |
| 完整個人報告 | 30天餅圖 | 每週趨勢 + 營陣偏移警報 + 歷史對照 |
| 三方摘要 | 標題列表 | 完整 AI 摘要 |
| Email 通知 | - | 每日摘要 + 盲區警報 |
| 去除廣告 | N/A (永遠無廣告) | N/A |

**Email 通知系統**:
- **每日摘要**: 今日 Top 5 事件 + 三色分布 + 盲區數量 (Cron 17:00 TST)
- **盲區警報**: 重大事件 + 嚴重盲區 → 即時 email
- **分析結果**: 使用者提交分析後 → 驗證結果 email
- 發送方式: Cloudflare Email Workers (免費 100 封/天)
  - ⚠️ 免費額度足夠 MVP 階段

### 4.13 Three-Camp Visual System (三營陣視覺系統)

> **v2.0 新增**: 統一的三營陣視覺語言,貫穿所有頁面。

#### 表層: 三色分布條 (Three-Color Distribution Bar)

用途: 事件 / 來源 / 全站統計等 **聚合** 層級
- 橫向色帶,左→右 = 泛綠(#2E7D32) → 泛白(#757575) → 泛藍(#1565C0)
- 寬度比例 = 該群組中各營陣文章數占比
- 每段最小寬度 5% (避免窄段不可見)
- 百分比數字顯示在色帶內 (≥15%) 或色帶下方 (<15%)
- ⚠️ REUSES EXISTING: `articles.bias_score` → `getCampFromScore()` → 統計

#### 內層: 三軸雷達圖 (Three-Axis Radar Chart)

用途: **單篇文章** 層級
- 正三角形,三頂點 = 泛綠軸 / 泛白軸 / 泛藍軸
- 泛綠軸 = `100 - bias_score`
- 泛藍軸 = `bias_score`
- 泛白軸 = `getWhiteAxisValue(bias_score)` = `100 - abs(bias_score - 50) * 2`
- 填充區域: 半透明 (alpha 0.3), 邊框 1px solid
- ⚠️ DERIVED: 三軸全部從 bias_score 單一值推導,不需額外 AI 輸出

#### 漸進式權重 (Gradient Weights)

Decision #013: 避免 39→41 分的硬切割 (顏色跳變)
- 邊界 ±`GRADIENT_ZONE` (5分) 為漸進區
- 35-45: 泛綠 ↔ 泛白 漸進
- 55-65: 泛白 ↔ 泛藍 漸進
- `getCampFromScore()` 回傳 `weights: { green, white, blue }` 加總為 1.0
- UI 色帶在漸進區使用 CSS gradient 混色

#### 報紙式低飽和設計

借鑑 Ground.news utilitarian 風格,台灣化:
- 背景: `#FAFAF8` (微暖白)
- 卡片: `#FFFFFF` + 1px `#E8E8E4` border
- 文字: `#2C2C2A` (深灰而非純黑)
- 營陣色只用於: 三色分布條、camp badge、雷達圖填充
- 其餘 UI 保持低飽和灰階

### 4.14 Login Flow (登入流程)

**匿名瀏覽模式**:
- 使用者無需登入即可瀏覽首頁文章列表與文章詳細頁
- 所有閱讀功能在未登入狀態下均可使用

**OAuth 觸發時機**:
- 使用者點擊「我要分析」按鈕時,若未登入則彈出 Google OAuth 授權畫面
- 授權完成後自動導回原文章的分析頁面

**使用者身份管理**:
- User ID: 使用 SHA-256 hash 處理 OAuth identity,確保匿名化
- User ID hash 儲存於 IndexedDB `cached_results` Store (key: `user_identity`)
- Session: JWT 儲存於記憶體變數 (非 localStorage),避免 XSS 竊取
- JWT 過期時透過 API refresh endpoint 靜默更新

**隱私同意 (台灣個人資料保護法 第8條)**:
- OAuth 授權前顯示隱私政策同意對話框
- 必須勾選「我已閱讀並同意隱私政策」(附完整政策連結)
- 同意時間戳記存入 IndexedDB 並同步至伺服器
- i18n key: `privacy.consent.checkbox`, `privacy.consent.required`

### 4.15 Onboarding (首次使用引導)

**觸發條件**: IndexedDB 中無 `onboarding_completed` flag 時,首次訪問自動顯示

**步驟 (3-5 步 Carousel)**:

| 步驟 | 標題 | 說明 |
|------|------|------|
| 1 | 歡迎使用 | App 目的: 公民算力分析新聞立場,讓資訊更透明。**進入即代表您是參與者/貢獻者** (知情同意) |
| 2 | 立場光譜 | 說明偏綠←→偏藍的光譜概念,三營陣 (綠/白/藍) 的定義 |
| 3 | 本地 AI 分析 | 說明: 使用 WebLLM 在瀏覽器內執行 Qwen3-4B (WebGPU)。**桌面電腦** (需 WebGPU 支援)。模型約 3.4GB，自動下載至瀏覽器快取。分析在本地執行,資料不外傳 |
| 4 | 開始偵測 | **自動啟動 WebGPU 偵測 + benchmark**,或選擇「先瀏覽看看」跳過 |

**完成後**:
- 寫入 IndexedDB flag: `{ key: 'onboarding_completed', value: true, completed_at: ISO_STRING }`
- 不再顯示引導畫面 (可在 Settings 頁面重新觸發)

---

## 5. 本地模型管理 (WebLLM 瀏覽器內推理)

> **v2.2 變更 (Decision #017-#019, #021-#023)**:
> - 桌面網頁版 only — 手機不跑模型
> - 推理引擎改為 **WebLLM** (@mlc-ai/web-llm, WebGPU 瀏覽器內推理，零安裝)
> - **雙 Pass 架構**: 同一篇文章跑 2 次 4B，每次聚焦不同分析維度 (Decision #023)
> - Service Worker 背景推理，切分頁不中斷
> - Mode A: 使用者讀文章，後台自動分析
> - 同一篇文章可有多個分析版本 (不同使用者/不同模型)

### 5.1 模型資訊

| 項目 | 值 | 來源 |
|------|-----|------|
| 模型 | Qwen3-4B-q4f16_1-MLC (3,432 MB VRAM) | `shared/config.js` MODELS.QWEN |
| 備用模型 | Qwen2.5-3B-Instruct-q4f16_1-MLC (低 VRAM fallback) | `shared/config.js` MODELS.QWEN_FALLBACK |
| 推理模式 | think=false, t=0.5 (決策 #004) | `shared/config.js` MODELS.QWEN_PARAMS |
| 檔案大小 | ~3.4 GB (自動下載至瀏覽器 Cache/IndexedDB) | `shared/config.js` MODELS.QWEN_SIZE_MB |
| 推理引擎 | **WebLLM** (@mlc-ai/web-llm, WebGPU 瀏覽器內推理) | 零安裝，Service Worker 背景常駐 |
| 雙 Pass | 同一篇文章跑 2 次，每次聚焦不同維度 (~7s × 2 = ~14s) | Decision #023 |
| 支援平台 | **桌面網頁版 only** (需 WebGPU: Chrome 113+ / Edge 113+) | Decision #017 |
| 超時 | GPU: 30s/pass / CPU: 120s/pass | `shared/config.js` BENCHMARK |

### 5.2 硬體偵測 + Benchmark (Decision #018)

**啟動流程**:
1. 偵測瀏覽器是否支援 WebGPU (`navigator.gpu` API)
2. 若不支援 → 顯示「您的瀏覽器不支援 WebGPU」提示 (建議 Chrome 113+)
3. 若支援 → 檢查 GPU adapter VRAM 是否足夠 (≥ 3,432 MB)
4. 若 VRAM 不足 → 嘗試備用模型 (2,505 MB) 或降級為僅瀏覽模式
5. 初始化 WebLLM ServiceWorkerMLCEngine → 模型自動下載 (首次 ~3.4GB)
6. **Benchmark**: 執行短文推理計時 → 設定 timeout tier + 儲存 localStorage

**Benchmark 邏輯**:
```
偵測 WebGPU → navigator.gpu.requestAdapter()
  ↓ 成功
檢查 VRAM → adapter.limits.maxBufferSize
  ↓ ≥ 3,432 MB
初始化 WebLLM → ServiceWorkerMLCEngine.create()
  ↓ 模型載入完成
執行 Benchmark → engine.chat.completions.create()
  (短提示詞, 計時)
  ↓
判定結果:
  < 8s  → GPU 模式 (timeout = 30s/pass)
  < 60s → WASM 模式 (timeout = 120s/pass)
  > 60s → 太慢 (suggest server fallback)
  失敗  → 無法推理 (browse-only mode)
```

**localStorage 快取** (避免每次都 benchmark):
```javascript
{
  key: "pr_benchmark_result",
  value: {
    mode: "gpu" | "wasm" | "none",
    latency_ms: 5200,
    tested_at: "2026-03-08T12:00:00+08:00"
  }
}
```

**Benchmark 相關參數**: 見 `shared/config.js` BENCHMARK 區塊

**Implementation**: see `js/model/webllm-engine.js` (新建), `js/model/benchmark.js` (新建)

### 5.3 硬體偵測 UI

```
+------------------------------------------+
|  環境偵測                                  |
+------------------------------------------+
|                                            |
|  ⏳ 正在偵測您的環境...                     |
|                                            |
|  ✅ WebGPU: 已支援                         |
|  ✅ 模型: Qwen3-4B 已下載 (3.4GB)         |
|  ⏳ 效能測試中...                           |
|                                            |
|  結果: GPU 模式 (推理時間 ~6 秒)           |
|                                            |
|  [開始使用 →]                              |
+------------------------------------------+
```

**WebGPU 不支援時的 UI**:
```
+------------------------------------------+
|  需要 WebGPU 支援                          |
+------------------------------------------+
|                                            |
|  PowerReader 使用瀏覽器內 AI 分析新聞立場。 |
|  您的瀏覽器不支援 WebGPU。                  |
|                                            |
|  建議使用:                                 |
|  · Chrome 113+ (推薦)                      |
|  · Edge 113+                               |
|  · 其他支援 WebGPU 的桌面瀏覽器            |
|                                            |
|  [前往 Chrome 下載 ↗] [重新偵測]           |
|  [略過 — 僅瀏覽模式]                       |
+------------------------------------------+
```

### 5.4 Mode A — 背景自動分析 (Decision #017)

> **核心哲學**: 分析結果是文章的一部分，不是工具。

**流程**:
1. 使用者打開文章 → 閱讀文章內容
2. **後台自動觸發推理** (無需按按鈕)
   - 檢查 benchmark 結果 → 選擇 timeout tier
   - 呼叫 WebLLM Service Worker → 3 層 Prompt → 雙 Pass 推理
3. 文章底部顯示進度條 (可下拉隱藏)
4. 推理完成 → 結果嵌入文章底部 (立場分析、AI 分析參考等)
5. 完成通知: `+1 完成 · +1 代幣` (3 秒後淡出)
6. 結果同步上傳到 PowerReader API

**觸發條件**:
- 使用者已登入 (OAuth)
- WebGPU 偵測通過 (benchmark result 非 "none")
- 該文章尚未有此使用者的分析 (或使用者選擇重新分析)

**Implementation**: see `js/model/analyze-engine.js` (改造為自動模式)

### 5.5 推理引擎 Fallback 鏈

```
WebLLM 瀏覽器推理 (WebGPU GPU, timeout=30s/pass, 雙 Pass)
  ↓ WebGPU 不可用或 VRAM 不足
WebLLM WASM fallback (CPU, timeout=120s/pass)
  ↓ 瀏覽器不支援或推理失敗
Server Fallback (Cloudflare Workers AI, 未來)
  ↓ 無 server fallback (免費額度限制)
僅瀏覽模式 (顯示他人已完成的分析結果)
```

**推理進度條 (文章底部)**:
- 位置: 文章頁面最底部,可下拉隱藏
- 階段 1: 「正在組裝提示詞...」 (組裝 3 層 Prompt, ~1s)
- 階段 2: 「AI 分析中...」 (模型推理,主要耗時)
  - GPU: 預估 6-10 秒/pass (雙 Pass ~14s)
  - WASM: 預估 60-120 秒/pass
- 階段 3: 「產生結果...」 (解析 JSON 輸出, ~1s)
- WASM 模式 >30s: 顯示舒緩訊息「CPU 推理中,感謝您的耐心等待」
- 完成: `✅ 分析完成 +1 · 🪙 +1` (toast, 3 秒後淡出)

**資源保護 (Decision #019)**:
- GPU/CPU 推理均限制在使用者系統資源的 **80%** 以內
- WebLLM token-by-token dispatch (~5ms) 不觸發 10s TDR watchdog
- 但需監控推理耗時,超過 timeout 則中止並回退

**Implementation**: see `js/model/inference.js`

### 5.6 多版本分析 (Decision #021)

> 同一篇文章可有多個分析版本 (不同使用者/不同次推理)。

**版本管理**:
- 每次推理產生一個獨立的分析版本
- 版本包含: `user_hash`, `model_name`, `prompt_version`, `bias_score`, `reasoning`, `quality_score`
- **AI 品質總分**: 與模型本身的智性 (能力) 有關,非模型自評分
  - Qwen3-4B → 基礎品質分 (需校準)
  - 未來更強模型 → 更高品質分
  - 品質分用於版本間比較,不影響分析結果本身

**版本切換 UI**:
```
┌── 分析版本 (3 個) ──────────────────────┐
│                                          │
│  [v1] 你的分析 · Qwen3-4B · 品質 72   │  ← 當前顯示
│  [v2] 匿名用戶 · Qwen3-4B · 品質 68   │
│  [v3] 匿名用戶 · Qwen3-4B · 品質 75   │
│                                          │
└──────────────────────────────────────────┘
```

- 預設顯示品質最高的版本
- 使用者可切換查看不同版本的完整分析結果
- 版本列表在「分析透明度」面板中顯示

---

## 6. 離線能力

### 6.1 離線功能矩陣

| 功能 | 離線時可用 | 說明 |
|------|-----------|------|
| 瀏覽已快取文章 | Yes | IndexedDB `articles` Store |
| 閱讀文章詳細 | Yes | 若已快取 |
| Qwen 本地分析 | Yes | 需已下載模型 |
| 提交分析結果 | 排隊 | Background Sync 佇列 |
| 投票 | 排隊 | Background Sync 佇列 (Phase 2+ 延後) |
| 查看點數 | Yes | 最後一次同步的快取 |
| 下載新文章 | No | 需網路 |
| 跨媒體即時比較 | 部分 | 僅已快取的文章 |

### 6.2 離線指示器

- 監聽 `online`/`offline` 事件,控制 `#offline-banner` 顯隱
- 恢復連線時自動觸發 Background Sync (`submit-pending`)
- Banner 文字: `目前處於離線模式 - 已快取的內容仍可瀏覽,分析結果將於上線後自動提交`

**Implementation**: see `js/app.js`

**離線提交回饋 (UX Gap M3)**:
- 離線提交成功後: 顯示 toast「已保存,連線後自動提交」(3 秒後自動消失)
- Profile 頁面: 顯示「待同步」badge,含未同步項目數量
- 恢復連線時: toast 顯示「正在同步 N 筆資料...」→「同步完成」

---

## 7. 效能目標

### 7.1 Core Web Vitals 目標

| 指標 | 目標值 | 說明 |
|------|--------|------|
| FCP (First Contentful Paint) | < 2 秒 | 首次有內容繪製 |
| TTI (Time to Interactive) | < 4 秒 | 可互動時間 |
| LCP (Largest Contentful Paint) | < 2.5 秒 | 最大內容繪製 |
| CLS (Cumulative Layout Shift) | < 0.1 | 累計版面偏移 |
| FID (First Input Delay) | < 100 毫秒 | 首次輸入延遲 |

### 7.2 Lighthouse 目標

| 類別 | 目標分數 |
|------|---------|
| Performance | >= 90 |
| Accessibility | >= 90 |
| Best Practices | >= 90 |
| SEO | >= 90 |
| PWA | 全部通過 |

### 7.3 效能最佳化策略

| 策略 | 實作方式 |
|------|---------|
| 程式碼分割 | 各頁面 JS 獨立 bundle,按需載入 |
| 圖片最佳化 | WebP 格式,responsive `srcset`,lazy loading |
| 字型最佳化 | `font-display: swap`,子集化中文字型 |
| 預載入 | `<link rel="preload">` 關鍵 CSS/JS |
| 壓縮 | Cloudflare 自動 Brotli 壓縮 |
| CDN | Cloudflare Pages 全球 CDN 分發 |

---

## 8. 安全規範

### 8.1 XSS 防護

**所有使用者輸入必須經過 `escapeHtml()` 處理**:

```javascript
// utils/sanitize.js
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  return str.replace(/[&<>"'/]/g, (char) => map[char]);
}
```

**規則**:
- 禁止使用 `innerHTML` 搭配未轉義的使用者內容
- 禁止使用 `eval()` 或 `new Function()`
- 所有動態插入的文字必須經過 `escapeHtml()`
- 使用 `textContent` 優先於 `innerHTML`

### 8.2 Content Security Policy (CSP)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https://*.workers.dev https://huggingface.co https://raw.githubusercontent.com;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

**CSP 重點**:
- `https://huggingface.co` 和 `https://raw.githubusercontent.com` 允許 WebLLM 模型下載
- `worker-src blob:` 允許 Service Worker 和 Web Worker
- `frame-src 'none'` 禁止嵌入 iframe (防 clickjacking)
- `object-src 'none'` 禁止插件

### 8.3 其他安全措施

| 措施 | 說明 |
|------|------|
| HTTPS Only | Cloudflare Pages 強制 HTTPS |
| Subresource Integrity | 外部 CDN 資源加 `integrity` 屬性 |
| JWT 驗證 | RS256 非對稱加密 (from `config.js` SECURITY) |
| 匿名化 | 使用者 ID 一律 hash 處理 (from `config.js` SECURITY.ANONYMIZE_CONTRIBUTORS) |

---

## 9. 無障礙設計 (WCAG 2.1 AA)

### 9.1 必要實作項目

| WCAG 準則 | 實作方式 |
|-----------|---------|
| 1.1.1 非文字內容 | 所有圖片提供 `alt` 文字 |
| 1.3.1 資訊與關聯 | 語意化 HTML (`<nav>`, `<main>`, `<article>`) |
| 1.4.1 使用顏色 | 立場標示同時使用顏色 + 文字標籤 + 圖案 |
| 1.4.3 對比度 | 文字對比度 >= 4.5:1 |
| 1.4.11 非文字對比度 | UI 元件對比度 >= 3:1 |
| 2.1.1 鍵盤 | 所有功能可用鍵盤操作 |
| 2.4.1 跳過區塊 | 提供 Skip to Content 連結 |
| 2.4.7 焦點可見 | 明確的 focus indicator |
| 3.1.1 頁面語言 | `<html lang="zh-TW">` |
| 4.1.2 名稱角色值 | 所有互動元件提供 ARIA 屬性 |

### 9.2 色盲友善設計

立場視覺化同時使用:
- 顏色 (blue/gray/red)
- 文字標籤 (偏左/中立/偏右)
- 圖案填充 (斜線/點狀/十字) 用於色盲模式
- 數值 (0-100 分數)

```css
/* 色盲友善模式 */
@media (prefers-contrast: more) {
  .bias-bar-left { background: repeating-linear-gradient(45deg, #0066CC, #0066CC 2px, transparent 2px, transparent 4px); }
  .bias-bar-center { background: repeating-linear-gradient(0deg, #999, #999 2px, transparent 2px, transparent 4px); }
  .bias-bar-right { background: repeating-linear-gradient(-45deg, #CC0000, #CC0000 2px, transparent 2px, transparent 4px); }
}
```

---

## Common Mistakes

### Mistake 1: 使用 innerHTML 插入使用者內容 (XSS)

```javascript
// WRONG: 直接插入使用者內容
element.innerHTML = article.title;

// CORRECT: 使用 escapeHtml 或 textContent
element.textContent = article.title;
// 或
element.innerHTML = escapeHtml(article.title);
```

**教訓**: 文章標題可能包含惡意 HTML,必須轉義。

### Mistake 2: 未偵測 WebGPU 就嘗試推理

```javascript
// WRONG: 直接初始化 WebLLM
const engine = await CreateMLCEngine("Qwen3-4B-q4f16_1-MLC");

// CORRECT: 先偵測 WebGPU + 檢查 benchmark 結果
const benchmark = getBenchmarkResult(); // from localStorage
if (!benchmark || benchmark.mode === 'none') {
  showWebGPUSetupUI();
  return;
}
// 使用 Service Worker 引擎 (背景常駐，切分頁不中斷)
const engine = await CreateServiceWorkerMLCEngine("Qwen3-4B-q4f16_1-MLC", {
  initProgressCallback: (progress) => updateProgressBar(progress)
});
```

**教訓**: WebGPU 不支援或 VRAM 不足時,直接初始化會失敗。必須先偵測 WebGPU + benchmark。使用 ServiceWorkerMLCEngine 確保切分頁不中斷。

### Mistake 3: 快取未設定 TTL 導致陳舊資料

```javascript
// WRONG: 寫入 IndexedDB 未記錄時間
articleStore.put({ article_hash: hash, ...data });

// CORRECT: 加上 cached_at 供 TTL 清理使用
articleStore.put({
  article_hash: hash,
  ...data,
  cached_at: new Date().toISOString()
});
```

**教訓**: 沒有 cached_at 就無法判斷資料是否過期,會顯示陳舊新聞。

### Mistake 4: Service Worker 更新時未處理版本遷移

```javascript
// WRONG: 直接刪除所有快取
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.map((key) => caches.delete(key)))
  ));
});

// CORRECT: 只刪除舊版本快取
const CURRENT_CACHES = ['static-v1'];
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
});
```

**教訓**: 全部刪除會導致使用者需要重新下載所有資源。

### Mistake 5: Background Sync 未處理重試上限

```javascript
// WRONG: 無限重試
async function flushPendingSubmissions() {
  const items = await getPendingItems();
  for (const item of items) {
    await fetch('/api/submit', { body: JSON.stringify(item.payload) });
  }
}

// CORRECT: 加入重試計數,超過上限則放棄
const MAX_SYNC_RETRIES = 5;
async function flushPendingSubmissions() {
  const items = await getPendingItems();
  for (const item of items) {
    if (item.retry_count >= MAX_SYNC_RETRIES) {
      await deletePendingItem(item.id); // 放棄並通知使用者
      continue;
    }
    try {
      await fetch('/api/submit', { body: JSON.stringify(item.payload) });
      await deletePendingItem(item.id);
    } catch {
      await incrementRetryCount(item.id);
    }
  }
}
```

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 | 影響團隊 |
|------|------|---------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 | - |
| v1.0 | 2026-03-06 | 完整 PWA 規格: Manifest, SW, IndexedDB, 頁面, 模型管理, 離線, 效能, 安全, WCAG | 階段 4 前端開發啟動 | T01, T03, T07 |
| v1.1 | 2026-03-07 | Model 4B upgrade, 9 UX gaps (login, cooldown, deadline, model_files, onboarding, inference UX, offline feedback, sync recovery, privacy consent), vote UI deferred to Phase 2+ | Decision #004 + M01 UX review | T01, T03, T05, T06, T07 |
| v2.0 | 2026-03-08 | 三營陣視覺系統 (表層三色條+內層雷達圖), 事件聚合首頁 (cluster→event card), 報導盲區頁面, 來源透明度面板 (社群推導), 個人閱讀偏見 (三色餅圖+建議), 訂閱機制 (投票2x+搶先+完整報告), 三方摘要 (Phase 5), Email通知, Bottom Nav 改為 5-tab (首頁/盲區/分析/比較/我的), SW event cache, IndexedDB +3 stores | Decision #013-#016, Ground.news 台灣化 | All teams |
| v2.1 | 2026-03-08 | **桌面 only + Mode A**: 移除手機模型下載流程 (WiFi/電量); 推理引擎改 Ollama (移除 WebGPU/WASM); 硬體偵測+benchmark (GPU/CPU/none); CPU 支援 timeout 120-180s; 資源上限 80%; Mode A 自動分析 (文章底部進度條); 多版本分析+版本切換; AI 品質總分; Analysis 頁面整合進 Article Detail; Settings 改為 Ollama 狀態; Onboarding 更新 (桌面+Ollama+知情同意) | Decision #017-#021 | T01, T03, T07 |
| v2.2 | 2026-03-08 | **WebLLM 遷移**: 推理引擎 Ollama → WebLLM (零安裝 WebGPU); 模型 Qwen3.5-4B → Qwen3-4B-q4f16_1-MLC; +雙 Pass 架構; CSP 移除 localhost:11434 加入 HuggingFace CDN; 硬體偵測改為 WebGPU detect; Onboarding 移除 Ollama 安裝步驟; Settings Ollama 狀態→WebLLM 狀態; Fallback chain 改為 WebGPU→WASM→Server→Browse-only | Decision #022-#023 (WebLLM + Dual Pass) | T01, T03, T07 |

---

**重要提醒**:
修改此文件前,必須:
1. 提 GitHub PR 討論
2. 通知下游團隊 (T07 部署)
3. 更新 MASTER_ROADMAP.md 決策紀錄
4. 確認 `shared/config.js` FRONTEND 區塊一致

---

**文件維護者**: T04 (Frontend Experience Team)
**最後更新**: 2026-03-08
**下次審查**: 階段 4 結束時
