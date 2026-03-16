# PowerReader v2.0 — 前端架構設計藍圖

**產出日期**: 2026-03-09
**參與者**: 前端設計師、UI 設計師、資料結構師、應用功能思考師
**狀態**: 待負責人審核

---

## 一、設計哲學

> 「分析結果是文章的一部分，不是工具」— 使用者打開文章即自動觸發，不需按按鈕。
> 「使用者是參與者，不是用戶」— 公民算力品牌定位。

### MVP 三個「啊哈時刻」
1. **三色分布條** — 「原來報導不是中立的」
2. **新聞盲點** — 「原來這件事只有一邊在報」
3. **AI 分析參考** — 「原來 AI 是這樣判斷的」


開發者要求:競爭對像是傳統RSS功能/或是新功能的實踐

--
補充:應該也包含了參與的感覺，一人算出，全網共享

### 體驗順序
先震撼（盲區）→ 再參與（貢獻）→ 最後反思（偏見）

---

## 二、頁面路由表

### v2.0 最終路由表

```
app.js routes = {
  '/':                renderHome,              // 事件聚合首頁
  '/event':           renderEventDetail,       // /event/:cluster_id
  '/article':         renderArticle,           // /article/:hash (含 Mode A 自動分析)
  '/blindspot':       renderBlindspot,         // 報導盲區
  '/compare':         renderCompare,           // 事件導向跨媒體比較
  '/source':          renderSourceTransparency, // /source/:source_key
  '/profile':         renderProfile,           // 個人 + 點數 + 開發者 + 贊助
  '/profile/bias':    renderReadingBias,       // 閱讀偏見 (Phase 3)
  '/settings':        renderSettings,          // 設定 + Email 訂閱
  '/onboarding':      renderOnboarding,        // WebGPU 引導 + 知情同意
  '/auth/callback':   handleAuthCallback       // Google OAuth
}
```

### 路由變更摘要

| 變更 | 路由 | 說明 |
|------|------|------|
| **新增** | `#/event/:cluster_id` | 事件三營陣分布 + 來源光譜 + 文章列表 |
| **新增** | `#/blindspot` | 報導盲區事件列表 |
| **新增** | `#/source/:source` | 來源傾向分析 + 月度趨勢 |
| **新增** | `#/profile/bias` | 個人閱讀偏見三色餅圖 (Phase 3) |
| **重寫** | `#/` | 文章列表 → 事件聚合卡片 |
| **大改** | `#/article/:hash` | +三軸雷達圖 +三方標題 +AI分析 +知識庫 +時間軸 +透明度面板 +進度條 |
| **大改** | `#/compare` | 改為事件導向比較 + camp-bar + blindspot 提示 |
| **刪除** | `#/analyze`, `#/analyze/:hash` | Mode A — 分析整合進 article-detail |

### 底部導航 (5-tab)

```
v1.0: [首頁] [比較] [分析] [個人] [設定]
v2.0: [首頁] [立場分布] [影響力] [文件] [個人設定]
```

---

## 三、元件清單

### 現有元件（保留）

| 元件 | 檔案 | 改動 |
|------|------|------|
| `createArticleCard()` | `components/article-card.js` | 改用於 event-detail 內 |
| `createBiasBar()` | `components/bias-bar.js` | 保留，用於文章級 |
| `createControversyBadge()` | `components/controversy-badge.js` | 保留 |

### 新增元件

| 元件 | 檔案 | 用途 | Phase |
|------|------|------|-------|
| `createCampBar()` | `components/camp-bar.js` | 三色分布條 (綠/白/藍) | 1 |
| `createCampBadge()` | `components/camp-badge.js` | 營陣徽章 (色點+文字) | 1 |
| `createRadarChart()` | `components/radar-chart.js` | 三軸雷達圖 (Canvas) | 1 |
| `createEventCard()` | `components/event-card.js` | 事件卡片 (三色條+來源數+盲區badge) | 1 |
| `createBlindspotBadge()` | `components/blindspot-badge.js` | 盲區標記 | 1 |
| `createTimeline()` | `components/timeline.js` | 水平時間軸 | 1 |
| `createKeywordPills()` | `components/keyword-pills.js` | 關鍵字標籤 | 1 |
| `createTransparencyPanel()` | `components/transparency-panel.js` | 分析透明度面板 | 1 |
| `createProgressBar()` | `components/progress-bar.js` | 推理進度條 (sticky bottom) | 2 |
| `createToast()` | `components/toast.js` | Toast 通知 | 2 |
| `createPieChart()` | `components/pie-chart.js` | 三色餅圖 (Canvas) | 3 |

