# 跨團隊請求: T03 金標準資料集的 T02 時序依賴

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T03 |
| **優先級** | 🟢 LOW |
| **建立時間** | 2026-03-06 18:04 |
| **期限** | T03 Phase 1 開始前 |
| **關聯文件** | T03/PHASE_PLAN.md Phase 1, T02/PHASE_PLAN.md Phase 2 |

## 請求內容

### 問題

T03 PHASE_PLAN Phase 1 需要 **20 篇含 CKIP BERT 分詞的真實文章**作為金標準資料集，並列出依賴：

> "T02: Need 20 real crawled articles with CKIP BERT tokens in the agreed `tokens` field format"

但 T02 的分詞功能在 Phase 2 才交付。如果 T03 等 T02 Phase 2 完成，T03 Phase 1 會被阻塞。

### 思考

這個阻塞是可以繞過的：
1. 金標準只需要 20 篇，數量極少
2. T03 可以**手動準備**這 20 篇（直接從新聞網站取文，本地跑 CKIP BERT 分詞）
3. 不需要等 T02 的完整爬蟲管線

### 建議

請 T03 在 PHASE_PLAN.md Phase 1 中加入替代方案：

```
Dependencies:
- T02: Need 20 real crawled articles with CKIP BERT tokens
- ALTERNATIVE: If T02 Phase 2 not ready, manually prepare 20 articles:
  1. Manually fetch 20 articles from 5+ news sources
  2. Run CKIP BERT locally (ckiplab/bert-base-chinese, version per config.js)
  3. Format output as per T01 KV Schema (tokens field)
  4. Store in gold-standard/v1/ on R2 (or local for now)
```

### 需要 T03 回覆

1. 是否同意加入替代方案？
2. 確認本地 CKIP BERT 環境可用？

## 參考資料

- T03/PHASE_PLAN.md Phase 1: gold standard dataset
- T02/PHASE_PLAN.md Phase 2: CKIP BERT tokenization
- shared/config.js: MODELS.CKIP_BERT = "ckiplab/bert-base-chinese"

---

## 回應區 (由 T03 填寫)

**回應團隊**: T03
**回應時間**: 2026-03-07
**處理結果**:
This issue is now OBSOLETE. Per Decision #007 (2026-03-07), CKIP BERT has been completely removed from the project. The gold standard dataset no longer requires CKIP tokens.

Updated approach:
- Gold standard articles only need: title, summary, content_markdown, source, author, published_at
- No `tokens` field needed -- embedding is handled by Cloudflare Workers AI bge-m3
- T03 can independently prepare 20 articles from public news sources
- PHASE_PLAN.md Phase 1 will be updated to remove CKIP dependency

This request can be marked COMPLETED as the underlying dependency no longer exists.

---

## 完成確認

- [ ] T03 已更新 PHASE_PLAN.md 加入替代方案
- [ ] 狀態已改為 ✅ COMPLETED
