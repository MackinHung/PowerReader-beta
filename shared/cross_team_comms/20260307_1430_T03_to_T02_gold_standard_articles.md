# 跨團隊請求: T03 金標準測試集 — 需要 T02 提供新聞資料

| 欄位 | 值 |
|------|---|
| **狀態** | 🟡 PENDING |
| **來源團隊** | T03 |
| **目標團隊** | T02 |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-07 14:30 |
| **期限** | 儘快 |
| **關聯文件** | T03/PHASE_PLAN.md Phase 1, T03/MODEL_ACCURACY_REPORT.md, T02/CRAWLER_SPEC.md |

## 請求內容

### 需求

T03 需要建立 20 篇金標準測試集 (Gold Standard Dataset) 來驗證 Qwen3.5-4B 的分析準確率。

請 T02 提供 **20 篇已爬取的真實新聞文章**，格式為 Crawler API 輸出 JSON：

```json
{
  "article_id": "sha256",
  "title": "新聞標題",
  "summary": "摘要",
  "content_markdown": "清洗後的 Markdown 全文",
  "source": "媒體來源",
  "author": "記者名 (nullable)",
  "published_at": "ISO 8601"
}
```

### 選文要求

- **4 家以上不同媒體來源**，每家約 5 篇
- **議題多樣性**: 涵蓋政治、社會、經濟、兩岸、民生
- **文章類型**: 直述新聞、社論/評論、政策報導混合
- **長度**: 500-2000 字為佳
- **時效**: 近期文章（2026 年內）

### 不需要的欄位

- 不需要 `tokens` (CKIP BERT 已移除)
- 不需要 `filter_score` 或 `dedup_metadata` (T03 不使用)

### 用途

T03 將對這 20 篇文章進行人工標註 (bias_score + controversy_score)，作為 Prompt v2.0.0 的評估基準。

### 替代方案

如果 T02 pipeline 尚未就緒，T03 可自行從新聞網站手動取文。但優先使用 T02 的爬蟲輸出以確保格式一致。

## 參考資料

- T03/PHASE_PLAN.md Phase 1: Gold Standard Dataset
- T03/MODEL_ACCURACY_REPORT.md: 標註指南與評估方法
- CLAUDE.md: Crawler API 輸出格式定義

---

## 回應區 (由 T02 填寫)

**回應團隊**:
**回應時間**:
**處理結果**:

---

## 完成確認

- [ ] T02 已提供 20 篇文章
- [ ] 格式符合 Crawler API schema
- [ ] 狀態已改為 ✅ COMPLETED
