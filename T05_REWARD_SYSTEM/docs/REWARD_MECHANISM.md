# Reward Mechanism

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md
- **下游文件**: docs/FISHER_YATES_SPEC.md (票選洗牌, Phase 2+)
- **相關團隊**: T03 (品質驗證), T04 (前端顯示), T01 (D1 Schema)
- **踩雷經驗**: docs/COMMON_MISTAKES.md
- **維護者**: T05 (Reward System Team)
- **類型**: SSOT (Single Source of Truth)
- **最後更新**: 2026-03-08

---

## 文件目的

本文件是 **獎勵系統的唯一設計規格書**。定義點數發放規則、投票權利轉換、防作弊機制、以及所有與獎勵相關的資料模型。

**修改此文件時必須通知**: T03, T04, T01

---

## 設計哲學

1. **量的鼓勵** — 每筆有效分析 = 0.1 點，低門檻鼓勵參與
2. **質的回饋** — Phase 2+ 票選加分機制 (詳見 FISHER_YATES_SPEC.md)
3. **防作弊** — T05 Pre-Check A~D + T03 Quality Layer 1~4 雙層防禦
4. **透明可審計** — 全部開源 (AGPL-3.0)，審計日誌可公開驗證

---

## 點數生命週期

### 流程總覽

```
使用者裝置 (WebLLM Qwen3-4B)
    ↓ 提交分析結果
T05 Pre-Check 防作弊閘門
    A: 每日上限 50 次 → 429
    B: 最低 5s / 最高 1h → 400
    C: article_id 去重 → 409
    D: content_hash 去重 → 409
    ↓ ALL PASS
T03 Quality Layer 品質驗證
    1: JSON 格式  2: 數值範圍  3: 一致性  4: 模糊去重
    ↓ ALL PASS
點數發放: +0.1 點 → D1 users.total_points_cents += 10
    ↓
累積 ≥ 10 點 → 獲得投票權 (vote_rights = floor(cents / 1000))
```

### 點數規則

| 項目 | 值 | 常數 |
|------|-----|------|
| 每次有效分析 | 0.1 點 (10 cents) | `POINTS_PER_VALID_ANALYSIS_CENTS` |
| 投票權門檻 | 10 點 (1000 cents) = 1 票 | `POINTS_PER_VOTE_RIGHT_CENTS` |
| 每日上限 | 50 次 | `DAILY_ANALYSIS_LIMIT` |
| 時間上限 | 1 小時 | `MAX_ANALYSIS_TIME_MS` |

### 計算範例

```
100 次有效分析 → 1000 cents = 10.0 點 → 1 票
253 次有效分析 → 2530 cents = 25.3 點 → 2 票 (下張票在 300 次)
```

---

## 懲罰機制

| 條件 | 懲罰 |
|------|------|
| 連續 3 次未通過驗證 | 冷卻 1 小時 (cooldown_until) |

- 通過驗證 → `consecutive_failures = 0` (重置)
- 冷卻期間提交 → HTTP 429 + 剩餘秒數
- 冷卻結束 → `clearExpiredCooldown()` 自動清除
- 冷卻不影響已累積的點數和投票權

---

## 投票權利 (Phase 2+)

> v1.0 僅計算並顯示 `vote_rights`，不開放投票功能。

- **轉換**: 10 點 = 1 票，不可逆，`vote_rights = floor(total_points_cents / 1000)`
- **週期**: 每週一次 (週一 00:00 ~ 週日 23:59 Asia/Taipei)
- **限制**: 每人每週期 1 票
- **排名**: Fisher-Yates 洗牌處理同票 → 詳見 `FISHER_YATES_SPEC.md`

### 未來倍率機制 (Phase 2+)

| 倍率 | 條件 | 乘數 |
|------|------|------|
| 早鳥 | 文章發布 24h 內首篇分析 | 1.5x |
| 稀有來源 | 該週期分析量後 20% 的來源 | 2.0x |
| 高爭議性 | controversy_score ≥ 50 | 1.5x |

倍率可疊加，最大 0.45 點/次，結果用 cents 儲存。

---

## D1 資料模型

### users 表

