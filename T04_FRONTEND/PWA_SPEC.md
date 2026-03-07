# PWA 技術規格書 (Progressive Web App Specification)

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js, T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md
- **下游文件**: T04_FRONTEND/UI_LOCALIZATION.md, T04_FRONTEND/LINE_BOT_DESIGN.md, T07_DEPLOYMENT/CI_CD_PIPELINE.md
- **維護者**: T04 (Frontend Experience Team)
- **類型**: SSOT - PWA 技術規格
- **最後更新**: 2026-03-07

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
  "orientation": "portrait",
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
| `orientation` | `portrait` | 主要使用情境為手機直向 |
| `lang` | `zh-TW` | `shared/config.js` LOCALIZATION.DEFAULT_LOCALE |

### 安裝提示策略

```javascript
// 攔截 beforeinstallprompt 事件,延遲顯示安裝提示
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // 在用戶完成第一次分析後才顯示安裝提示
  // 避免首次訪問就彈出干擾
});

function showInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt = null;
  }
}
```

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

### 2.2 Cache-First 策略 (靜態資源)

**適用範圍**: HTML、CSS、JS、字型、圖片等靜態資源
**TTL**: 10 天 (= `shared/config.js` CLOUDFLARE.KV_STATIC_TTL = 864000 秒)

```javascript
// sw.js - Cache-First 策略
const STATIC_CACHE_NAME = 'static-v1';
const STATIC_CACHE_TTL_MS = 864000 * 1000; // 10 天 (from config.js)

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/app.js',
  '/js/bias-viz.js',
  '/js/model-manager.js',
  '/fonts/NotoSansTC-Regular.woff2',
  '/icons/icon-192x192.png'
];

// 安裝時預快取核心資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Cache-First: 先找快取,沒有才發網路請求
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    const cachedTime = cached.headers.get('x-cache-time');
    const age = Date.now() - Number(cachedTime || 0);
    if (age < STATIC_CACHE_TTL_MS) {
      return cached;
    }
  }
  // 快取過期或不存在,從網路取得
  const response = await fetch(request);
  if (response.ok) {
    const cloned = response.clone();
    const headers = new Headers(cloned.headers);
    headers.set('x-cache-time', String(Date.now()));
    const cachedResponse = new Response(await cloned.blob(), { headers });
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, cachedResponse);
  }
  return response;
}
```

### 2.3 Network-First 策略 (API 請求)

**適用範圍**: 所有 `/api/*` 端點
**Fallback**: 網路失敗時從 IndexedDB 讀取離線資料

```javascript
// Network-First: 先嘗試網路,失敗則讀 IndexedDB
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // 成功時同步寫入 IndexedDB 作為離線備份
      const data = await response.clone().json();
      await syncToIndexedDB(request.url, data);
    }
    return response;
  } catch (error) {
    // 網路失敗,從 IndexedDB 讀取
    const offlineData = await readFromIndexedDB(request.url);
    if (offlineData) {
      return new Response(JSON.stringify(offlineData), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }
    // IndexedDB 也沒有,回傳離線提示
    return new Response(
      JSON.stringify({ error: '目前處於離線模式,暫無可用資料' }),
      { headers: { 'Content-Type': 'application/json' }, status: 503 }
    );
  }
}
```

### 2.4 Background Sync (離線同步)

**適用範圍**: 使用者在離線時提交的分析結果和投票