### 工具函式（新增）

| 函式 | 檔案 | 用途 |
|------|------|------|
| `getCampFromScore()` | 已在 `shared/enums.js` | bias_score → camp + weights |
| `getWhiteAxisValue()` | 已在 `shared/enums.js` | 泛白軸數值 |
| `detectBlindspot()` | 已在 `shared/enums.js` | 盲區偵測 |
| `computeConsensus()` | `utils/camp.js` (新增) | 共識度計算 |

---

## 四、視覺系統 (CSS Token)

### 報紙式低飽和色調

```css
:root {
  /* 報紙式背景 */
  --color-bg-paper: #FAFAF8;         /* 微暖白 */
  --color-bg-card: #FFFFFF;
  --color-border-subtle: #E8E8E4;
  --color-text-ink: #2C2C2A;         /* 深灰 (非純黑) */
  --color-text-muted: #767672;       /* 修正: 對比度 4.6:1 (原 #8A8A86 不達標) */

  /* 三營陣色彩 */
  --camp-green: #2E7D32;             /* 泛綠 */
  --camp-white: #757575;             /* 泛白 */
  --camp-blue: #1565C0;              /* 泛藍 */
  --camp-insufficient: #BDBDBD;      /* 資料不足 */

  /* 三營陣淡色背景 */
  --camp-green-bg: #E8F5E9;
  --camp-white-bg: #F5F5F5;
  --camp-blue-bg: #E3F2FD;

  /* 盲區警示 */
  --blindspot-critical: #D32F2F;
  --blindspot-warning: #F57C00;

  /* 進度條 */
  --progress-track: #E8E8E4;
  --progress-fill: #1A73E8;
  --progress-complete: #2E7D32;

  /* 獎勵 */
  --reward-gold: #F9A825;
  --reward-gold-bg: #FFF8E1;
  --badge-earned: #6366F1;
  --badge-locked: #BDBDBD;

  /* 贊助 */
  --subscriber-accent: #7B1FA2;
  --subscriber-bg: #F3E5F5;
}
```

### 三色分布條

- 高度 28px，圓角 8px
- 三段色帶，min-width 5% (避免窄段不可見)
- 百分比 < 15% 時數字移到下方
- WCAG: `role="img"` + `aria-label` 含三營百分比

### 營陣徽章 (色盲友善)

- 泛綠: ● 圓點
- 泛白: ◐ 半圓
- 泛藍: ■ 方塊

### 雷達圖

- Canvas 200x200px (retina 400x400)
- 三角形: 泛綠(上)、泛白(左下)、泛藍(右下)
- 半透明填充 (alpha 0.2) + 2px 邊框
- 3 層同心三角網格

---

## 五、Mode A 持續運算流程

### 自動分析流程

