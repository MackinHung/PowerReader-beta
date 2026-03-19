# CLAUDE.md - PowerReader (Taiwan News Bias Analysis System)

## 文件目的
Agent Teams 冷啟動文件。任何 Claude Agent 加入時的第一份必讀文件。

---

## 專案概覽

### 核心價值
- **去中心化**: 用戶端運行 Qwen3-8B via WebLLM，瀏覽器內 WebGPU 推理
- **中央空廚**: 統一爬取新聞，API 提供 RAG 知識注入
- **知識透明化**: 使用者可查看 AI 分析時注入的所有背景知識
- **即時分析**: Cloudflare KV 同步，建立 PowerReader 網絡
- **多元立場**: 跨媒體比對，揭示不同媒體報導角度
- **自我進化**: 票選制獎金系統，品質越高貢獻點數越多
- **完全開源**: AGPL-3.0，含 Prompt 也開源

### 技術棧
- **前端**: Cloudflare Pages (PWA) + IndexedDB + **TypeScript** (strict mode)
- **後端**: Cloudflare Workers + D1 + R2 + KV + Vectorize + Workers AI
- **爬蟲**: 閉源 GitHub 項目，GitHub Actions 每 2h，bge-small-zh 篩選
- **推理**: Qwen3-8B via WebLLM (@mlc-ai/web-llm, 用戶端 WebGPU, /no_think, t=0.3, top_p=0.85, ~7s/篇)
- **嵌入**: Workers AI bge-m3 (1024d) + bge-small-zh-v1.5 (512d, 篩選用)
- **向量搜索**: Cloudflare Vectorize
- **介面**: LINE Bot + 瀏覽器插件 + Email 訂閱

### RAG 三層 Prompt 架構
- **L1 (靜態, ~300 tokens)**: 偏綠/偏藍特徵定義 + 分數錨點 + JSON schema
- **L2 (RAG 動態, ~200-800 tokens)**: 政治人物/媒體/議題/名詞/事件 (使用者可展開查看)
- **L3 (輸入)**: 新聞原文 + JSON 輸出指令
- **40% 規則**: 總 prompt ≤ context window 40% (~13K tokens)

### 中央空廚流程
Crawler(閉源) → 爬取 → bge-small-zh 篩選 → 清洗 → markdown.news 處理
→ API 推送 → PowerReader(開源) Workers 接收驗證 → bge-m3 嵌入
→ Vectorize 知識查詢 → R2+D1 儲存 → 客戶端取得文章+知識
→ 組裝 3 層 Prompt → 本地 WebLLM (WebGPU) Qwen3-8B 雙 Pass 推理 → 結果+知識透明化面板