```sql
-- Migration: src/workers/migrations/0003_t05_reward.sql
user_hash             TEXT PRIMARY KEY,   -- SHA-256(google_uid)
total_points_cents    INTEGER DEFAULT 0,  -- 整數分, 1000 = 10.00 點
contribution_count    INTEGER DEFAULT 0,  -- 有效分析總次數
vote_rights           INTEGER DEFAULT 0,  -- floor(total_points_cents / 1000)
votes_used            INTEGER DEFAULT 0,  -- 已使用的投票權
daily_analysis_count  INTEGER DEFAULT 0,  -- 當日分析數 (Asia/Taipei 00:00 重置)
daily_analysis_date   TEXT,               -- "YYYY-MM-DD" (重置判斷)
consecutive_failures  INTEGER DEFAULT 0,  -- 連續失敗次數
cooldown_until        TEXT,               -- ISO 8601 冷卻結束時間 (null = 無)
last_contribution_at  TEXT,               -- 最後貢獻時間
created_at            TEXT,
updated_at            TEXT
```

### reward_dedup 表

```sql
user_hash     TEXT NOT NULL,
article_id    TEXT NOT NULL,    -- Pre-Check C
content_hash  TEXT NOT NULL,    -- Pre-Check D
rewarded_at   TEXT NOT NULL,
PRIMARY KEY (user_hash, article_id),
UNIQUE INDEX (user_hash, content_hash)
```

- 所有 D1 操作封裝在 `src/repository.js` (Repository Pattern)
- `persistReward()` 使用 `db.batch()` 原子更新 user + dedup

---

## 防作弊機制

### Pre-Check 閘門 (T05，先於 T03 執行)

| 層級 | 檢查 | 攔截目標 | HTTP |
|------|------|---------|------|
| A | 每日 50 次上限 | 批量灌水 | 429 |
| B | 5s ≤ 分析時間 ≤ 1h | 自動化腳本 | 400 |
| C | article_id 去重 | 重複提交 | 409 |
| D | content_hash 去重 (T06 修補) | 轉載攻擊 | 409 |

> 實作見 `src/reward-flow.js` (processAnalysisReward)
> 一致性檢查 → T03 Quality Layer 3 | Sybil 抵抗 → T06 Google OAuth

---

## 跨團隊整合

### T03 → T05

```javascript
// T03 品質驗證通過後呼叫:
processAnalysisReward(repo, user_hash, article_id, content_hash, time_spent_ms)
// 需要: quality_gate_result === "passed"
```

### T05 → T04

| 顯示項目 | 資料來源 (D1) | 更新頻率 |
|---------|---------|---------|
| 我的點數 | `users.total_points_cents / 100` | 即時 |
| 投票權 | `users.vote_rights - users.votes_used` | 即時 |
| 冷卻狀態 | `users.cooldown_until` | 即時 |

### T05 → T01

| D1 表 | 操作 |
|-------|------|
| `users` | 讀寫 (點數、投票權、冷卻、每日限額) |
| `reward_dedup` | 讀寫 (Pre-Check C/D) |

> **⚠️ SSOT 問題**: T01 `src/workers/handlers/rewards.js` 重新實作了 T05 邏輯 (缺少 Pre-Check D)。應改為 import T05。待 M01 協調。

---

## 變更紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-03-06 | 骨架版本 |
| v1.0 | 2026-03-06 | 完整設計: 點數生命週期、防作弊、KV 模型、跨團隊介面 |
| v1.1 | 2026-03-07 | 冷卻統一 cooldown_until; Gate→Pre-Check 命名; 投票延後 Phase 2+ |
| v1.2 | 2026-03-07 | Pre-Check A-D 命名統一; +Pre-Check C/D; T06 安全修補 |
| v1.3 | 2026-03-07 | QA: SHA-256 驗證、optional guard 修復、時間上限、常數匯出 |
| v2.0 | 2026-03-07 | KV→D1 遷移: Repository pattern, batch 原子交易, article_id 統一 |
| v2.1 | 2026-03-08 | 模組重構: 5 模組分拆, Common Mistakes 獨立, docs/ 整理 |
| v3.0 | 2026-03-08 | 文件精簡: 525→~200 行, Phase 2+ 內容壓縮, 虛擬碼移除 |

---

**修改此文件前**: 通知 T03, T04, T01 → 更新 MASTER_ROADMAP.md → M01 審查

**維護者**: T05 | **最後更新**: 2026-03-08
