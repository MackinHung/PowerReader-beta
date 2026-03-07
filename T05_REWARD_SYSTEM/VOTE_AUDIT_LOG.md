# 📋 Vote Audit Log (票選審計日誌)

> ⏸️ **Phase 2+ 未來規劃** — 本文件定義的票選審計日誌為 Phase 2+ 規劃功能，v1.0 不實作。文件保留作為未來實作參考。

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js (`REWARD`), T05/FISHER_YATES_SPEC.md, T05/REWARD_MECHANISM.md
- **下游文件**: T01/KV_SCHEMA.md (`VOTE_RESULTS` namespace)
- **維護者**: T05 (Reward System Team)
- **類型**: 滾動式紀錄 (Living Document)
- **最後更新**: 2026-03-06

---

## 🎯 文件目的
定義 **票選系統的完整審計日誌規範**，包含每次投票週期的記錄格式、
驗證流程、GitHub 自動 commit、以及公開審計機制。

**核心保證**: 所有投票結果 **可追溯、可驗證、不可竄改**。

---

## 📐 審計紀錄格式

### 單次投票週期紀錄

```javascript
{
  // === 投票週期識別 ===
  "vote_id": "vote_20260306_001",
  "period_start": "2026-03-03T00:00:00+08:00",  // 週一 00:00 Asia/Taipei
  "period_end": "2026-03-09T23:59:59+08:00",    // 週日 23:59

  // === Seed 承諾 (Anti-Gaming) ===
  "seed_hash": "a3f2b8c1d4e5...",                // 投票前公開的 SHA-256 承諾
  "seed_hash_committed_at": "2026-03-03T00:00:01+08:00",
  "seed": "vote_20260227_003:2026-03-03T00:00:00+08:00:{salt}",

  // === 投票統計 ===
  "total_voters": 47,
  "total_votes": 47,           // = voters (每人限 1 票)
  "eligible_voters": 123,

  // === 候選文章 ===
  "candidate_articles": [
    {
      "article_hash": "sha256_article_001",
      "title": "新聞標題...",
      "source": "中央社",
      "votes_received": 12
    }
  ],

  // === 排名結果 ===
  "ranked_articles": [
    { "rank": 1, "article_hash": "sha256_...", "votes_received": 12 },
    { "rank": 2, "article_hash": "sha256_...", "votes_received": 12 },
    { "rank": 3, "article_hash": "sha256_...", "votes_received": 8 }
  ],

  // === 洗牌驗證資訊 ===
  "shuffle_algorithm": "fisher_yates",
  "shuffle_input_order": "article_hash_lexicographic",
  "shuffle_verification_url": "/api/v1/votes/vote_20260306_001/verify",

  // === 審計元資料 ===
  "computed_at": "2026-03-10T00:05:00+08:00",
  "github_commit_sha": "abc123def456...",
  "audit_file_path": "audit/2026/03/vote_20260306_001.json"
}
```

---

## 📦 儲存策略

### KV 儲存 (VOTE_RESULTS namespace)

| Key | Value | TTL |
|-----|-------|-----|
| `vote:{vote_id}` | 完整投票紀錄 JSON | 永久 |
| `vote:latest` | 最近一次 `vote_id` | 永久 |
| `vote:{vote_id}:seed_commitment` | `seed_hash` | 永久 |
| `vote:{vote_id}:individual:{user_hash}` | 個別投票紀錄 | 365 天 (`REWARD.AUDIT_RETENTION_DAYS`) |

### R2 備份

```
audit/
  2026/
    03/
      vote_20260306_001.json    # 完整紀錄
      vote_20260306_001.sha256  # 檔案雜湊
```

### GitHub Auto-Commit

```
REWARD.AUDIT_COMMIT_TO_GITHUB: true  (config.js)
```

Commit 格式:
```
audit: vote_20260306_001 results (47 voters)

Period: 2026-03-03 ~ 2026-03-09
Candidates: 15 articles
Top voted: "新聞標題..." (12 votes)
Seed hash: a3f2b8c1... (committed 2026-03-03T00:00:01+08:00)
```

---

## 🔄 投票生命週期

