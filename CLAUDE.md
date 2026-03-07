# CLAUDE.md - PowerReader (Taiwan News Bias Analysis System)

## 文件目的
Agent Teams 冷啟動文件。任何 Claude Agent 加入時的第一份必讀文件。

---

## 專案概覽

### 核心價值
- **去中心化**: 用戶端運行 Qwen3.5-4B，本地 GPU 推理
- **中央空廚**: 統一爬取新聞，API 提供 RAG 知識注入
- **知識透明化**: 使用者可查看 AI 分析時注入的所有背景知識
- **即時分析**: Cloudflare KV 同步，建立 PowerReader 網絡
- **多元立場**: 跨媒體比對，揭示不同媒體報導角度
- **自我進化**: 票選制獎金系統，品質越高貢獻點數越多
- **完全開源**: AGPL-3.0，含 Prompt 也開源

### 技術棧
- **前端**: Cloudflare Pages (PWA) + IndexedDB
- **後端**: Cloudflare Workers + D1 + R2 + KV + Vectorize + Workers AI
- **爬蟲**: 閉源 GitHub 項目，GitHub Actions 每 2h，bge-small-zh 篩選
- **推理**: Qwen3.5-4B (用戶端, think=false, t=0.5, ~6s/篇)
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
→ 組裝 3 層 Prompt → 本地 Qwen3.5-4B 推理 → 結果+知識透明化面板

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
├─ T03 - AI 推理 (Qwen3.5-4B + Prompt)
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
4. **本地推理效能**: Qwen3.5-4B(3.4GB) 約 6-10s/篇。需提供下載進度和分析進度提示。電量<20%且非充電時不下載模型。推理超時 30 秒。

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

**維護者**: M01 | **最後更新**: 2026-03-07 | **版本**: v2.0 (精簡版, 從 v1.3 811 行精簡至此)
