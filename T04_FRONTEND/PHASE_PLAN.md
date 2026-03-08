# T04 Frontend Experience Team - Phase Plan v2.1

**Scope**: PWA (Cloudflare Pages), **桌面網頁版 only**, i18n (zh-TW), local model via **WebLLM** (@mlc-ai/web-llm, Qwen3-4B WebGPU), accessibility (WCAG 2.1 AA), **three-camp visual system, event aggregation, blindspot detection, source transparency, subscription, Mode A auto-analysis, dual-pass inference, multi-version analysis**.

> **v2.1**: 基於功能可行性分類 (docs/FEATURE_FEASIBILITY.md) 重新排序為三階段。
> - Phase 1: 核心閱讀體驗 (A 級 — 資料已存在)
> - Phase 2: 自動化推理 + 互動 (B 級 — 需新元件)
> - Phase 3: 個人化 + 生態
> 前 v2.0 的 6 Phase 整併為 3 Phase，以功能可行性等級為主軸。

---

## v1.0 Phase Status (已完成)

| Phase | 狀態 | 說明 |
|-------|------|------|
| Phase 1: Foundation | ✅ Done | PWA shell + SW + IndexedDB + locale + OAuth |
| Phase 2: Core Pages | ✅ Done | Home + Article Detail + bias bar + API client |
| Phase 3: Local Model | ✅ Done | Qwen download + inference engine + analysis page |
| Phase 4: LINE Bot + Profile | ✅ Done | Profile + auth + LINE design |
| Phase 5: Compare + Settings + Extension | ✅ Done | Compare + settings + Chrome extension |
| Phase 6: Polish + A11y + QA | ✅ Done | WCAG audit + onboarding + error UX |

**v1.0 File Count**: 41 files (PWA + extension)

---

## 已確認的使用者決策 (v2.0 + v2.1)

| # | 決策 | 值 | 決策編號 |
|---|------|-----|---------|
| 1 | 三營陣邊界 | 綠 0-40 / 白 40-60 / 藍 60-100 (40/60 切法) | #013 |
| 2 | 首頁模式 | 純事件聚合,不保留文章列表模式 | #013 |
| 3 | 聚類方式 | 保持 title bigram Jaccard (零 neuron 成本), threshold 0.45 | #013 |
| 4 | 功能不閹割 | 訂閱者: 投票權 2x + 搶先體驗 + 完整個人報告 | #015 |
| 5 | 無廣告 | 永遠不加廣告 | #015 |
| 6 | **桌面 only** | 手機不跑模型,不符合硬體條件就不能推理 | #017 |
| 7 | **Mode A (自動分析)** | 使用者讀文章,後台自動分析,讀完結果就在 | #017 |
| 8 | **硬體偵測** | 偵測 Ollama → benchmark → GPU/CPU/不可跑 | #018 |
| 9 | **CPU 支援** | CPU/GPU 都支援,80% 資源上限,timeout 120-180s | #019 |
| 10 | **降級替代** | C 級功能先用降級版: 取現有 summary/reasoning/knowledge | #020 |
| 11 | **多版本分析** | 同一篇可有多個版本,可切換,有 AI 品質總分 | #021 |

---

## v2.1 三階段計畫 — 功能可行性驅動

### Phase 1: 核心閱讀體驗 (A 級為主)

**Goal**: 讓使用者打開就能看到有價值的內容。所有資料已存在於 D1/R2/Vectorize，只需前端 UI。

> 涵蓋: A1-A12 (12 項 A 級功能) + C1/C2/C3 降級版