```
Phase 1: 週期開始 (每週一 00:00 Asia/Taipei)
  ├─ 計算 seed (基於上次 vote_id + timestamp + salt)
  ├─ 計算 seed_hash = SHA-256(seed)
  ├─ 寫入 KV: vote:{vote_id}:seed_commitment = seed_hash
  └─ 公開 seed_hash

Phase 2: 投票期間 (週一~週日)
  ├─ 列出候選文章 (status=validated)
  ├─ 使用者投票 (每人每週期限 1 票)
  └─ seed 保密

Phase 3: 計票 (每週日 23:59:59 截止後)
  ├─ 收集所有投票
  ├─ 統計每篇文章得票數
  ├─ 同票文章使用 Fisher-Yates 洗牌
  └─ 產生最終排名

Phase 4: 公開與審計
  ├─ 公開完整 seed
  ├─ 寫入 KV + R2
  ├─ Commit 至 GitHub
  └─ 驗證端點可用
```

---

## 🔍 驗證協議

### 公開驗證端點

`GET /api/v1/votes/:vote_id/verify` (不需認證)

```javascript
{
  "success": true,
  "data": {
    "vote_id": "vote_20260306_001",
    "seed_hash_match": true,       // SHA-256(seed) === seed_hash
    "shuffle_result_match": true,  // Fisher-Yates 重現結果一致
    "github_commit_sha": "abc123..."
  }
}
```

### 手動驗證步驟

```
1. 確認 SHA-256(seed) === seed_hash (承諾驗證)
2. 將 candidate_articles 按 article_hash 字典序排列
3. 執行 fisherYatesShuffle(sorted_articles, seed)
4. 比對結果是否與 ranked_articles 一致
5. 確認 GitHub commit 存在且內容一致
```

---

## 🔒 隱私保護

| 項目 | 處理方式 |
|------|---------|
| 投票者身份 | 僅記錄 `user_hash` (SHA-256) |
| 投票內容 | 記錄投給哪篇 article_hash |
| IP / 裝置 | 不記錄 |
| 個別投票紀錄 | 365 天後自動刪除 |

---

## 📊 滾動式紀錄

### 投票週期歷史

| 週期 | vote_id | 投票人數 | 候選文章數 | 最高票 | seed_hash 前 8 字元 | GitHub Commit |
|------|---------|---------|-----------|--------|-------------------|---------------|
| (系統啟動後於此表記錄每週結果) | | | | | | |

### 異常事件紀錄

| 日期 | 事件 | 影響 | 處理方式 |
|------|------|------|---------|
| (記錄投票系統異常) | | | |

---

## ⚠️ Common Mistakes

### Mistake 1: 未在投票前公開 seed_hash
```
❌ 投票結束後才生成 seed — 可被操縱!
✅ 投票開始前公開 seed_hash 作為承諾
   詳見 FISHER_YATES_SPEC.md Anti-Gaming 章節
```

### Mistake 2: 個別投票紀錄未設 TTL
```javascript
// ❌ 永久保存 — 儲存空間無限增長
await KV.put(`vote:${voteId}:individual:${userHash}`, data);

// ✅ 設定 365 天 TTL
await KV.put(`vote:${voteId}:individual:${userHash}`, data, {
  expirationTtl: 86400 * 365  // REWARD.AUDIT_RETENTION_DAYS
});
```

### Mistake 3: 投票結果只存 KV
```
❌ 只存在 KV — Cloudflare 事故可能導致資料遺失
✅ KV + R2 + GitHub 三重備份
```

### Mistake 4: 記錄原始使用者資訊
```javascript
// ❌ 記錄 email
{ "voter": "user@gmail.com" }

// ✅ 只記錄匿名 hash
{ "voter_hash": "sha256..." }
// SECURITY.ANONYMIZE_CONTRIBUTORS = true
```

### Mistake 5: 未處理零投票週期
```
❌ 沒有人投票 → 系統錯誤
✅ total_voters = 0 時:
   - 不執行 Fisher-Yates
   - ranked_articles = []
   - 正常寫入審計紀錄 (記錄「本週期無投票」)
   - seed 正常生成 (維持鏈式依賴)
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 影響團隊 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | - |
| v1.0 | 2026-03-06 | 完整審計日誌規範 | T01, T07 |

---

**文件維護者**: T05 (Reward System Team)
**最後更新**: 2026-03-06
**狀態**: ✅ 完成