```javascript
// 註冊 Background Sync
async function queueOfflineSubmission(data) {
  const db = await openIndexedDB();
  const tx = db.transaction('pending_sync', 'readwrite');
  tx.objectStore('pending_sync').add({
    id: crypto.randomUUID(),
    type: data.type, // 'analysis' | 'vote'
    payload: data.payload,
    created_at: new Date().toISOString(),
    retry_count: 0
  });
  await tx.done;

  // 請求背景同步
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('submit-pending');
  }
}

// sw.js - 處理 Background Sync 事件
self.addEventListener('sync', (event) => {
  if (event.tag === 'submit-pending') {
    event.waitUntil(flushPendingSubmissions());
  }
});

async function flushPendingSubmissions() {
  const db = await openIndexedDB();
  const tx = db.transaction('pending_sync', 'readonly');
  const items = await tx.objectStore('pending_sync').getAll();

  for (const item of items) {
    // 超過重試上限,跳過 (由 recoverFailedSyncItems 處理)
    if (item.retry_count >= MAX_SYNC_RETRIES) {
      continue;
    }
    try {
      const endpoint = item.type === 'analysis'
        ? '/api/analysis/submit'
        : '/api/vote/submit';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      if (res.ok) {
        const delTx = db.transaction('pending_sync', 'readwrite');
        delTx.objectStore('pending_sync').delete(item.id);
        await delTx.done;
      }
    } catch (err) {
      console.error(`Background sync failed for ${item.id}:`, err);
      // 增加重試計數
      const retryTx = db.transaction('pending_sync', 'readwrite');
      const store = retryTx.objectStore('pending_sync');
      const existing = await store.get(item.id);
      if (existing) {
        store.put({ ...existing, retry_count: (existing.retry_count || 0) + 1 });
      }
      await retryTx.done;
    }
  }
}

// 啟動時檢查超過重試上限的項目 (UX Gap M4)
const MAX_SYNC_RETRIES = 5;

async function recoverFailedSyncItems() {
  const db = await openIndexedDB();
  const tx = db.transaction('pending_sync', 'readonly');
  const items = await tx.objectStore('pending_sync').getAll();
  const failedItems = items.filter(item => item.retry_count >= MAX_SYNC_RETRIES);

  if (failedItems.length > 0) {
    // 顯示持久 toast,讓使用者手動重試或捨棄
    showPersistentToast({
      message: `${failedItems.length} 筆資料同步失敗`,
      actions: [
        { label: '重新提交', handler: () => retryFailedItems(failedItems) },
        { label: '捨棄', handler: () => discardFailedItems(failedItems) }
      ]
    });
  }
}

// App 啟動時執行
recoverFailedSyncItems();
```

### 2.5 Service Worker 路由決策

```javascript
// sw.js - fetch 事件路由
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 請求 → Network-First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 靜態資源 → Cache-First
  event.respondWith(cacheFirst(event.request));
});
```

---

## 3. IndexedDB 結構

### 3.1 資料庫總覽

| 設定 | 值 | 來源 |
|------|-----|------|
| 資料庫名稱 | `TaiwanNewsBias` | `shared/config.js` FRONTEND.INDEXEDDB_NAME |
| 版本 | `1` | `shared/config.js` FRONTEND.INDEXEDDB_VERSION |
| 快取天數 | `10` 天 | `shared/config.js` FRONTEND.INDEXEDDB_CACHE_DAYS |
| 持久儲存 | `true` | `shared/config.js` FRONTEND.STORAGE_PERSIST |

### 3.2 Object Stores 定義

```javascript
// db.js - IndexedDB 初始化
const DB_NAME = 'TaiwanNewsBias';   // from config.js
const DB_VERSION = 1;                // from config.js

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store 1: articles (新聞文章快取)
      if (!db.objectStoreNames.contains('articles')) {
        const articleStore = db.createObjectStore('articles', {
          keyPath: 'article_hash'
        });
        articleStore.createIndex('by_source', 'source', { unique: false });
        articleStore.createIndex('by_status', 'status', { unique: false });
        articleStore.createIndex('by_published', 'published_at', { unique: false });
        articleStore.createIndex('by_cached_at', 'cached_at', { unique: false });
      }

      // Store 2: user_analyses (使用者本地分析結果)
      if (!db.objectStoreNames.contains('user_analyses')) {
        const analysisStore = db.createObjectStore('user_analyses', {
          keyPath: 'id',
          autoIncrement: true
        });
        analysisStore.createIndex('by_article', 'article_hash', { unique: false });
        analysisStore.createIndex('by_synced', 'synced', { unique: false });
        analysisStore.createIndex('by_created', 'created_at', { unique: false });
      }

      // Store 3: cached_results (API 回應快取)
      if (!db.objectStoreNames.contains('cached_results')) {
        const cacheStore = db.createObjectStore('cached_results', {
          keyPath: 'cache_key'
        });
        cacheStore.createIndex('by_cached_at', 'cached_at', { unique: false });
      }

      // Store 4: pending_sync (離線待同步佇列)
      if (!db.objectStoreNames.contains('pending_sync')) {
        const syncStore = db.createObjectStore('pending_sync', {
          keyPath: 'id'
        });
        syncStore.createIndex('by_type', 'type', { unique: false });
        syncStore.createIndex('by_created', 'created_at', { unique: false });
      }

      // Store 5: model_files (本地模型檔案, OPFS fallback)
      if (!db.objectStoreNames.contains('model_files')) {
        const modelStore = db.createObjectStore('model_files', {
          keyPath: 'key'
        });
        modelStore.createIndex('by_stored_at', 'stored_at', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

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
  "model_version": "Qwen/Qwen3.5-4B",   // Must match config.js MODELS.QWEN
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

```javascript
const CACHE_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 10 天 (from config.js)