| # | Deliverable | 類型 | Details | 已有可利用 |
|---|-------------|------|---------|-----------|
| 1 | **三營陣基礎元件** | 基礎 | camp-bar + radar-chart + camp-badge 元件 + CSS tokens | `getCampFromScore()` 已有 |
| 2 | **事件聚合首頁 + 光譜色條** | A1 | 首頁改為事件聚合,每張卡片含三色分布條 + 盲區 badge | `articles.bias_score` + `event_clusters` |
| 3 | **文章內頁立場分析** | A2, A3 | 三軸雷達圖 + bias_score 光譜 + controversy_score | 全部從 `bias_score` 推導 |
| 4 | **三方標題聚合 (降級版)** | C1→A | 從各營陣文章取現有 `summary` 按 camp 分組顯示 | `camp` + `event_cluster_members` + `articles.summary` |
| 5 | **關鍵字顯示** | A9 | 從 `key_phrases` JSON 渲染 tag pills | `analyses.key_phrases` |
| 6 | **新聞發布時間軸** | A10 | 同一事件聚類中各文章 `published_at` 水平時間線 | `event_cluster_members` JOIN `articles` |
| 7 | **新聞盲點區塊** | A12 | 首頁獨立 section,顯示觀點嚴重失衡事件 | `blindspot_events` 表 |
| 8 | **AI 分析參考 (降級版)** | C2→A | 顯示 `analyses.reasoning` 原文 + 標註「AI 分析參考」 | `analyses.reasoning` 已存在 |
| 9 | **知識庫參考 (降級版)** | C3→A | 顯示 Vectorize 匹配知識條目 (人物/議題/名詞) | `knowledge_ids` + Knowledge API |
| 10 | **分析透明度面板** | A4-A7, B5 | 可展開: 品質數據、Prompt 版本、最後更新、總來源數、貢獻者數 | D1 已有全部欄位 |
| 11 | **原始發布時間** | A8 | 文章頂部顯示 (前端已有,確認位置) | `articles.published_at` |
| 12 | **類似新聞主題** | A11 | 文章底部「你可能也想看」— 從 event_clusters 推薦 | Jaccard 聚類, zero neuron |
| 13 | **盲區頁面** | A12 | 獨立頁面: 盲區事件列表,按嚴重程度排序 | `blindspot_events` + `detectBlindspot()` |
| 14 | **來源透明度頁面** | — | 來源傾向分析 + 月度趨勢 + 近期文章 | `source_tendencies` + `articles` |
| 15 | **Event Detail 頁面** | — | 事件三色分布 + 來源光譜 + 文章列表 | `event_clusters` + `event_cluster_members` |

**Workers 後端 (Phase 1 需要)**:
| Deliverable | Details |
|-------------|---------|
| Event clustering Cron (每小時) | title bigram Jaccard ≥ 0.45 → `event_clusters` + `event_cluster_members` |
| Blindspot detection Cron (每小時) | camp 分布 → `blindspot_events` |
| Source tendency Cron (每日) | 30天 AVG(bias_score) → `source_tendencies` |
| `GET /api/v1/events` | 事件列表 API |
| `GET /api/v1/events/:cluster_id` | 事件詳細 + 三營陣分布 |
| `GET /api/v1/blindspot/events` | 盲區事件列表 |
| `GET /api/v1/sources`, `GET /api/v1/sources/:source` | 來源透明度 |
| D1 Migration `0005_three_camp.sql` | 全部新表 + ALTER |

**依賴**:
- `shared/enums.js` 三營陣 enums ✅ 已完成
- `shared/config.js` THREE_CAMP + BENCHMARK 區塊 ✅ 已完成
- D1 migration 設計 ✅ 已完成 (docs/D1_MIGRATION_V2.md)

**Exit Criteria**: 首頁事件卡片 + 文章頁完整分析區塊 + 盲區頁 + 來源透明度頁; 降級版 C1/C2/C3 可顯示

---

### Phase 2: 自動化推理 + 互動 (B 級)

**Goal**: 讓桌面使用者的 WebLLM 推理無縫運作,加入互動功能。

| # | Deliverable | 類型 | Details | 工作量 |
|---|-------------|------|---------|--------|
| 1 | **硬體偵測 + benchmark** | B2 | WebGPU detect → VRAM 檢查 → WebLLM 短文推理計時 → localStorage 快取結果 | 小 |
| 2 | **背景自動分析 (Mode A)** | B3 | 文章打開時自動觸發 WebLLM Service Worker 雙 Pass 推理,不需按按鈕 | 中 |
| 3 | **進度條 + 完成通知** | B1, B11 | 文章底部進度條 (可下拉隱藏) + `+1 完成 · +1 代幣` toast | 中 |
| 4 | **多版本分析 + 版本切換** | #021 | 同一篇多版本,版本列表 + 切換 UI + AI 品質總分 | 中 |
| 5 | **首頁文章圖片** | B4 | Crawler 提取 `og:image` → D1 `articles.thumbnail_url` → 前端 `<img>` | 中 |
| 6 | **分析分享** | B8 | Web Share API + 社群分享連結 (FB/LINE/Twitter) | 小 |
| 7 | **回饋 👍👎** | B9 | D1 `article_feedback` 新表 + POST API + 前端 UI | 中 |
| 8 | **Onboarding 更新** | — | 桌面 only + WebGPU 偵測引導 + 知情同意 + 自動偵測 (零安裝) | 小 |

