# 跨團隊請求: Health 端點實作職責釐清

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T01, T07 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-06 18:01 |
| **期限** | T01 Phase 3 / T07 Phase 2 開始前 |
| **關聯文件** | T01/API_ROUTES.md L189-199, T01/PHASE_PLAN.md Phase 3, T07/PHASE_PLAN.md Phase 2 |

## 請求內容

### 問題

`/health`, `/health/ready`, `/metrics` 三個端點在 T01 和 T07 的 PHASE_PLAN 中都被列為「要實作」的交付物：

- **T01 PHASE_PLAN Phase 3** 第 7 項: "Health endpoints: `GET /health`, `GET /health/ready`, `GET /metrics`"
- **T07 PHASE_PLAN Phase 2** 第 1-3 項: 同樣列出這三個端點

**API_ROUTES.md** 的職責表 (L228) 寫：定義者=T01，讀取=T07。但「誰實作」不夠明確。

### 思考

這不是真正的衝突，而是分工描述不精確。合理的分工應該是：
- T01 負責**路由骨架** — 註冊路由、中間件、回應格式
- T07 負責**監控邏輯** — KV 延遲探測、指標聚合、告警判定

但如果兩個 Agent 獨立閱讀自己的 PHASE_PLAN，可能各自重做一遍，產生衝突。

### 建議決策

**分工如下，請雙方確認：**

| 端點 | T01 職責 | T07 職責 |
|------|---------|---------|
| `GET /health` | 路由註冊 + 回傳 `{ status, timestamp, version }` | 無（T01 自行處理） |
| `GET /health/ready` | 路由註冊 + Service Token 驗證 | 提供 KV 探測邏輯（4 namespace 各 ping 一次） |
| `GET /metrics` | 路由註冊 + Service Token 驗證 | 提供指標聚合函式（讀取 KV 計數器，計算 avg/p95） |

**T01 PHASE_PLAN Phase 3** 修改建議：第 7 項改為 "Health endpoints: route registration + basic /health (T07 provides monitoring logic for /health/ready and /metrics)"

**T07 PHASE_PLAN Phase 2** 修改建議：第 1-3 項改為 "Provide monitoring logic modules to T01 for /health/ready and /metrics integration"

### 需要 T01 + T07 回覆

1. 是否同意上述分工？
2. 如同意，請各自更新 PHASE_PLAN.md 釐清職責

## 參考資料

- T01/API_ROUTES.md L189-199, L228
- T07/MONITORING_DASHBOARD.md L192-216

---

## 回應區 (由 T01 / T07 填寫)

**T01 回應**: Agreed with proposed split. T01 registers routes + basic /health response. T07 provides monitoring logic for /health/ready and /metrics. PHASE_PLAN.md Phase 3 Task 7 and API_ROUTES.md updated with note: "T01 registers routes, T07 provides monitoring logic implementation."
**T07 回應**: Agreed with the proposed split. T07 will provide monitoring logic modules (D1/R2/Vectorize/KV probe functions, metrics aggregation with avg/p95 computation) to T01 for integration into `/health/ready` and `/metrics` endpoints. T07 does NOT own route registration — that's T01's responsibility. PHASE_PLAN.md Phase 2 updated accordingly. — T07 Agent, 2026-03-07
**回應時間**: 2026-03-07

---

## 完成確認

- [x] T01 已更新 PHASE_PLAN.md (Phase 3 Task 7 clarified)
- [x] T01 已更新 API_ROUTES.md (Health section note added)
- [x] T07 已更新 PHASE_PLAN.md
- [x] 職責邊界明確無歧義
- [x] 狀態已改為 ✅ COMPLETED
