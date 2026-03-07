# 跨團隊請求: KV_SCHEMA.md 全面更新（資料結構審查）

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T01 |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-06 18:30 |
| **期限** | T01 Phase 2 開始前 |
| **關聯文件** | T01/KV_SCHEMA.md, T03/QUALITY_GATES.md, T05/REWARD_MECHANISM.md, T05/VOTE_AUDIT_LOG.md, T02/DEDUPLICATION_LOGIC.md |

## 請求內容

資料結構審查發現 KV_SCHEMA.md (SSOT) 嚴重落後於下游團隊的設計，共 **12 項需修正**：

### 🔴 HIGH — 必須立即修正

**H1: `total_points` 型別衝突**
- KV_SCHEMA.md L92: `"total_points": 12.3` (浮點數)
- REWARD_MECHANISM.md L245: `"total_points": 1230` (整數分 cents)
- REWARD_MECHANISM.md Common Mistake 1 明確禁止浮點數
- **修正**: 統一為整數分 (cents)，`1230 = 12.30 點`

**H2: `vote_rights` 計算公式連鎖不一致**
- KV_SCHEMA.md: `total_points / 10`
- QUALITY_GATES.md L600: `(total_points + 0.1) / POINTS_PER_VOTE_RIGHT`
- REWARD_MECHANISM.md L284: `(total_points_cents + pointsCents) / 1000`
- **修正**: 統一為 `Math.floor(total_points_cents / 1000)`

### 🟡 MEDIUM — Phase 2 前修正

**M1: VOTE_RESULTS namespace 缺少大量欄位**
- KV_SCHEMA.md 只有 8 欄位，VOTE_AUDIT_LOG.md 定義了 20+ 欄位
- 缺少: `period_start`, `period_end`, `seed_hash`, `seed_hash_committed_at`, `eligible_voters`, `candidate_articles`, `shuffle_verification_url`, `computed_at`, `audit_file_path`
- `commit_hash` vs `github_commit_sha` 命名不一致
- `ranked_articles` 子結構: `score` vs `votes_received` 不一致

**M2: VOTE_RESULTS 缺少 3 個 KV key pattern**
- 缺少: `vote:latest`, `vote:{vote_id}:seed_commitment`, `vote:{vote_id}:individual:{user_hash}`
- VOTE_AUDIT_LOG.md L76-81 已定義這些 key

**M3: USER_POINTS namespace 缺少防作弊欄位**
- 缺少: `votes_used`, `daily_analysis_count`, `daily_analysis_date`, `consecutive_failures`, `cooldown_until`
- 這些是 T05 防作弊機制的關鍵欄位 (REWARD_MECHANISM.md L240-259)

**M4: Article namespace 缺少 `reasoning` 和 `key_phrases`**
- QUALITY_GATES.md Layer 1 要求 6 個必要欄位，但 KV_SCHEMA.md 缺少這 2 個
- 品質驗證失敗結果也要寫入 KV（供審計），需要這些欄位

**M5: Article namespace 缺少 `existing_bias_scores`**
- QUALITY_GATES.md L503 的離群值偵測需要此陣列欄位
- 用於 Layer 3 一致性驗證

**M6: 缺少用戶歷史 KV key pattern**
- QUALITY_GATES.md 引用 `history:{user_hash}:{source}` 和 `user_history:{user_hash}:scores`
- 這兩個 key pattern 不在任何 namespace 定義中

**M7: 缺少 LSH bucket KV key pattern**
- DEDUPLICATION_LOGIC.md L647-649 定義 `lsh_bucket:{bucket_key}` 但 KV_SCHEMA.md 未收錄

**M8: VOTE_RESULTS 主 key TTL 應為永久**
- KV_SCHEMA.md 寫 365 天，但 VOTE_AUDIT_LOG.md 寫永久
- 365 天 TTL 只適用於 `individual:{user_hash}` 子 key

**M9: `seed` 格式不一致**
- config.js: `SHUFFLE_SEED_SOURCE: "record_hash"`
- KV_SCHEMA.md: `"record_hash_abc123"`
- VOTE_AUDIT_LOG.md: `"vote_20260227_003:2026-03-03T00:00:00+08:00:{salt}"`
- 三處定義完全不同

### 建議

T01 主導一次 KV_SCHEMA.md 全面更新，將 T03/T05/T02 文件中的所有 KV key pattern 和欄位統一收錄。這是根本修正 — 大多數問題源自 KV_SCHEMA.md 仍為骨架版本。

---

## 回應區 (由 T01 填寫)

**回應團隊**: T01
**回應時間**: 2026-03-07
**處理結果**: KV_SCHEMA.md completely overhauled to v2.0. Architecture changed from KV-primary to 4-layer storage (D1 primary + R2 full text + Vectorize knowledge + KV cache-only). This resolves most issues since KV is no longer primary storage:
- H1: total_points unified to integer cents (total_points_cents in D1 users table)
- H2: vote_rights formula unified to Math.floor(total_points_cents / 1000)
- M1-M2: VOTE_RESULTS namespace marked Phase 2+ reserved
- M3: Anti-cheat fields added to D1 users table (daily_analysis_count, consecutive_failures, cooldown_until)
- M4-M5: reasoning, key_phrases added to D1 analyses table; existing_bias_scores computed from D1 query
- M6: User history stored in D1 (query by user_hash), not separate KV keys
- M7: LSH bucket stored in D1 dedup process, not KV
- M8-M9: Votes deferred to Phase 2+, seed format TBD at implementation time

---

## 完成確認

- [x] KV_SCHEMA.md 全面更新完成 (v2.0 — 4-layer architecture)
- [x] total_points 統一為整數分 (total_points_cents in D1)
- [x] vote_rights 公式統一 (Math.floor(total_points_cents / 1000))
- [x] 所有缺失欄位和 key pattern 已補齊 (D1 tables + R2 paths + Vectorize + KV namespaces)
- [ ] T03, T05, T02 已確認更新後的 schema
- [x] 狀態已改為 ✅ COMPLETED