**新增 Workers 端點**:
| Endpoint | Details |
|----------|---------|
| `POST /api/v1/articles/:article_id/feedback` | 使用者回饋 (👍/👎) |
| `GET /api/v1/articles/:article_id/feedback/stats` | 回饋統計 |

**依賴**:
- Phase 1 完成
- WebGPU 支援的瀏覽器 (Chrome 113+ / Edge 113+)
- Crawler 擴充 og:image 提取 (T02)
- `shared/config.js` BENCHMARK 區塊 ✅ 已完成 (v3.2 WebLLM 更新)

**Exit Criteria**: WebGPU 偵測 + WebLLM benchmark 通過; Mode A 雙 Pass 自動分析完整流程; 進度條 + toast 顯示; 回饋 UI 可用

---

### Phase 3: 個人化 + 生態

**Goal**: 個人閱讀偏見、訂閱機制、模型記錄、推薦系統。

| # | Deliverable | 類型 | Details | 工作量 |
|---|-------------|------|---------|--------|
| 1 | **模型名稱記錄** | B6 | D1 `analyses.model_name` + 前端「分析透明度」顯示 | 小 |
| 2 | **Prompt 內容展示** | B7 | L1 靜態文字直接顯示 + L2 知識條目從 Vectorize 查回 | 中 |
| 3 | **個人化偏好** | B10 | `user_reading_history` + `user_preferences` + 推薦邏輯 | 大 |
| 4 | **閱讀偏見報告** | — | 三色餅圖 + 偏見分析 + 建議閱讀 (from v2.0 Phase 4) | 中 |
| 5 | **訂閱機制** | — | 訂閱 UI + 權益對照 + Email 通知 (from v2.0 Phase 4) | 中 |
| 6 | **AI 品質總分系統** | #021 | 模型智性分定義 + 校準 + 版本比較排序 | 中 |
| 7 | **WCAG 審計 + E2E** | QA | 所有新元件無障礙 + Playwright E2E + Lighthouse | 中 |

**依賴**:
- Phase 1-2 完成
- Google OAuth user_hash (已有)
- Cloudflare Email Workers (Phase 3 訂閱者通知)

**Exit Criteria**: 閱讀偏見餅圖可渲染; 訂閱流程完整; AI 品質總分可排序版本; WCAG 通過

---

### 不做 / 遠期