```
使用者打開 #/article/:hash
  │
  ├── [1] renderArticle() 渲染文章 (立即顯示)
  │     ↓ 同時 (non-blocking)
  ├── [2] checkAutoAnalyzeConditions()
  │     ├── 是否已登入? → 否 → 顯示「登入以啟用分析」
  │     ├── benchmark 結果? → 'none' → 顯示「瀏覽器不支援」
  │     ├── 此文章已有分析? → 是 → 顯示既有結果
  │     ├── 冷卻期中? → 是 → 顯示倒計時
  │     └── 全部通過 → 進入 [3]
  │
  ├── [3] 進度條 (文章底部, sticky)
  │     ├── 「正在組裝提示詞...」(~1s)
  │     └── 組裝 L1+L2+L3 Prompt
  │
  ├── [4] WebLLM 雙 Pass 推理
  │     ├── Pass 1: Score extraction → 「AI 分析中 (Pass 1/2)...」
  │     ├── engine.resetChat()
  │     ├── Pass 2: Narrative → 「AI 分析中 (Pass 2/2)...」
  │     └── ≥15s 顯示慢速提示; ≥60s 顯示舒緩訊息
  │
  ├── [5] 結果嵌入文章底部
  │     ├── 三軸雷達圖 + bias_score
  │     ├── AI 分析參考 (reasoning + 「僅供參考」)
  │     ├── Toast: 「分析完成 +1 · +1 代幣」(3s 淡出)
  │     └── 隱藏進度條
  │
  └── [6] 背景同步
        ├── 有網路 → POST /api/v1/analyses/submit
        └── 離線 → IndexedDB pending_sync → 上線自動同步
```

### 佇列管理 — 切換文章

- WebLLM 引擎是 **singleton**，同時只跑一篇
- 切換文章 → `engine.interruptGenerate()` 中止當前 → 開始新文章
- 返回已中止的文章 → 重新觸發 Mode A
- 離開文章頁 → 中止推理 + 清理 UI

### 進度條 UI

- 位置: `position: fixed; bottom: var(--bottom-nav-height)`
- 半透明背景 + backdrop-filter blur
- 可下拉隱藏 (transform: translateY)
- 完成後 CSS max-height 動畫展開分析結果(應該包含時間、hash不可竄改/數位憑證...這邊需要細節說明)

---

## 六、D1 Schema 缺口分析

### 立即修復 (BUG)

| # | 問題 | 嚴重度 | 修復 |
|---|------|--------|------|
| 1 | analysis.js INSERT **缺 analysis_duration_ms** | HIGH | 欄位存在但 INSERT 漏掉 |
| 2 | feed_category **缺 migration** | HIGH | 程式碼已用但沒 migration |
| 3 | single createArticle **缺 feed_category** | MED | batch 有但 single 沒有 |

### camp_ratio 核心設計決策 (待決定)

| 來源 | 欄位 | 說明 |
|------|------|------|
| 規則推導 | `articles.camp` + `articles.camp_weights` | 0005 設計: 從 bias_score 推導 |
| LLM 直接輸出 | **缺失** | Qwen Pass1 輸出 `camp_ratio: {green, white, blue, gray}` |

**問題**: 兩者是不同的值 — 規則推導 vs LLM 評估。需要決定用哪個或都存。

**建議**: `analyses` 表新增 `camp_ratio TEXT` (JSON)，儲存 LLM 原始輸出。

### 0005 Migration 修正建議

