# 跨團隊請求: KV 寫入預算統一分配

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T01 |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-06 18:00 |
| **期限** | T01 Phase 2 開始前 |
| **關聯文件** | shared/config.js (CLOUDFLARE.KV_DAILY_WRITE_LIMIT: 1000), CLAUDE.md Common Mistake #2 |

## 請求內容

### 問題

Cloudflare 免費方案 KV 寫入限制 **1000 次/天**，但 5 個團隊都需要 KV 寫入，且無統一預算分配：

| 團隊 | 用途 | 未控管估算 |
|------|------|-----------|
| T02 | 爬蟲存文章 (每 3h 一批) | 300/次 × 8 = **2400/天** |
| T03 | 分析結果寫入 | 依使用者量，~200-500/天 |
| T05 | 積分更新 + 投票 | 依使用者量，~200-500/天 |
| T07 | 監控指標 flush | ~50-100/天 |
| T01 | Rate limit 計數器 | ~100-200/天 |
| **合計** | | **~3000-3700/天（超額 3x）** |

光 T02 爬蟲就已超額。各 PHASE_PLAN 都寫了「batch writes」作為緩解，但沒有人統一分配額度。

### 思考

1. 每日 1000 寫入是硬限制，超過直接 API 報錯
2. CLAUDE.md 已記載此風險（Common Mistake #2），但停在「概念層面」
3. 需要一份 **KV Write Budget Table**，明確分配各團隊每日配額
4. 升級付費方案也是選項，但先假設免費方案

### 建議方案

請 T01 在 `shared/config.js` 新增 KV 寫入預算分配：

```javascript
export const KV_WRITE_BUDGET = {
  T02_CRAWLER: 400,      // 批次寫入，每 3h 約 50 次
  T03_ANALYSIS: 300,     // 分析結果
  T05_REWARD: 150,       // 積分 + 投票
  T07_METRICS: 50,       // 監控指標
  T01_RATE_LIMIT: 100,   // Rate limit 計數器
  // 合計 = 1000
};
```

配合以下策略：
- T02 爬蟲必須用 **批次合併寫入**（多篇文章合成一個 KV key）
- T07 監控用 **記憶體累積 + 定期 flush**（每小時寫入一次）
- 所有團隊實作時必須有 **寫入計數器**，接近配額時降級或排隊

### 需要 T01 回覆

1. 是否接受上述預算分配比例？
2. T02 批次寫入的 KV key 設計建議（例如 `articles:batch:{date}:{batch_num}`）
3. 是否需要在 Workers 中實作全域寫入計數器中間件？

## 參考資料

- `shared/config.js` L54-56: `KV_DAILY_WRITE_LIMIT: 1000`
- CLAUDE.md: OceanRAG 十大錯誤 #3 (Rate Limit 只存記憶體)
- T02 PHASE_PLAN Phase 5: KV write budget management
- T07 PHASE_PLAN Phase 2: batch in-memory, periodic KV flush

---

## 回應區 (由 T01 填寫)

**回應團隊**: T01
**回應時間**: 2026-03-07
**處理結果**: Accepted. KV_WRITE_BUDGET added to `shared/config.js` with exact allocation proposed (T02:400, T03:300, T05:150, T07:50, T01:100 = 1000 total). Phase 2 Task 6 (`shared/kv-budget.js`) will implement the middleware with daily write counter per team. T02 batch writes use D1 as primary storage now (KV is cache-only), significantly reducing KV write pressure.

---

## 完成確認

- [x] T01 已制定 KV Write Budget Table
- [x] 已更新 shared/config.js (KV_WRITE_BUDGET section)
- [x] 已通知 T02, T03, T05, T07 (via KV_SCHEMA.md team contracts)
- [x] 狀態已改為 ✅ COMPLETED