| 項目 | 原因 |
|------|------|
| 事實性驗證 (C4) | 需要即時事實 DB + 70B+ 模型 |
| 完整三方摘要生成 (C1 完整版) | 需要 server-side LLM (Workers AI) |
| 相關法規條文 (C3 完整版) | 需要法規 DB + NER |
| AI 深度洞察 (C2 完整版) | 需要更強模型 |
| 手機端推理 | 硬體條件不足 (Decision #017) |

---

## Cross-Phase Dependencies

```
Phase 1: 核心閱讀體驗 (A 級)
  ├─ 三營陣元件 + CSS
  ├─ Workers: 聚類 Cron + 盲區 Cron + 來源 Cron + 5 API 端點
  ├─ D1 Migration: 全部新表
  └─ 前端: 首頁 + 文章頁 + 盲區頁 + 來源頁 + Event Detail
  ↓
Phase 2: 自動化推理 + 互動 (B 級)
  ├─ WebGPU 偵測 + WebLLM benchmark
  ├─ Mode A 雙 Pass 自動分析 + 進度條
  ├─ 多版本分析 + 版本切換
  ├─ og:image + 回饋 + 分享
  └─ Workers: Feedback API
  ↓
Phase 3: 個人化 + 生態
  ├─ 閱讀追蹤 + 偏見報告
  ├─ 訂閱 + Email
  ├─ AI 品質總分
  └─ WCAG + E2E 收尾
```

## 已有資源利用清單

以下是 **不需新增、可直接利用** 的已有欄位/邏輯:

| 已有資源 | 用途 | 利用方式 |
|---------|------|---------|
| `articles.bias_score` (0-100) | 三營陣映射 | `getCampFromScore(bias_score)` → camp + weights |
| `articles.bias_score` | 三軸雷達圖 | `getWhiteAxisValue(bias_score)` → 白軸 |
| `articles.bias_score` + `source` | 來源傾向 | 30天 `AVG(bias_score) GROUP BY source` |
| `articles.controversy_score` | 事件爭議度 | 事件內文章的 `AVG(controversy_score)` |
| `articles.published_at` | 時間窗口 | 來源傾向 30天滑動; 事件聚合新鮮度 |
| `articles.title` | 事件聚類 | title bigram Jaccard ≥ 0.45 (零 neuron) |
| `analyses.reasoning` | AI 分析參考 | C2 降級版: 直接顯示 Qwen reasoning 原文 |
| `analyses.key_phrases` | 關鍵字 | JSON array, 渲染 tag pills |
| `analyses.quality_gate_result` | 品質數據 | 分析透明度面板 |
| `analyses.prompt_version` | Prompt 版本 | 分析透明度面板 |
| Knowledge API (`/knowledge`) | 知識庫參考 | C3 降級版: 展示匹配知識條目 |
| Google OAuth `user_hash` | 閱讀追蹤 | reading_history 關聯用戶 |
| `getArticleCluster()` | 事件聚類 | 現有 Jaccard 邏輯可提取為獨立模組 |

## 需要新增的資源

| 新增項目 | Phase | 說明 |
|---------|-------|------|
| D1: `event_clusters` | 1 | 事件聚合主表 |
| D1: `event_cluster_members` | 1 | 事件-文章關聯表 |
| D1: `source_tendencies` | 1 | 來源傾向快取 |
| D1: `blindspot_events` | 1 | 盲區事件快取 |
| D1: `article_feedback` | 2 | 文章回饋 (👍👎) |
| D1: `articles.thumbnail_url` | 2 | og:image URL |
| D1: `analyses.model_name` | 3 | 分析模型名稱 |
| D1: `subscribers` | 3 | 訂閱者資料 |
| D1: `user_reading_history` | 3 | 閱讀歷史 |
| D1: `user_streaks` | 3 | 連勝紀錄 |
| D1: `user_badges` | 3 | 徽章成就 |
| Workers Cron: event clustering | 1 | 每小時聚類 |
| Workers Cron: blindspot scan | 1 | 每小時盲區掃描 |
| Workers Cron: source tendency | 1 | 每日來源傾向計算 |
| Workers Cron: daily email | 3 | 17:00 TST 每日摘要 |

---

## Risks and Blockers (v2.1)

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebGPU 支援度 | 使用者瀏覽器需支援 WebGPU (Chrome 113+) | WebGPU 偵測引導 + WASM fallback + 「僅瀏覽模式」 |
| WASM 推理太慢 | 120-180s 等待可能流失使用者 | 進度條 + 舒緩訊息 + 完成通知 |
| 多版本分析一致性 | 不同使用者分析結果差異大 | AI 品質總分排序; 品質最高版本預設顯示 |
| Jaccard 聚類品質不足 | 事件合併錯誤 | threshold 0.45; 後續可加 embedding 二次驗證 |
| 來源傾向偏差 | 樣本不足顯示錯誤傾向 | MIN_SAMPLES=10 門檻; < 10 顯示「資料不足」 |
| 盲區誤報 | 時差導致誤報 | 盲區掃描延遲 2h |
| 訂閱支付整合 | Cloudflare 無原生支付 | 先用免費贊助 (Stripe link) |

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-03-07 | Initial 6-phase plan (Phase 1-6 all scaffold complete) |
| v2.0 | 2026-03-08 | Complete rewrite: v2.0 6-phase plan (three-camp, event aggregation, blindspot, source transparency, subscription, three-way summary); added resource utilization matrix |
| v2.1 | 2026-03-08 | Restructured to 3-phase plan based on feature feasibility (A/B/C): Phase 1 Core Reading (A-level), Phase 2 Auto Inference (B-level), Phase 3 Personalization; added: desktop only, Mode A auto-analysis, Ollama hardware detection, CPU support 120-180s, multi-version analysis, AI quality score, degraded C-level alternatives; removed: old 6-phase structure, mobile model download |
| v2.2 | 2026-03-08 | WebLLM migration: Ollama → WebLLM (WebGPU); Scope updated; Phase 2 hardware detection → WebGPU; +dual-pass; Onboarding → zero-install; Risks updated (Ollama install → WebGPU support) |

---

**Document Maintainer**: T04 (Frontend Experience Team)
**Last Updated**: 2026-03-08