```sql
-- 追加到 0005_three_camp.sql:
ALTER TABLE analyses ADD COLUMN camp_ratio TEXT;
-- JSON: {"green": 45, "white": 20, "blue": 25, "gray": 10}

-- model_name DEFAULT 更新為實際模型:
-- DEFAULT 'Qwen3-8B-q4f16_1-MLC' (not 4B)

-- Email 驗證 token 表 (如果做 email):
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token TEXT PRIMARY KEY,
  user_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### API 端點缺失 (10 個)

| 端點 | 用途 | 優先度 |
|------|------|--------|
| `GET /api/v1/events` | 事件聚類列表 | **P1** |
| `GET /api/v1/events/:cluster_id` | 事件詳情 | **P1** |
| `GET /api/v1/blindspot/events` | 盲區事件 | **P1** |
| `GET /api/v1/sources` | 來源透明度列表 | **P1** |
| `GET /api/v1/sources/:source` | 來源詳情 | **P1** |
| `GET /api/v1/user/me/reading-bias` | 個人閱讀偏見 | P2 |
| `POST /api/v1/subscribe` | 訂閱管理 | P2 |
| `GET /api/v1/subscribe/status` | 訂閱狀態 | P2 |
| `POST /api/v1/articles/:id/feedback` | 文章回饋 | P2 |
| `GET /api/v1/articles/:id/feedback/stats` | 回饋統計 | P2 |

### 獎勵系統缺口

| 需求 | D1 | API | 觸發邏輯 |
|------|-----|-----|---------|
| 連勝 (user_streaks) | 0005 待部署 | **無端點** | **未實作** |
| 徽章 (user_badges) | 0005 待部署 | **無端點** | **未實作** |

**建議**: 在 analysis.js 的 createAnalysis 成功後加入 updateStreak + checkBadgeEligibility。

### 欄位已存在但功能未設計

| 欄位 | 表 | 問題 |
|------|-----|------|
| `embedding_status` | articles | 沒有程式碼更新它 |
| `consensus_reached` | articles | 沒有共識判定邏輯 |
| `daily_analysis_date` | users | analysis.js 沒有使用 |
| `knowledge_ids` | articles | 前端沒有使用 |

### deleteMe 缺失清除

auth.js deleteMe 只刪 analyses/sessions/users，0005 部署後需加:
reward_dedup, user_reading_history, user_streaks, user_badges, subscribers, article_feedback

---

## 七、功能價值矩陣

### 優先分級

| 序 | 功能 | 使用者價值 | Phase |
|----|------|-----------|-------|
| **P0** | 三色分布條 | 一眼看懂「這件事誰在報」 | 1 |
| **P0** | 新聞盲點 | 「原來只有一邊在報」— 最強啊哈時刻 | 1 |
| **P0** | AI 分析參考 | reasoning 原文 + 「僅供參考」 | 1 |
| **P1** | Mode A 自動分析 | 「讀完文章，分析就在了」 | 2 |
| **P1** | 進度條 + Toast | 知道 AI 正在工作 + 成就感 | 2 |
| **P1** | 三方標題聚合 | 降級版: 各營陣文章現有 summary | 1 |
| **P1** | 雷達圖 | 三軸同時呈現比單一分數豐富 | 1 |
| **P2** | 來源透明度 | 媒體長期偏向認知 | 2 |
| **P2** | 閱讀偏見 | 自我反思 — 最深層價值 | 3 |
| **P2** | 硬體偵測 | 技術前提 (已有 benchmark.js) | 2 |
| **P3** | 分享 | Web Share API (簡單) | 2 |
| **P3** | 回饋 | 改進 AI 品質的訊號 | 2 |

### 缺失功能建議

| # | 功能 | 建議 | Phase |
|---|------|------|-------|
| M3 | **搜尋** | D1 LIKE 查詢事件標題 | **Phase 1 (基本可用性)** |
| M9 | **教育頁面** | 「什麼是立場分析」靜態頁 | **Phase 1 (新手引導)** |
| M8 | **深色模式** | `@media (prefers-color-scheme: dark)` | Phase 2 |
| M4 | 收藏/稍後閱讀 | IndexedDB 本地 store | Phase 3 |
| M6 | 匿名排行榜 | hash 前綴 + 分析次數 + 品質分 | Phase 3 |
| M2 | 事件追蹤通知 | Push Notification | Phase 3 |

---

## 八、Email 通知策略

### Email 類型(一個月的重點紀錄、個人化的一些設置(每週推送))

| 類型 | 頻率 | 內容 | 語調 |
|------|------|------|------|
| **盲區警報** | 即時 (日最多 1 封) | 重大事件 + 嚴重盲區 + 三色條 | 好奇、邀請 |
| **每週摘要** | 週一早 8:00 | Top 3 爭議事件 + 閱讀偏見變化 + 貢獻次數 | 報告式、溫暖 |
| **里程碑** | 觸發式 | 累積 10/50/100 次分析 | 肯定、感謝 |
| **貢獻回饋** | 觸發式 (批次) | 分析被 N 人查看 | 影響力感知 |

### 不發送

- 「你有 N 篇未讀」— 不是新聞 App
- 「快來」等催促語言
- 每日摘要 — 太頻繁

### 頻率

- 免費: 僅盲區警報 (月 1-2 封)
- 訂閱者: 週報 + 盲區 + 里程碑 (月 5-8 封)
- Cloudflare Email Workers 免費 100 封/天 — MVP 綽綽有餘

### 資料結構: 功能不啟用 → 備註

Email 系統 D1 設計：
- `subscribers` 表: **0005 待部署** (有 email 欄位但沒驗證流程)
- `email_verification_tokens` 表: **完全缺失** → 需新增
- `notification_logs` 表: **完全缺失** → 需新增
- 實際 email 發送機制: **完全未設計** → 需 Cloudflare Email Workers 或第三方

**結論**: Email 功能 Phase 2 啟用，Phase 1 先設計 D1 表但 **功能不啟用**。

---

## 九、贊助 / 開發者頁面

### 贊助頁面架構 (Profile 底部)

```
1. 價值主張 (3 欄)
   [去中心化] 瀏覽器即分析引擎
   [完全透明] Prompt 也開源
   [公民驅動] 觀點由參與者共同揭示

