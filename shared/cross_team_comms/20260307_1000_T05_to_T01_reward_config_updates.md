# 跨團隊請求: REWARD 常數擴充 + MODELS 更新

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | T05 |
| **目標團隊** | T01 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-07 10:00 |
| **期限** | T05 Phase 1 實作前 |
| **關聯文件** | shared/config.js, T05/REWARD_MECHANISM.md, CLAUDE.md (決策 #004, #007) |

## 請求內容

### 問題 A: REWARD 區塊缺少防作弊常數

`shared/config.js` 的 `REWARD` 區塊目前只有 4 個常數。T05 Phase 1-2 實作需要以下額外常數:

```javascript
export const REWARD = {
  // 現有
  POINTS_PER_VALID_ANALYSIS: 0.1,
  POINTS_PER_VOTE_RIGHT: 10,
  SHUFFLE_SEED_SOURCE: "record_hash",
  AUDIT_COMMIT_TO_GITHUB: true,
  AUDIT_RETENTION_DAYS: 365,

  // === 以下為新增請求 ===

  // 整數分表示 (避免浮點誤差)
  POINTS_PER_VALID_ANALYSIS_CENTS: 10,  // 10 cents = 0.1 pt
  POINTS_PER_VOTE_RIGHT_CENTS: 1000,    // 1000 cents = 10 pts = 1 vote

  // Anti-Gaming Gates (T05 Phase 2)
  DAILY_ANALYSIS_LIMIT: 50,             // Gate 1: 每人每日上限
  MIN_ANALYSIS_TIME_MS: 5000,           // Gate 2: 最短分析時間
  CONSECUTIVE_FAILURE_THRESHOLD: 3,     // 連續失敗觸發冷卻
  COOLDOWN_DURATION_SECONDS: 3600,      // 冷卻持續 1 小時

  // Phase 2+ (投票系統延後，但保留常數定義)
  // SHUFFLE_SEED_SOURCE: "record_hash",
  // AUDIT_COMMIT_TO_GITHUB: true,
  // AUDIT_RETENTION_DAYS: 365,
};
```

### 問題 B: MODELS 區塊需要更新

根據 MASTER_ROADMAP 決策 #004 和 #007:
- Qwen 從 2B 升級為 4B (`qwen3.5:4b`, 3.4GB)
- CKIP BERT 已移除，改用 bge-m3 和 bge-small-zh
- 推理模式改為 `think: false`

建議更新 `MODELS`:
```javascript
export const MODELS = {
  // 客戶端推理
  QWEN: "qwen3.5:4b",
  QWEN_SIZE_GB: 3.4,
  QWEN_THINK: false,
  QWEN_TEMPERATURE: 0.5,

  // 知識查詢嵌入 (Cloudflare Workers AI)
  EMBEDDING: "@cf/baai/bge-m3",
  EMBEDDING_DIM: 1024,

  // 議題篩選嵌入 (Crawler CPU)
  FILTER_EMBEDDING: "bge-small-zh-v1.5",
  FILTER_EMBEDDING_DIM: 512,
};
```

---

## 回應區

**T01 回應**: Implemented (2026-03-07). Both issues resolved in `shared/config.js` v2.0:
**Problem A (REWARD)**: All anti-cheat constants added — `DAILY_ANALYSIS_LIMIT: 50`, `MIN_ANALYSIS_TIME_SEC: 10`, `CONSECUTIVE_FAILURE_COOLDOWN: 3`, `COOLDOWN_DURATION_MIN: 60`. Points use integer cents: `POINTS_PER_VALID_ANALYSIS: 10` (cents), `POINTS_PER_VOTE_RIGHT: 1000` (cents). POINTS_USE_CENTS flag added for explicitness.
**Problem B (MODELS)**: Updated to Qwen 4B (`qwen3.5:4b`, 3.4GB, think=false, t=0.5), bge-m3 (@cf/baai/bge-m3, 1024d) for knowledge embedding, bge-small-zh-v1.5 (512d) for topic filtering. CKIP BERT removed entirely.

---

## 完成確認

- [x] REWARD 區塊已擴充防作弊常數 (DAILY_ANALYSIS_LIMIT, MIN_ANALYSIS_TIME_SEC, etc.)
- [x] MODELS 區塊已更新為 4B + bge-m3 (QWEN_PARAMS, EMBEDDING, FILTER)
- [x] 狀態已改為 ✅ COMPLETED