async function cleanExpiredCache() {
  const db = await openDB();
  const now = Date.now();

  // 清理過期 articles
  const articleTx = db.transaction('articles', 'readwrite');
  const articleIndex = articleTx.objectStore('articles').index('by_cached_at');
  let cursor = await articleIndex.openCursor();
  while (cursor) {
    const age = now - new Date(cursor.value.cached_at).getTime();
    if (age > CACHE_TTL_MS) {
      cursor.delete();
    }
    cursor = await cursor.continue();
  }

  // 清理過期 cached_results
  const cacheTx = db.transaction('cached_results', 'readwrite');
  const cacheIndex = cacheTx.objectStore('cached_results').index('by_cached_at');
  cursor = await cacheIndex.openCursor();
  while (cursor) {
    const age = now - new Date(cursor.value.cached_at).getTime();
    if (age > CACHE_TTL_MS) {
      cursor.delete();
    }
    cursor = await cursor.continue();
  }
}

// App 啟動時清理一次
cleanExpiredCache();
```

### 3.5 持久儲存 (Persistent Storage)

```javascript
// 請求持久儲存權限,避免瀏覽器自動清理 IndexedDB
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    if (granted) {
      console.log('Persistent storage granted');
    } else {
      console.warn('Persistent storage denied - data may be evicted by browser');
    }
  }
}

// App 啟動時請求
requestPersistentStorage();
```

---

## 4. 頁面架構

### 4.1 頁面總覽

| 頁面 | 路由 | 說明 | 資料來源 |
|------|------|------|---------|
| Home | `/` | 今日熱門新聞,依爭議程度排序 | API: `/api/articles/trending` |
| Article Detail | `/article/:hash` | 單篇新聞的立場視覺化分析 | API: `/api/articles/:hash` |
| Analysis | `/analyze/:hash` | Qwen 本地分析表單 | 本地推理 + API 提交 |
| Profile | `/profile` | 使用者點數、貢獻歷史 | API: `/api/user/points` |
| Compare | `/compare` | 跨媒體同主題報導比較 | API: `/api/articles/compare` |
| Settings | `/settings` | 模型管理、通知、語言 | 本地 IndexedDB |

### 4.2 Home 頁面 (今日熱門)

```
+------------------------------------------+
|  台灣新聞立場分析          [搜尋] [設定]  |
+------------------------------------------+
|  今日熱門新聞              2026年3月6日    |
+------------------------------------------+
|  [極高爭議]                                |
|  文章標題 A                                |
|  ●━━━━━━━━━●━━━━━━━━━●                    |
|  泛綠      中立      泛藍                  |
|  自由時報 vs 聯合報 vs 中央社              |
|  來源: 3 家媒體 | 分析: 128 人            |
+------------------------------------------+
|  [高度爭議]                                |
|  文章標題 B                                |
|  ... (同上結構)                            |
+------------------------------------------+
|  [更多新聞 ▼]                              |
+------------------------------------------+
|  🏠首頁  📊比較  📱分析  👤我的           |
+------------------------------------------+
```

**功能要點**:
- 預設依爭議程度 (controversy_score) 降序排列
- 每篇新聞顯示立場光譜條 (bias spectrum bar)
- 顯示已參與分析的媒體來源數量與人數
- 支援無限捲動 (infinite scroll),每次載入 20 篇
- 離線時顯示 IndexedDB 快取的最後一批資料
- **72h 分析截止指示器**:
  - 文章卡片顯示剩餘可分析時間
  - 最後 12 小時: 顯示醒目倒數計時 (紅色文字)
  - 已截止文章: 「分析」按鈕禁用,顯示「已截止」badge

### 4.3 Article Detail 頁面 (立場視覺化)

```
+------------------------------------------+
|  [←返回]  文章詳細          [分享] [分析]  |
+------------------------------------------+
|  文章標題                                  |
|  來源: 自由時報 | 2026年3月6日 14:30       |
+------------------------------------------+
|  立場分析                                  |
|  ●━━━━━━━●━━━━━━━━━━●                     |
|  偏左 (35)                                 |
|  信賴區間: 30-40                           |
+------------------------------------------+
|  爭議程度: ████████░░ 高度爭議 (72)        |
+------------------------------------------+
|  跨媒體比較                                |
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