2. 贊助等級
   公民贊助者: NT$50/月 ($1.5 USD)
   - 投票權加倍 + 每週偏見報告
   - 新功能搶先 24h + 贊助者徽章

3. 費用透明
   「月成本: Cloudflare ~$5/月」
   「你的贊助 100% 用於基礎設施」

4. 開源承諾
   AGPL-3.0 永遠開源 + GitHub 連結

5. 贊助者牆
   匿名: 「公民 a3f2...」hash 前綴
```

### 開發者頁面架構 (Settings 或獨立)

```
1. 技術架構概覽 + 架構圖
2. 快速開始 (本地開發 + API 文件)
3. 貢獻指南 (PR + Code Review)
4. 知識庫擴充指南 (JSON schema)
5. Prompt 開源 (L1/L2/L3 完整文字)
6. 路線圖 (連結 MASTER_ROADMAP.md)
```

---

## 十、知情同意設計

### 三層設計

**第一層: Onboarding Step 3 (進入即知情)**

```
標題: 「你的電腦是分析引擎」

PowerReader 使用你的瀏覽器 GPU 分析新聞立場：
- 首次下載 AI 模型 (~3.4GB，快取在瀏覽器)
- 閱讀文章時背景分析 (約 14 秒/篇)
- 會使用 GPU 資源 (不超過 80%)
- 結果匿名上傳

你隨時可在設定中暫停自動分析。

