# 前端重構補充計畫 (3 項)

**日期**: 2026-03-10
**基於**: V2_ARCHITECTURE_BLUEPRINT.md
**約束**: 摘要/結論隱藏 (法律), 功能導向, 接後端 API

---

## 現況盤點

### 後端已有但前端未接的 API

| API | Handler | 前端狀態 |
|-----|---------|---------|
| `GET /events` | events.js | api.js 有 `fetchEvents()` — **無頁面** |
| `GET /events/:cluster_id` | events.js | api.js 有 `fetchEventDetail()` — **無頁面** |
| `POST /analyses/:id/feedback` | analysis-feedback.js | **無 UI** |
| `GET /analyses/:id/feedback/stats` | analysis-feedback.js | **無 UI** |
| `GET /articles/:id/knowledge` | knowledge.js | api.js 有 `fetchArticleKnowledge()` — **未顯示** |

### 前端已接但可強化

| 功能 | 現況 | 缺口 |
|------|------|------|
| 搜尋 | home.js 有搜尋列, 呼叫 `searchArticles()` | 無日期/來源篩選 |
| 文章回饋 | article-detail.js 有 like/dislike | 無回饋統計圖 |
| 來源透明度 | source-detail.js 存在 | 無趨勢圖 |
| 跨媒體比較 | compare.js 用 cluster API | 無事件入口 |

---

## 補充一: 事件聚合系統

### 問題
首頁仍是扁平文章列表。使用者無法看到「同一事件不同媒體怎麼報」，
這是三個「啊哈時刻」的核心。

### 方案

```
新建檔案:
├── js/pages/events.js          (~200 行)  事件列表頁
├── js/pages/event-detail.js    (~250 行)  事件詳情頁
├── js/components/event-card.js (~120 行)  事件卡片元件
└── css/events.css              (~100 行)  事件樣式
```

### 功能規格

**事件列表頁 `#/events`**
- 呼叫 `fetchEvents({ page, limit: 20 })`
- 每張卡片顯示:
  - 代表標題 (第一篇文章標題)
  - 三色分布條 (camp_distribution: green/white/blue)
  - 來源數量 badge
  - 盲區標記 (若有)
  - 最近更新時間
- 無限滾動分頁
- 類別篩選 (政治/社會/國際/兩岸)

**事件詳情頁 `#/event/:cluster_id`**
- 呼叫 `fetchEventDetail(clusterId)`
- 頂部: 三色分布條 (大尺寸)
- 文章列表 (按來源分組):
  - 來源名 + 陣營色點
  - 標題 (連結到 `#/article/:id`)
  - ~~摘要~~ (隱藏，法律)
  - 發布時間
  - 分析狀態 (已分析/待分析)
- 底部: 「比較此事件」按鈕 → 帶參數跳轉 compare

**首頁整合**
- home.js 新增 tab 切換: [文章] [事件]
- 預設顯示事件 (tab=events)
- 切換不重新渲染底部導航

### 路由變更

```javascript
// app.js 新增
'#/events':           renderEvents,
'#/event/{id}':       renderEventDetail,
```

### 底部導航調整

```
現有 6-tab: [首頁] [盲區] [比較] [分析] [我的] [設定]
建議 5-tab: [首頁] [盲區] [比較] [我的] [設定]
```
- 合併「分析」到文章詳情頁 (已有「分析此文章」按鈕)
- 減少 tab 數降低認知負荷

---

## 補充二: 分析回饋 + 知識透明面板

### 問題
1. 使用者提交分析後，無法知道其他人是否認同 → 無社群信號
2. AI 分析使用的 RAG 知識不透明 → 無法建立信任

### 方案

```
修改檔案:
├── js/pages/article-detail.js   +100 行  回饋UI + 知識面板
├── js/pages/article-panels.js   +150 行  面板渲染邏輯
├── css/article.css              +80 行   面板樣式
└── js/api.js                    +20 行   新 API 呼叫
```

### 功能規格