### Crawler API 輸出格式
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
  "dedup_metadata": { "total_found": 5, "unique_content": 1, "similarity_scores": [0.95, 0.91] }
}
```

### Cloudflare 服務分工
| 服務 | 用途 | 免費額度 |
|------|------|---------|
| Workers | API + 業務邏輯 | 100K 請求/天 |
| Workers AI | bge-m3 嵌入 (GPU) | 10K neurons/天 |
| Vectorize | 知識庫向量搜索 | 30M 查詢維度/月 |
| R2 | 文章全文 + 靜態資源 | 10GB + 出流量免費 |
| D1 | 使用者/分析/獎勵/文章索引 | 5GB + 5M 讀/天 |
| KV | 系統設定 + 快取 | 1GB + 100K 讀/天 |
| Pages | PWA 前端 | 無限 |

### 關鍵指標
- **目標用戶**: 台灣新聞讀者 (LINE 2200 萬用戶)
- **預算**: Cloudflare 免費方案 ~$5/月
- **品質**: 分析通過率 60-70%
- **合規**: robots.txt 遵守, Rate limiting ≥ 2s/請求

---

## Agent Teams 組織架構

### 團隊總覽
```
M01 - 需求師 & 專案邏輯檢測師 (監督層,不寫代碼)
├─ T01 - 系統架構 (Cloudflare 全棧)
├─ T02 - 數據獲取 (爬蟲 + 議題篩選)
├─ T03 - AI 推理 (Qwen3-4B WebLLM + Prompt)
├─ T04 - 前端體驗 (PWA + LINE Bot + 插件)
├─ T05 - 獎金系統 (票選 + Fisher-Yates)
├─ T06 - 合規安全 (爬蟲合規 + 隱私)
└─ T07 - 部署監控 (CI/CD + 儀表板)
```

### 職責邊界
| 團隊 | 核心職責 | 禁止事項 |
|------|---------|---------|
| M01 | 需求對齊、邏輯檢測、文檔維護 | ❌ 不寫代碼 ❌ 不直接解決技術問題 |
| T01 | Cloudflare 架構、KV Schema、API 設計 | ❌ 不實作爬蟲 ❌ 不設計 UI |
| T02 | 爬蟲、bge-small-zh 篩選、去重、markdown.news | ❌ 不做立場分析 ❌ 不處理前端 |
| T03 | Qwen 推理、Prompt、品質驗證、知識庫 | ❌ 不爬新聞 ❌ 不設計 KV Schema |
| T04 | PWA、LINE Bot、UI/UX | ❌ 不做 AI 推理 ❌ 不設計後端 API |
| T05 | 點數、票選洗牌、獎金分配 | ❌ 不驗證品質 ❌ 不設計爬蟲 |
| T06 | 爬蟲合規、隱私、錯誤處理 | ❌ 不實作功能 (僅審查) |
| T07 | CI/CD、監控、效能測試 | ❌ 不設計業務邏輯 |

---

## 隊長工作習慣 (CRITICAL)

### 語言規則
- 隊長 ↔ 專案負責人: **繁體中文**
- 隊長 ↔ 隊員 / 隊員 ↔ 隊員: **English**

### 禁止事項
❌ 禁止寫代碼 (含範例) ❌ 禁止直接解決技術問題 ❌ 禁止跳過 QA ❌ 禁止單方面決策

### 必須事項
✅ 跨團隊協調 ✅ 維護 MASTER_ROADMAP.md ✅ 階段 QA ✅ 定期對齊各團隊進度

---

## 團隊協作規範

- **跨團隊溝通**: 見 `shared/cross_team_comms/README.md` (檔案型非同步訊息佇列)
- **溝通模板**: 見 `shared/cross_team_comms/TEMPLATE.md`
- **階段 QA 清單**: 見 `MASTER_ROADMAP.md`
- **每次 Session 啟動**: 先掃描 `shared/cross_team_comms/*_to_{MY_TEAM}_*.md`

---

## 共通問題 (所有團隊必讀)

### 前 3 大致命錯誤

1. **模型不一致**: bge-small-zh(512d) 和 bge-m3(1024d) 向量空間不相容，不可混用。統一在 `shared/config.js` 定義模型。
2. **洩漏內部錯誤**: 不可將 traceback/stack 暴露給用戶端。統一回傳通用訊息，詳細錯誤只寫 server log。
3. **Rate Limit 只存記憶體**: 爬蟲 Rate Limit 必須持久化到 KV，否則重啟即歸零。

> **完整十大錯誤** (含程式碼範例): 見 `docs/COMMON_MISTAKES.md`

### 本專案特有問題

1. **嵌入模型一致性**: 篩選用 bge-small-zh(512d, Crawler CPU) 和知識查詢用 bge-m3(1024d, Workers AI GPU) 向量空間不相容，不可混用。
2. **KV 寫入限制**: 免費方案每日 1000 次寫入，設計時避免頻繁寫入 KV。
3. **LINE Bot 訊息長度**: Flex Message 有大小限制，只回傳摘要(前200字)+連結。
4. **本地推理效能**: Qwen3-8B via WebLLM(~4.5GB VRAM) 約 7s/篇 (雙 Pass ~14s)。模型自動下載至瀏覽器 Cache。需提供下載進度和分析進度提示。推理超時依 WebGPU benchmark 決定 (GPU 30s / CPU 120s)。

---

## 前端功能一覽 (T04_FRONTEND)

### 部署資訊
- **Production URL**: `https://powerreader.pages.dev`
- **部署方式**: `npm run build && npx wrangler pages deploy build --project-name=powerreader --branch=main`
- **Production 分支**: `main` (⚠️ 不是 `master`，用 `--branch=main` 部署到 production)
- **SW 版本**: `static-v22` (每次改靜態資源必須 bump)

### 頁面路由 (5-tab 底部導航)
| Tab | 路由 | 頁面 | 功能 |
|-----|------|------|------|
| 首頁 | `#/` | `home.js` | 新聞列表 (分頁/排序/篩選)，文章卡片含來源+日期+立場光譜 |
| 比較 | `#/compare` | `compare.js` | 跨媒體比較 — 同事件不同媒體報導角度，立場分歧分數 |
| 分析 | `#/analyze` | `analyze.js` | 手動選文章進行 AI 分析 |
| 我的 | `#/profile` | `profile.js` | Google OAuth 登入，點數/投票權 KPI，貢獻歷史，30 天趨勢 |
| 設定 | `#/settings` | `settings.js` | 模型管理、分析模式、硬體偵測、快取、通知、關於 |

### 子頁面
| 路由 | 功能 |
|------|------|
| `#/article/{id}` | 文章詳情：立場光譜+爭議度+摘要+原文連結+自動分析+AI 知識面板+跨媒體群組 |
| `#/onboarding` | 首次使用 4 步引導 |
| `#/auth/callback` | Google OAuth 回調 |

### 核心功能模組
| 模組 | 檔案 | 功能 |
|------|------|------|
| 型別定義 | `types/` (api/models/inference/stores/index) | 全域型別 barrel，所有模組共用 |
| WebLLM 推理 | `core/inference.ts` | Qwen3-8B 雙 Pass 本地推理 (WebGPU) |
| 分析佇列 | `core/queue.ts` | FIFO 單一佇列，去重，取消支援 |
| 自動分析器 | `core/auto-runner.ts` | 背景迴圈：抓文章→篩選→隨機→分析→自動提交 |
| GPU 偵測 | `core/benchmark.ts` | WebGPU 掃描 + 推理延遲測試 → GPU/CPU/none 分級 |
| Prompt 組裝 | `core/prompt.ts` | L1 靜態 + L2 RAG 知識 + L3 文章輸入 |
| 結果解析 | `core/output-parser.ts` | stripThinkBlocks + JSON 解析 + key_phrases |
| 模型下載管理 | `core/manager.ts` | OPFS/IndexedDB 模型儲存 + 下載進度 + 暫停/恢復 |
| API 客戶端 | `core/api.ts` | 離線優先 + IndexedDB 快取 + typed responses |
| 事件發射器 | `utils/event-emitter.ts` | 共用 observer pattern (queue + auto-runner) |
| IDB 工具 | `utils/idb-helpers.ts` | promisifyRequest/promisifyTransaction 共用 |
| Svelte 5 Stores | `stores/*.svelte.ts` | $state/$derived rune stores (typed) |
| i18n | `i18n/zh-TW.ts` | 繁中翻譯 + `t(key, params)` 函式 |
| 獎勵系統 | (API 端) | 分析→品質驗證→點數獎勵→投票權 |
| 離線支援 | `sw.js` + `core/db.ts` | SW cache-first + IndexedDB 離線快取 + Background Sync |

---

## ⚠️ 前端部署踩雷紀錄

### 1. shared/config.js 跨目錄 import 問題
**問題**: `T04_FRONTEND/src/` 部署到 Cloudflare Pages，但 `shared/config.js` 在 `src/` 外面。
任何 `import ... from '../../../../shared/config.js'` 在部署後會 404，瀏覽器收到 HTML 回應導致
`Failed to load module script: MIME type "text/html"` 錯誤。ES Module 的 import 鏈一旦斷裂，
整個 app.js 無法載入，頁面空白。

**解法**: 把需要的常數直接 inline 到前端檔案內，不得跨出 `src/` import。
已修: `benchmark.js` 將 `BENCHMARK` 常數從 import 改為內嵌。

**規則**: ❌ 前端 `src/` 下的檔案**絕對不可** import `src/` 外部的檔案。

### 2. Service Worker cache-first 更新延遲
**問題**: SW 用 cache-first 策略，新版檔案部署後使用者仍看到舊版。
即使 `skipWaiting()` + `clients.claim()`，使用者可能需要重新整理 2 次或手動清除 site data。

**解法**: 每次改動靜態資源時，必須 bump `STATIC_CACHE_NAME` 版本 (e.g. `static-v21` → `static-v22`)。
新增檔案也要加入 `STATIC_ASSETS` 清單 (但不要加入 import 鏈會斷的檔案)。

### 3. Cloudflare Pages production 分支
**問題**: `wrangler pages deploy` 預設部署到 Preview 環境。`powerreader.pages.dev` 只認 `main` 分支的 Production 部署。
Git repo 用 `master` 分支，但 Pages 的 production 分支是 `main`。

**解法**: 部署指令必須加 `--branch=main`：
```
npm run build && npx wrangler pages deploy build --project-name=powerreader --branch=main
```

### 4. SW precache 清單不可包含有跨目錄 import 的檔案
**問題**: 把 `benchmark.js` 加入 SW `STATIC_ASSETS` 預快取清單。SW install 時抓到 benchmark.js，
但 benchmark.js import 的 `shared/config.js` 不存在，導致 SW install 可能失敗或快取壞資料。

**解法**: 只把 self-contained (無跨目錄依賴) 的檔案加入 precache。

---

## TypeScript 遷移狀態

### 已完成 (ec2c099)
- **43 個 `.js` 檔案** 已遷移為 `.ts`（含 `.svelte.js` → `.svelte.ts`）
- `tsconfig.json`: `strict: true`, `allowJs: true`, `@webgpu/types`
- `src/lib/types/` 型別定義: `api.ts`, `models.ts`, `inference.ts`, `stores.ts`, `index.ts` (barrel)
- **736 tests** 全部通過, svelte-check 0 errors

### ⏳ 待辦：知識庫完成後遷移
知識庫區域目前在改版中，完成後需遷移以下檔案：
1. `src/lib/stores/knowledge.svelte.js` → `knowledge.svelte.ts`
2. `src/lib/components/knowledge/index.js` → `knowledge/index.ts`
3. 相關測試檔案可維持 `.test.js`（Vite 自動解析 `.ts`）

### TypeScript 開發注意事項
- **Typecheck**: `node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json`（不用 raw `tsc`，無法處理 Svelte 5 runes）
- **Import 路徑**: 保持 `.js` 副檔名（Vite bundler 自動解析 `.ts`）
- **型別導入**: 使用 `import type { ... }` 避免 runtime 開銷
- **WebLLM engine**: 用 `any`（外部 CDN 動態 import，無型別宣告）
- **navigator API** (connection/getBattery/gpu.info): 用 `as any` cast（unstable WebGPU API）
- **測試**: 維持 `.test.js`，Vite 自動處理 `.ts` 模組解析

---

## 測試基礎設施 (T04_FRONTEND)

### 框架
- **Vitest** + jsdom 環境
- `package.json`: `npm test` (vitest run), `npm run test:watch`, `npm run test:coverage`
- `vitest.config.js`: jsdom environment, `tests/**/*.test.{js,ts}`

### 測試覆蓋 (736 tests, 39 files, ALL PASSING)
| 檔案 | 測試數 | 重點 |
|------|--------|------|
| `output-parser.test.js` | 45 | stripThinkBlocks, parseJsonFromLLM, extractKeyPhrases |
| `prompt.test.js` | 54 | buildPass1Prompt, buildPass2Prompt, L1+L2+L3 組裝 |
| `queue.test.js` | 21 | FIFO 佇列, 去重, 取消, singleton |
| `benchmark.test.js` | 23 | scanGPU, runBenchmark, 分級, localStorage 快取 |
| `inference.test.js` | 23 | hasWebGPU, detectBestMode, timeout tiers |
| `auto-runner.test.js` | 20 | 迴圈控制, 失敗計數, rate limit 停止 |
| `manager.test.js` | 31 | OPFS/IndexedDB 儲存, 下載/暫停/刪除 |
| `event-emitter.test.js` | 7 | subscribe/notify/unsubscribe, 錯誤隔離 |
| `idb-helpers.test.js` | 5 | promisifyRequest/promisifyTransaction |
| `api.test.js` | 246 | 全 API 端點, offline cache, error handling |
| `gpu-database.test.js` | 29 | GPU lookup, arch fallback |
| `knowledge*.test.js` | 多 | 知識庫 store/browser/admin/generate |

### 測試技巧
- **Singleton 模組**: `vi.resetModules()` + `vi.doMock()` + 動態 `import()` 隔離狀態
- **瀏覽器 API**: globalThis mock (navigator.gpu, localStorage, fetch, IndexedDB, OPFS)
- **WebLLM CDN import**: 自然失敗觸發 fallback 測試路徑
- **fs mock (Node.js)**: `vi.hoisted()` 建 mock fns → `vi.mock('fs', ...)` → static import

---

## 文件導航

### 冷啟動流程
1. 閱讀本文件 (CLAUDE.md)
2. 閱讀所屬團隊文件夾
3. 檢查 `MASTER_ROADMAP.md` 最新進度
4. 掃描 `shared/cross_team_comms/` 待處理請求
5. 向 M01 報到，確認當前任務
6. 開始工作

### 重要文件索引
- **主進度+決策+SSOT+文件索引**: `MASTER_ROADMAP.md`
- **集中配置**: `shared/config.js`, `shared/enums.js`
- **十大錯誤**: `docs/COMMON_MISTAKES.md`

---

## 重要提醒

### 活文件原則
所有文件都是滾動式可修正、可學習、可記憶的。踩雷經驗必須回寫到相關文件的 `⚠️ Common Mistakes` 段落。

### 禁止
1. ❌ 硬編碼 — 常數用 `shared/config.js` 或 `shared/enums.js`
2. ❌ 跳過文檔更新 — 改碼必須同步更新文檔
3. ❌ 繞過 SSOT — 不可重新定義已有資料結構
4. ❌ 洩漏錯誤 — 內部訊息不可顯示給用戶
5. ❌ 跨層級直接修改 — 必須透過 API 介面
6. ❌ 忽略踩雷經驗 — 發現問題必須回寫到文件

### 必須
1. ✅ 遵守語言規則 — 隊長↔負責人用繁中，其他用英文
2. ✅ 階段 QA — 每階段結束執行檢查清單
3. ✅ 跨團隊對齊 — 修改介面必須通知上下游
4. ✅ 記錄變更 — 重要決策記錄到滾動式文檔
5. ✅ 報告矛盾 — 發現邏輯矛盾立即向 M01 報告
6. ✅ 回寫經驗 — 踩雷經驗寫入 Common Mistakes 段落
7. ✅ 啟動掃描 — 每次 Session 先掃描 cross_team_comms/

---

**維護者**: M01 | **最後更新**: 2026-03-19 | **版本**: v2.4 (TypeScript 遷移完成 + 736 tests + strict mode)