[我了解，開始偵測] [我想先瀏覽看看]
```

**第二層: 進度條 (持續可見)**
- 進度條旁顯示「正在使用你的 GPU 分析」
- Settings 增加「暫停自動分析」開關
- Settings 增加「僅 WiFi 時分析」(筆電電池保護)

**第三層: 透明度面板 (事後透明)**
- 已設計的分析透明度面板 — 使用者看到「我的 GPU 產出了什麼」

---

## 十一、實作階段

### Phase 1: 核心閱讀體驗 (A 級)

**新建 12 檔 + 修改 6 檔**

| 類型 | 檔案 | 行數 |
|------|------|------|
| 新建 | `components/camp-bar.js` | ~120 |
| 新建 | `components/camp-badge.js` | ~60 |
| 新建 | `components/radar-chart.js` | ~200 |
| 新建 | `components/event-card.js` | ~150 |
| 新建 | `components/blindspot-badge.js` | ~60 |
| 新建 | `components/timeline.js` | ~120 |
| 新建 | `components/keyword-pills.js` | ~50 |
| 新建 | `components/transparency-panel.js` | ~200 |
| 新建 | `utils/camp.js` | ~100 |
| 新建 | `pages/event-detail.js` | ~250 |
| 新建 | `pages/blindspot.js` | ~180 |
| 新建 | `pages/source-transparency.js` | ~250 |
| 修改 | `app.js` | +3 路由 + 正則 |
| 修改 | `pages/home.js` | 重寫: 事件聚合卡片 |
| 修改 | `pages/article-detail.js` | +雷達圖+三方標題+AI分析+透明度 |
| 修改 | `pages/compare.js` | 事件導向比較 |
| 修改 | `api.js` | +fetchEvents, fetchBlindspot, fetchSource |
| 修改 | `db.js` | +events, reading_history stores (IDB v2) |

**前置**: 部署 0005 migration + 修復 3 個 BUG + 實作 5 個 P1 API 端點

### Phase 2: 自動化推理 (B 級)

**新建 3 檔 + 修改 5 檔**

| 類型 | 檔案 | 用途 |
|------|------|------|
| 新建 | `components/progress-bar.js` | 推理進度條 |
| 新建 | `components/toast.js` | Toast 通知 |
| 新建 | `model/auto-analyzer.js` | Mode A 控制器 (佇列+abort) |
| 修改 | `pages/article-detail.js` | +Mode A 觸發 + 結果嵌入 |
| 修改 | `model/inference.js` | +abort 機制 |
| 修改 | `pages/onboarding.js` | WebGPU 引導 + 知情同意 |
| 修改 | `pages/settings.js` | +Email 訂閱 UI |
| 修改 | `api.js` | +submitAnalysis |

**歸檔**: `analyze.js` 系列 (功能併入 article-detail + auto-analyzer)

### Phase 3: 個人化

**新建 2 檔 + 修改 3 檔**

| 類型 | 檔案 | 用途 |
|------|------|------|
| 新建 | `pages/reading-bias.js` | 閱讀偏見頁 |
| 新建 | `components/pie-chart.js` | 三色餅圖 |
| 修改 | `app.js` | +/profile/bias 路由 |
| 修改 | `pages/profile.js` | +閱讀偏見入口 + 徽章 |
| 修改 | `api.js` | +fetchReadingBias |

---

## 十二、架構關鍵決策點

| # | 決策 | 建議 | 理由 |
|---|------|------|------|
| 1 | Router 擴充 | 保持 hash-based (不引入框架) | 已有正則匹配，擴充 3 組即可 |
| 2 | 雷達圖技術 | **Canvas** (非 SVG) | 三角填充+半透明更自然，Compare 多圖效能更好 |
| 3 | 元件通訊 | DOM CustomEvent + 函式參數 | 無框架，資料流單向 (API → render) |
| 4 | IndexedDB | 版本 1→2，新增 3 stores | 現有 stores 不動 |
| 5 | CSS 策略 | 新 token 加入現有 main.css | 三營陣用新類名 `.camp-*`，不衝突 |
| 6 | analyze.js 整合 | 分兩步: Phase 1 不動，Phase 2 抽取到 auto-analyzer | 避免功能斷裂 |
| 7 | camp_ratio vs camp | 兩者都存 | `camp` = 規則推導(聚合用)，`camp_ratio` = LLM 原始(研究用) |

---

## 十三、獎勵機制心理學

### 現有問題

1. **10點=1票路徑太長**: 100 次有效分析才能投 1 票 (20天 @5篇/天)
   - 加入里程碑獎勵: 10次=第一個徽章, 25次=進階徽章
2. **投票「然後呢」不清楚**: Phase 2+ 才有投票功能
   - Phase 1 讓點數有用途: 解鎖完整偏見報告、歷史數據
3. **倍率使用者看不到**: 早鳥 1.5x、稀有來源 2x
   - 在事件卡片上顯示「分析此文可獲 2x」徽章

### 正向循環

```
分析文章 → +1 代幣 (即時回饋)
  → 累積點數 → 解鎖徽章 (里程碑感)
  → 投票權 → 影響排名 (權力感)
  → 分析被查看 → 影響力感知
  → 週報「你貢獻了 N 次」→ 歸屬感
  → 繼續分析