**分析回饋 (每筆分析結果下方)**
- 呼叫 `GET /analyses/:id/feedback/stats` 取得統計
- 顯示: [有幫助 👍 N] [沒幫助 👎 M]
- 使用者點擊 → `POST /analyses/:id/feedback` (type: helpful/unhelpful)
- 每人每筆分析限一次
- localStorage 記錄已投票 analysis_id

**知識透明面板 (文章詳情頁折疊區塊)**
- 呼叫 `fetchArticleKnowledge(articleId)`
- 折疊標題: 「AI 分析參考資料 (N 條)」
- 展開後每條顯示:
  - 知識類別 (人物/媒體/議題/名詞/事件)
  - 知識標題
  - ~~內容~~ (隱藏，法律)
  - 相關度分數 (similarity_score 百分比)
- 無知識時: 「此文章無額外背景知識注入」
- 設計意圖: 讓使用者知道 AI「看了什麼」才做出判斷

### API 呼叫新增

```javascript
// api.js
export async function submitAnalysisFeedback(analysisId, type, token) {
  // POST /api/v1/analyses/{analysisId}/feedback
  // body: { type: 'helpful' | 'unhelpful' }
}

export async function fetchAnalysisFeedbackStats(analysisId) {
  // GET /api/v1/analyses/{analysisId}/feedback/stats
}
```

---

## 補充三: 搜尋強化 + 來源趨勢圖

### 問題
1. 搜尋只能關鍵字，無法按時間/來源篩選
2. 來源透明度頁面沒有歷史趨勢 → 無法看出媒體立場是否漂移

### 方案

```
修改檔案:
├── js/pages/home.js             +60 行   進階篩選 UI
├── js/pages/source-detail.js    +100 行  趨勢圖
├── css/main.css                 +40 行   篩選樣式
└── css/source.css (新建)        ~60 行   來源頁樣式
```

### 功能規格

**搜尋進階篩選 (home.js 搜尋列下方)**
- 展開式篩選面板 (預設收合):
  - 日期範圍: [最近7天] [最近30天] [自訂]
  - 來源篩選: checkbox 多選 (聯合/自由/中時/TVBS/...)
  - 陣營篩選: [全部] [泛綠] [泛白] [泛藍]
- 篩選參數附加到 `searchArticles()` query string
- 注意: 後端目前只支援 `?q=keyword&page=N&limit=N`
  - 日期/來源篩選需後端配合 (先前端 filter，後端排序)
  - 或 Phase 2 擴充後端 search handler

**來源趨勢圖 (source-detail.js)**
- 呼叫 `fetchSource(sourceName)` 取得 tendency 資料
- Canvas 折線圖 (200x120px):
  - X 軸: 月份 (近 6 個月)
  - Y 軸: 陣營比例 (green%/white%/blue%)
  - 三條折線 (綠/灰/藍)
- 數據來源: `source_tendency` 表的 `month_data` JSON
- 無歷史數據時: 顯示單月數據柱狀圖

**來源列表頁強化**
- 排序選項: [預設] [偏綠→偏藍] [偏藍→偏綠] [文章數]
- 每個來源卡片: 來源名 + mini 三色條 + 文章數

---

## 實作順序

```
補充一 (事件聚合) → 補充二 (回饋+知識) → 補充三 (搜尋+來源)

理由:
- 事件聚合是核心 UX 差異化 (Ground News 等級)
- 回饋系統建立社群信號回路
- 搜尋強化和來源趨勢是進階功能
```

## 工作量估計

| 項目 | 新建 | 修改 | 估計行數 |
|------|------|------|---------|
| 補充一 | 4 檔 | 2 檔 | ~670 行 |
| 補充二 | 0 檔 | 4 檔 | ~350 行 |
| 補充三 | 1 檔 | 3 檔 | ~260 行 |
| **合計** | **5 檔** | **9 檔** | **~1280 行** |

## 前置條件

- [x] 後端 events API 已部署 (GET /events + GET /events/:cluster_id)
- [x] 後端 analysis-feedback API 已部署
- [x] 後端 knowledge API 已部署
- [x] 後端 search API 已修復 (status filter removed)
- [x] 後端 sources API 已部署
- [ ] D1 source_tendency 表需有歷史月度數據 (cron 累積)