**功能要點**:
- 立場光譜條使用 THEME_COLORS (blue→gray→red)
- 爭議程度使用火焰漸變色 (green→yellow→orange→red)
- 跨媒體比較列出所有報導同一事件的媒體立場
- 原文連結開啟外部瀏覽器,不在 App 內載入
- **72h 分析截止指示器**:
  - 顯示文章剩餘可分析時間 (距離發布 72 小時)
  - 最後 12 小時: 「我要分析」按鈕旁顯示紅色倒數
  - 已截止: 「我要分析」按鈕替換為「已截止」(disabled),badge 顯示「已截止」

### 4.4 Analysis 頁面 (Qwen 分析表單)

**功能要點**:
- 本地 Qwen3.5-4B 執行推理 (詳見第 5 節 模型管理)
- 顯示即時推理進度 (正在組裝提示詞... / AI 分析中... / 產生結果...)
- 推理模式: think=false, t=0.5 (決策 #004)
- 結果預覽後使用者確認提交
- 離線時暫存至 `pending_sync` Store,上線後自動提交
- **Cooldown UI (來自 T05 獎金系統)**:
  - 使用者處於冷卻期時,分析按鈕顯示為禁用狀態 (disabled + 灰色)
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

### 4.6 Compare 頁面 (跨媒體比較)

**功能要點**:
- 選擇主題/事件,列出所有報導此事件的媒體
- 並排顯示各媒體立場分數
- 雷達圖顯示各面向差異
- 支援分享比較結果圖片

### 4.7 Settings 頁面

**功能要點**:
- 模型管理: 下載/刪除 Qwen 模型,顯示儲存空間使用量
- 通知設定: Push notification 開關
- 快取管理: 查看 IndexedDB 用量,手動清理
- 關於: 版本、開源授權 (AGPL-3.0)、隱私政策連結

### 4.8 Login Flow (登入流程)

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

### 4.9 Onboarding (首次使用引導)

**觸發條件**: IndexedDB 中無 `onboarding_completed` flag 時,首次訪問自動顯示

**步驟 (3-5 步 Carousel)**:

| 步驟 | 標題 | 說明 |
|------|------|------|
| 1 | 歡迎使用 | App 目的: 公民算力分析新聞立場,讓資訊更透明 |
| 2 | 立場光譜 | 說明偏綠←→偏藍的光譜概念,以及中立的定義 |
| 3 | 本地 AI 分析 | 說明分析在使用者裝置上本地執行 (Qwen3.5-4B),資料不外傳 |
| 4 | 開始使用 | 邀請進行第一次分析,或選擇「先瀏覽看看」跳過 |

**完成後**:
- 寫入 IndexedDB flag: `{ key: 'onboarding_completed', value: true, completed_at: ISO_STRING }`
- 不再顯示引導畫面 (可在 Settings 頁面重新觸發)

---

## 5. 本地模型管理

### 5.1 模型資訊

| 項目 | 值 | 來源 |
|------|-----|------|
| 模型 | Qwen3.5-4B | `shared/config.js` MODELS.QWEN |
| 版本 | 3.5.2 | `shared/config.js` MODELS.QWEN_VERSION |
| 推理模式 | think=false, t=0.5 (決策 #004) | `shared/config.js` MODELS.QWEN_MODE |
| 檔案大小 | ~3.4 GB | `shared/config.js` MODELS.QWEN_SIZE_MB |
| 儲存位置 | IndexedDB 或 OPFS (Origin Private File System) |
| 推理引擎 | WebGPU (優先) / WASM (fallback) / Server (最終 fallback) |

### 5.2 下載條件檢查

必須**同時滿足**以下三個條件才允許下載:

```javascript
// model-manager.js - 下載前置條件檢查
async function canDownloadModel() {
  const checks = {
    wifi: false,
    battery: false,
    charging: false
  };

  // 條件 1: WiFi 連線 (from config.js FRONTEND.DOWNLOAD_WIFI_ONLY)
  if ('connection' in navigator) {
    const conn = navigator.connection;
    checks.wifi = (conn.type === 'wifi' || conn.effectiveType === '4g');
  } else {
    // 無法偵測連線類型時,允許下載但顯示警告
    checks.wifi = true;
  }

  // 條件 2: 電量 > 20% (from config.js FRONTEND.DOWNLOAD_MIN_BATTERY_PCT)
  if ('getBattery' in navigator) {
    const battery = await navigator.getBattery();
    checks.battery = (battery.level * 100) > 20;
    checks.charging = battery.charging;
  } else {
    // 桌面瀏覽器通常無 Battery API,視為條件通過
    checks.battery = true;
    checks.charging = true;
  }

  // 條件 3: 充電中 (from config.js FRONTEND.DOWNLOAD_REQUIRE_CHARGING)
  // checks.charging 已在上方設定

  return {
    canDownload: checks.wifi && checks.battery && checks.charging,
    checks
  };
}
```

**當條件不滿足時的 UI 提示**:

| 條件 | 未滿足時的提示 |
|------|--------------|
| 非 WiFi | `請連接 WiFi 後再下載模型 (約 3.4 GB)` |
| 電量 < 20% | `電量不足 20%,請充電後再下載` |
| 未充電 | `請接上充電器後再下載模型` |

### 5.3 下載進度 UI

```
+------------------------------------------+
|  模型下載                                  |
+------------------------------------------+
|  Qwen3.5-4B (think=false, t=0.5)          |
|  版本: v3.5.2 | 大小: 3.4 GB              |
+------------------------------------------+
|  下載進度                                  |
|  ████████████████░░░░░░░░  68%            |
|  已下載: 2.31 GB / 3.40 GB                |
|  預估剩餘: 約 3 分鐘                       |
+------------------------------------------+
|  [暫停下載]                                |
+------------------------------------------+
|  WiFi: 已連接                              |
|  電量: 75% (充電中)                        |
+------------------------------------------+
```

**下載中斷處理**:
- 支援斷點續傳 (Range Request)
- 網路中斷時自動暫停,恢復後自動續傳
- 下載中切換至行動網路時自動暫停並提示

### 5.4 推理引擎 Fallback 鏈

```
WebGPU (最佳效能, think=false, t=0.5)
  ↓ 不支援或初始化失敗
WASM (通用相容, think=false, t=0.5)
  ↓ 模型未下載或 WASM 失敗或超時 (30s)
Server Fallback (Cloudflare Workers AI)
```

**推理進度動畫 (UX Gap M2)**:
- 階段 1: 「正在組裝提示詞...」 (組裝 3 層 Prompt)
- 階段 2: 「AI 分析中...」 (模型推理進行中)
- 階段 3: 「產生結果...」 (解析 JSON 輸出)
- >10 秒: 顯示舒緩訊息「分析較複雜的文章需要較長時間」
- >30 秒: 顯示「切換至伺服器模式」按鈕,允許使用者手動 fallback

```javascript
// inference-engine.js - Fallback 鏈
const INFERENCE_TIMEOUT_MS = 30000; // 30s (from config.js)

async function runInference(articleText) {
  // 嘗試 1: WebGPU
  if ('gpu' in navigator) {
    try {
      const result = await Promise.race([
        runWebGPUInference(articleText),
        rejectAfterTimeout(INFERENCE_TIMEOUT_MS)
      ]);
      return { ...result, inference_mode: 'webgpu' };
    } catch (err) {
      console.warn('WebGPU inference failed, falling back to WASM:', err);
    }
  }

  // 嘗試 2: WASM
  if (await isModelDownloaded()) {
    try {
      const result = await Promise.race([
        runWASMInference(articleText),
        rejectAfterTimeout(INFERENCE_TIMEOUT_MS)
      ]);
      return { ...result, inference_mode: 'wasm' };
    } catch (err) {
      console.warn('WASM inference failed, falling back to server:', err);
    }
  }

  // 嘗試 3: Server Fallback
  try {
    const result = await runServerInference(articleText);
    return { ...result, inference_mode: 'server' };
  } catch (err) {
    // 全部失敗
    throw new Error('系統錯誤,請稍後再試'); // from config.js FRONTEND.ERROR_MESSAGE_GENERIC
  }
}

function rejectAfterTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Inference timeout')), ms)
  );
}
```

### 5.5 模型儲存策略

**優先使用 OPFS (Origin Private File System)**:
- 效能優於 IndexedDB 處理大型二進位檔案
- 不受瀏覽器自動清理 (搭配 `navigator.storage.persist()`)

```javascript
async function storeModelFile(modelBlob) {
  // 優先: OPFS
  if ('getDirectory' in navigator.storage) {
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle('qwen3.5-4b.bin', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(modelBlob);
      await writable.close();
      return 'opfs';
    } catch (err) {
      console.warn('OPFS storage failed, falling back to IndexedDB:', err);
    }
  }

  // Fallback: IndexedDB
  const db = await openDB();
  const tx = db.transaction('model_files', 'readwrite');
  tx.objectStore('model_files').put({
    key: 'qwen3.5-4b',
    blob: modelBlob,
    version: '3.5.2',
    stored_at: new Date().toISOString()
  });
  await tx.done;
  return 'indexeddb';
}
```

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

```javascript
// 網路狀態監聽
window.addEventListener('online', () => {
  document.getElementById('offline-banner').hidden = true;
  // 觸發 Background Sync
  navigator.serviceWorker.ready.then((reg) => {
    reg.sync.register('submit-pending');
  });
});

window.addEventListener('offline', () => {
  document.getElementById('offline-banner').hidden = false;
});
```

離線 Banner 文字: `目前處於離線模式 - 已快取的內容仍可瀏覽,分析結果將於上線後自動提交`

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
  connect-src 'self' https://*.workers.dev;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

**CSP 重點**:
- `wasm-unsafe-eval` 允許 WASM 模型推理
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

### Mistake 2: 未檢查電量/WiFi 就下載模型

```javascript
// WRONG: 直接開始下載
await downloadModel();

// CORRECT: 先檢查條件
const { canDownload, checks } = await canDownloadModel();
if (!canDownload) {
  showDownloadBlockedUI(checks);
  return;
}
await downloadModel();
```

**教訓**: 3.4 GB 模型在行動網路下載會消耗大量流量,低電量下載可能導致中斷。

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

---

**重要提醒**:
修改此文件前,必須:
1. 提 GitHub PR 討論
2. 通知下游團隊 (T07 部署)
3. 更新 MASTER_ROADMAP.md 決策紀錄
4. 確認 `shared/config.js` FRONTEND 區塊一致

---

**文件維護者**: T04 (Frontend Experience Team)
**最後更新**: 2026-03-07
**下次審查**: 階段 4 結束時