```

---

## 十四、Profile 頁面 Wireframe

```(底下banner 我想讓他放在網頁上面，跟一般網頁相同)
┌─────────────────────────────────────────┐
│  個人資料                               │
├─────────────────────────────────────────┤
│  匿名 ID: a3f8b2c1                     │
│  加入時間: 2026年3月8日                  │
├── 數據概覽 ──────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 25     │ │ 18     │ │ 72%    │      │
│  │ 總點數 │ │ 分析數 │ │ 通過率 │      │
│  └────────┘ └────────┘ └────────┘      │
├── 閱讀偏見 ──────────────────────────────┤
│  [三色餅圖] 泛綠62% / 泛白18% / 泛藍20% │
├── 成就徽章 ──────────────────────────────┤
│  [已獲得] ★新手分析師  ★跨媒體達人      │
│  [未解鎖] ○立場觀察家  ○盲區發現者      │
├── 貢獻歷史 ──────────────────────────────┤
│  3/8 賴清德國防展  +1 ✓通過             │
│  3/7 環保法修正案  +0 ✗未通過           │
├── 關於 PowerReader ─────────────────────┤
│  AGPL-3.0 · [GitHub] · @MackinHung      │
│  [成為公民贊助者] NT$50/月              │
│  投票權2x + 週報 + 搶先體驗             │
├─────────────────────────────────────────┤
│  [首頁] [立場分布] [影響力] [文件] [個人設定]      │
└─────────────────────────────────────────┘
```

---

## 十五、WCAG 2.1 AA 無障礙清單

| # | 項目 | 狀態 |
|---|------|------|
| 1 | 三色條 ARIA (`role="img"` + `aria-label`) | 已設計 |
| 2 | Camp badge 非色彩依賴 (●/◐/■) | 已設計 |
| 3 | 雷達圖 `aria-label` 含三軸數值 | 已設計 |
| 4 | 進度條 `role="progressbar"` | 已設計 |
| 5 | 文字對比度 ink on paper = 13.5:1 | 通過 |
| 6 | muted 文字修正為 #767672 (4.6:1) | 已修正 |
| 7 | 高對比模式圖案區分 (斜線/點狀/十字) | 已設計 |
| 8 | `aria-live="polite"` (進度+toast) | 已設計 |

---

## 十六、待決定事項

| # | 問題 | 選項 | 建議 |
|---|------|------|------|
| 1 | camp_ratio vs camp 儲存策略 | A: 只存規則推導 / B: 只存 LLM / **C: 兩者都存** | C |
| 2 | Email 發送技術 | A: Cloudflare Email Workers / B: 第三方 (SendGrid/Resend) | A (免費 100封/天) |
| 3 | 贊助金流 | A: GitHub Sponsors / B: Buy Me a Coffee / C: 自建 | 待決定 |
| 4 | 搜尋 Phase 1 是否加入 | A: 加入 (基本 LIKE) / B: 延後 | 建議 A |
| 5 | 教育頁面是否加入 | A: Onboarding 擴充 / B: 獨立頁面 | 建議 A |
| 6 | 0005 migration 何時部署 | A: Phase 1 開始前 / B: 分批部署 | 建議 A |

---

## 附錄 A: 競品分析報告

### 1. Ground News (groundnews.com) — 最重要參考對象

**核心功能**:
- **Blindspot Feed**: 偵測被某一政治光譜忽略的新聞。公式: 當報導來源在特定光譜側佔比極高時標記為 blindspot
- **Bias Rating**: 7 級分類 (Far Left → Center → Far Right)，整合 AllSides + Ad Fontes + MBFC 三家評分
- **事件聚合**: 同一事件顯示多來源報導，附上 Left/Center/Right 摘要
- **Ownership 資訊**: 顯示媒體擁有者（企業/政府/獨立）
- **Headline Comparison**: 不同立場媒體的標題並列展示

**訂閱模式**:
| 等級 | 價格 | 功能 |
|------|------|------|
| Free | $0 | 基本 bias rating + 有限 blindspot |
| Pro | $9.99/年 | 標題比較 + 自訂 feed |
| Premium | $29.99/年 | 無限 blindspot + Newsletter + 無廣告付費牆過濾 |
| Vantage | (最高) | + My News Bias 個人分析 + Ownership + 進階篩選 |

**可借鏡**:
- Blindspot 偵測 → PowerReader 已設計 `detectBlindspot()` (≥80% 單營佔比)
- 三方標題並列 → PowerReader 降級版 (各營陣 summary)
- Ownership 透明度 → PowerReader 可在 source-transparency 頁顯示

**PowerReader 差異化**: Ground News 是中心化伺服器分析；PowerReader 用使用者 GPU 本地推理

### 2. AllSides (allsides.com)

**核心功能**:
- **5 級偏見評分**: Left / Lean Left / Center / Lean Right / Right
- **並列展示**: 同事件顯示三方 (Left + Center + Right) 報導
- **社群評分**: 志工編輯 + 群眾評審 (不同政治立場者交叉審核)
- **媒體偏見圖表**: 1,400+ 媒體的偏見評級

**可借鏡**:
- 5 級分類的簡潔性 → PowerReader 用三營陣 (泛綠/泛白/泛藍) 更適合台灣
- 社群審核機制 → PowerReader 的投票系統 (Phase 2+) 有類似精神
- 並列展示 → PowerReader compare 頁面

### 3. Ad Fontes Media (adfontesmedia.com)

**核心功能**:
- **Media Bias Chart**: 二維圖表 — X 軸: 政治偏見 (左右)，Y 軸: 可靠度 (高低)
- **互動式圖表**: 可縮放、篩選媒體類型

**可借鏡**:
- 二維評估 (偏見 + 可靠度) → PowerReader 有 bias_score + controversy_score 雙維度
- 互動式媒體地圖 → 可在 source-transparency 頁面呈現

### 4. NewsGuard (newsguardtech.com)

**核心功能**:
- **瀏覽器擴充功能**: 網頁旁顯示媒體信任評分 (0-100 + 綠/紅盾牌)
- **9 項評分標準**: 資訊準確性、更正政策、所有權透明等

**可借鏡**:
- 瀏覽器擴充概念 → PowerReader PWA 可考慮 Chrome Extension (Phase 3+)
- 即時評分 UI (盾牌 icon) → PowerReader 的 camp-badge 類似概念

### 5. 台灣現有工具

**目前台灣沒有等同的媒體立場即時分析工具**:
- 公視 (PTS) 信任度最高 (55%)，但無立場分析工具
- 網路溫度計 (DailyView) 做輿情分析，但非媒體偏見分析
- 學術研究有媒體光譜分析，但無面向一般民眾的工具
- **PowerReader 將是台灣第一個此類工具**

### PowerReader 差異化優勢

| 維度 | Ground News / AllSides | PowerReader |
|------|----------------------|-------------|
| 推理位置 | 中央伺服器 | **使用者瀏覽器 (WebGPU)** |
| 評分來源 | 人工標註 + 第三方 | **AI 即時分析 (Qwen3-8B)** |
| 費用 | 訂閱制 ($10-30/年) | **完全免費** (Cloudflare 免費方案) |
| 開源 | 封閉 | **AGPL-3.0 完全開源 (含 Prompt)** |
| 政治光譜 | 美國左右光譜 | **台灣三營陣 (綠/白/藍)** |
| 知識透明 | 不公開評分過程 | **RAG 知識注入可展開查看** |

---

## 附錄 B: 背景 Agent 報告摘要

### D1 Schema 完整缺口分析 (56h 工作量)

背景 agent 完成了更詳細的 D1 缺口分析，確認:
- **10 項核心缺口** (6 項 CRITICAL)
- **Migration 0005 是所有 v2.0 功能的前置條件**
- 建議部署順序: Phase A (基礎表, 1週) → Phase B (API 層, 2-3週) → Phase C (Cron Workers, 3-4週)
- 需新建 6 個 handler + 3 個 cron worker + 修改 3 個現有檔案
- 完整報告見: `C:\Users\water\AppData\Local\Temp\claude\C--Users-water-Desktop\tasks\a4558ad.output`

---

**下一步**: 負責人審核後，按 Phase 1 → Phase 2 → Phase 3 順序實作。
