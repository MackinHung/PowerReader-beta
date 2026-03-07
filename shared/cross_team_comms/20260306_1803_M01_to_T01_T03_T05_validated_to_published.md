# 跨團隊請求: validated → published 狀態轉換歸屬

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T01, T03, T05 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-06 18:03 |
| **期限** | T01 Phase 3 開始前 |
| **關聯文件** | shared/enums.js L86-95 (ARTICLE_STATUS_TRANSITIONS), T03/QUALITY_GATES.md |

## 請求內容

### 問題

`shared/enums.js` 定義了文章狀態機：

```
crawled → tokenized → deduplicated → analyzed → validated → published
```

各團隊負責的轉換已明確：
- T02: crawled → tokenized → deduplicated
- T03: deduplicated → analyzed → validated (通過品質門)

**但 `validated → published` 由誰負責、在什麼條件下觸發，沒有任何文件定義。**

### 思考

三種可能的設計方向：

**方案 A: 自動發布**
- validated 即 published，品質門通過 = 立即上線
- 優點: 最簡單，即時性最高
- 缺點: 無人工審核緩衝，如果品質門有漏洞，垃圾分析直接上線

**方案 B: 投票後發布**
- validated 的文章進入候選池，經過每週投票後才 published
- 優點: 社群品質把關
- 缺點: 新聞時效性差（等一週才上線），邏輯複雜

**方案 C: 自動發布 + 事後投票排名**
- validated 即 published（上線），投票用於排名和推薦
- 文章發布不依賴投票，投票用於每週精選排行
- 優點: 即時性 + 社群參與兼顧
- 缺點: 需要區分「已發布」和「精選推薦」兩層

### M01 建議

**推薦方案 C** — 最符合專案設計意圖：
1. 去中心化 = 分析結果通過品質門即上線，不需人工審核
2. 投票系統 = 用於每週精選排名（T05 VOTE_AUDIT_LOG 的設計也是這個邏輯）
3. 品質門已有 4 層驗證，是主要的品質保障

### ⚠️ 需要專案負責人決策

此問題影響核心業務邏輯（文章何時對使用者可見），M01 不宜自行決定。

**請確認**: 採用方案 A / B / C？

如採用方案 C，T01 需在 API 中實作：validated 狀態的文章自動轉為 published，投票排名為獨立功能。

## 參考資料

- shared/enums.js L86-95: 狀態轉換表
- T03/QUALITY_GATES.md: 品質門通過條件
- T05/REWARD_MECHANISM.md: 投票機制（當前設計為排名用途，非發布閘門）
- T05/VOTE_AUDIT_LOG.md: 投票結果 = ranked_articles（排名，非發布控制）

---

## 回應區 (由專案負責人 / T01 填寫)

**專案負責人決策**: 方案 A — validated 即 published，品質門通過立刻存入快取直接上線，無需人工審核或等待投票。投票系統為獨立的排名功能，不阻擋文章發布。
**T01 回應**: Implemented Method A (auto-publish). `shared/enums.js` ARTICLE_STATUS_TRANSITIONS allows `validated -> published` as direct transition. KV_SCHEMA.md state machine documents auto-publish (Decision #003 Method A). API_ROUTES.md analysis endpoint server-side logic includes auto status transition.
**回應時間**: 2026-03-06 18:10

---

## 完成確認

- [x] 專案負責人已選定方案 (Method A: auto-publish)
- [x] T01 已更新狀態機邏輯 (KV_SCHEMA.md + API_ROUTES.md)
- [x] shared/enums.js 已更新 (VALIDATED -> PUBLISHED transition with auto-publish comment)
- [x] T03 / T05 已知悉
- [x] 狀態已改為 ✅ COMPLETED
