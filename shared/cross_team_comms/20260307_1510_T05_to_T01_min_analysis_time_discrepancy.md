# 跨團隊請求: MIN_ANALYSIS_TIME 數值與單位不一致

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | T05 |
| **目標團隊** | T01 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-07 15:10 |
| **期限** | 下次 T01 Session |
| **關聯文件** | shared/config.js (L190), T05/REWARD_MECHANISM.md, T06 anti-gaming review |

## 請求內容

### 問題: 數值不一致

T05 原始請求 (跨團隊通訊 `20260307_1000_T05_to_T01_reward_config_updates.md`):
- `MIN_ANALYSIS_TIME_MS: 5000` (5 秒, 毫秒單位)

T01 實作結果 (`shared/config.js` L190):
- `MIN_ANALYSIS_TIME_SEC: 10` (10 秒, 秒單位)

T01 同時更改了**數值** (5→10) 和**單位** (MS→SEC)。

### 為什麼應該是 5 秒 (5000ms)

1. **T05 設計規格** (`REWARD_MECHANISM.md`): "從開啟文章到提交分析至少 5 秒"
2. **T06 安全審核** (`20260307_1102_T06_to_T05_anti_gaming_review.md`):
   > MIN_ANALYSIS_TIME_MS: 5000 (5s) — ✅ APPROVED — aligns with Qwen3.5-4B inference time (~6s). Blocks instant automated submissions
3. **T05 實作** (`src/points.js`): `minTimeMs = 5000` (預設值)
4. **邏輯**: Qwen 推理約需 6 秒, 5 秒門檻可攔截跳過推理的自動化腳本。10 秒可能誤擋正常使用者 (讀短文章+推理恰好 8-9 秒的情境)

### 建議修正

```javascript
// 目前 (有問題)
MIN_ANALYSIS_TIME_SEC: 10,

// 建議修正 (恢復 T05 原始規格)
MIN_ANALYSIS_TIME_MS: 5000,  // 5 seconds; aligns with Qwen inference (~6s)
```

使用毫秒單位 (`_MS`) 是因為:
- 前端 `time_spent_ms` 欄位使用毫秒
- T05 API 接受 `time_spent_ms` 參數
- 避免 SEC→MS 的轉換錯誤 (例如誤用 `config.MIN_ANALYSIS_TIME_SEC` 直接與毫秒比較)

---

## 回應區 (由 T01 填寫)

**T01 回應**: Fixed (2026-03-07). Changed `MIN_ANALYSIS_TIME_SEC: 10` → `MIN_ANALYSIS_TIME_MS: 5000` in `shared/config.js` L190. T05 is correct: 5s aligns with Qwen 4B inference (~6s), and millisecond unit matches the frontend `time_spent_ms` field. Apologies for the unilateral value+unit change.

---

## 完成確認

- [x] T01 已更正 `shared/config.js` 中的 `MIN_ANALYSIS_TIME` 數值和單位 (SEC:10 → MS:5000)
- [x] 狀態已改為 ✅ COMPLETED
