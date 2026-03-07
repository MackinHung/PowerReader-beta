# Reward Mechanism

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js (`REWARD.*`), shared/enums.js (`REWARD_STATUS`)
- **下游文件**: FISHER_YATES_SPEC.md (票選洗牌), VOTE_AUDIT_LOG.md (審計日誌)
- **相關團隊**: T03 (品質驗證), T04 (前端顯示), T01 (KV Schema)
- **維護者**: T05 (Reward System Team)
- **類型**: SSOT (Single Source of Truth)
- **最後更新**: 2026-03-07

---

## 文件目的

本文件是 **獎勵系統的唯一設計規格書**。定義點數發放規則、投票權利轉換、防作弊機制、以及所有與獎勵相關的資料模型。所有團隊在實作獎勵相關功能時,必須遵循此文件,不可自行定義規則。

**修改此文件時必須通知**: T03, T04, T01

---

## 設計哲學

獎勵系統建立在四大核心原則之上:

### 1. 量的鼓勵 (Quantity Incentive)
每一筆通過品質驗證的分析貢獻,自動獲得 **0.1 點**。低門檻設計的目的是鼓勵參與,讓每位公民都能輕鬆開始貢獻,不需要專業背景。

```
一次有效分析 = 0.1 點
無需額外操作,通過驗證即自動發放
```

### 2. 質的回饋 (Quality Feedback)
未來版本將引入票選加分機制 (vote bonus),讓社群評價高的分析獲得額外倍率獎勵。品質越高,累積速度越快,形成正向循環。

### 3. 防作弊 (Anti-Gaming)
系統內建 **Pre-Check 防作弊閘門** (T05) + **Quality Layer 品質驗證** (T03) 雙層防禦,逐層過濾惡意和低品質提交。詳見本文件「防作弊機制」章節。

### 4. 透明可審計 (Transparency & Auditability)
所有點數變動、投票結果、排名計算,完整記錄於 GitHub 公開倉庫,任何人皆可驗證。演算法、Prompt、審計日誌全部開源 (AGPL-3.0)。

---

## 點數生命週期

### 完整流程

```
使用者裝置 (本地 Qwen3.5-4B, think=false, t=0.5)
    |
    | 1. 本地推理: 使用者選擇一篇新聞, Qwen 在本地分析立場
    v
提交分析結果 (Submit)
    |
    | 2. T05 Pre-Check 防作弊閘門 (先於品質驗證,節省下游 KV 讀取)
    v
+--------------------------------------------------+
| Pre-Check A: 每日上限                              |
|   - 每人每日最多 50 次分析提交                      |
|   - 超過: HTTP 429 "今日分析額度已用完"              |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Pre-Check B: 最低分析時間                           |
|   - 從開啟文章到提交至少 5 秒                       |
|   - 過短: HTTP 400 "分析時間過短" (不計入失敗)       |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Pre-Check C: 文章重複 (article_id)                  |
|   - 同一使用者 + 同一 article_hash = 拒絕           |
|   - HTTP 409 "已分析過此文章"                       |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Pre-Check D: 內容重複 (content_hash, T06 安全修補)  |
|   - 同一使用者 + 同一 content_hash = 拒絕           |
|   - 防止不同來源 URL 轉載相同內容的點數倍增攻擊      |
|   - HTTP 409 "您已分析過相同內容的文章"              |
+--------------------------------------------------+
    | PASS
    v
    | 3. T03 Quality Layer 品質驗證
    v
+--------------------------------------------------+
| Quality Layer 1: JSON 格式驗證                      |
|   - 必要欄位存在? bias_score, controversy_score    |
|   - 型別正確? number, string                       |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Quality Layer 2: 數值範圍驗證                        |
|   - bias_score: 0-100                              |
|   - controversy_score: 0-100                       |
|   - 使用 shared/config.js ANALYSIS.* 常數           |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Quality Layer 3: 一致性檢查                          |
|   - 同一使用者對同 source 或相似文章的評分差異 < 35%  |
|   - 使用 ANALYSIS.SAME_AUTHOR_MAX_DIFF_PCT         |
+--------------------------------------------------+
    | PASS
    v
+--------------------------------------------------+
| Quality Layer 4: 重複提交偵測 (模糊比對)              |
|   - MinHash 相似度 > 85% 的文章群組內不重複計分       |
|   - 與 Pre-Check D (精確 content_hash) 互補          |
+--------------------------------------------------+
    | ALL PASS
    v
點數發放: +0.1 點 (REWARD.POINTS_PER_VALID_ANALYSIS)
    |
    | 4. 累積到 USER_POINTS namespace
    v
累積點數 >= 10 點?
    |
    +-- 是 --> 獲得 1 張投票權 (自動轉換,不可逆)
    |          vote_rights += 1
    |          total_points 不扣除 (持續累積)
    |
    +-- 否 --> 繼續累積
```

### 點數發放規則

| 項目 | 值 | 來源 |
|------|-----|------|
| 每次有效分析獎勵 | 0.1 點 | `REWARD.POINTS_PER_VALID_ANALYSIS` |
| 投票權轉換門檻 | 10 點 = 1 票 | `REWARD.POINTS_PER_VOTE_RIGHT` |
| 投票權發放間隔 | 每 10 點整數倍 | 10, 20, 30... 各得 1 票 |

### 點數計算範例

```
使用者 A 完成 100 次有效分析:
  total_points = 100 * 0.1 = 10.0 點
  vote_rights  = floor(10.0 / 10) = 1 票

使用者 B 完成 253 次有效分析:
  total_points = 253 * 0.1 = 25.3 點
  vote_rights  = floor(25.3 / 10) = 2 票
  (下一張票在 300 次有效分析時取得)
```

---

## 未來倍率機制 (Phase 2+)

以下倍率機制為規劃中功能,初版 (v1.0) 暫不實作。記錄於此以確保架構預留擴展空間。

### 早鳥倍率 (Early Bird Multiplier)
- **倍率**: 1.5x
- **條件**: 文章發布後 24 小時內完成第一筆分析
- **目的**: 激勵即時分析,提高新聞時效性覆蓋

### 稀有來源倍率 (Rare Source Multiplier)
- **倍率**: 2.0x
- **條件**: 分析的新聞來源在該週期內分析數量排名後 20%
- **目的**: 平衡不同媒體的覆蓋率,避免集中於主流媒體

### 高爭議性倍率 (High Controversy Multiplier)
- **倍率**: 1.5x
- **條件**: 文章 `controversy_score >= 50` (`CONTROVERSY_LEVELS.VERY_HIGH`)
- **目的**: 鼓勵分析具爭議性的議題,這些議題最需要多元立場分析

### 倍率疊加規則

```
倍率互相獨立,可疊加:
基礎點數 * early_bird * rare_source * high_controversy

最大可能倍率: 0.1 * 1.5 * 2.0 * 1.5 = 0.45 點/次

注意: 倍率計算結果使用整數分 (cents) 儲存,避免浮點誤差
例如: 0.45 點 = 45 cents (內部), 顯示時除以 100
```

---

## 懲罰機制

### 連續失敗冷卻

| 條件 | 懲罰 |
|------|------|
| 連續 3 次提交未通過品質驗證 | 冷卻 1 小時,期間無法提交新分析 |

### 冷卻機制詳細規則

```
失敗計數器 (consecutive_failures):
  - 每次提交未通過 Pre-Check 或 Quality Layer 任一層: consecutive_failures += 1
  - 提交通過驗證: consecutive_failures = 0 (重置)
  - consecutive_failures >= 3: 觸發冷卻

冷卻期:
  - 起始時間: 第 3 次失敗的時間戳
  - 持續時間: 1 小時 (3600 秒)
  - 冷卻期間提交: 直接回傳 HTTP 429 + 剩餘冷卻時間
  - 冷卻結束後: consecutive_failures 重置為 0

儲存方式:
  使用 USER_POINTS 物件內的 cooldown_until 欄位
  cooldown_until: "2026-03-06T11:00:00+08:00" (冷卻結束時間)
  cooldown_until: null (無冷卻)
  冷卻結束後 cooldown_until 自動清除 (下次請求時檢查)
```

> **注意 (2026-03-07 對齊 M01 跨團隊請求)**: 冷卻機制統一使用 USER_POINTS 物件內的 `cooldown_until` 欄位,不再使用獨立 KV key `user:{user_hash}:cooldown`。這減少了 KV key 數量,簡化了一致性管理。

### 設計考量
- 冷卻期不影響已累積的點數和投票權
- 冷卻期間使用者仍可瀏覽新聞和查看分析結果
- 目的是防止暴力嘗試,而非懲罰使用者

---

> ⏸️ **Phase 2+ 未來規劃** — 以下投票權利章節為 Phase 2+ 規劃功能，v1.0 不實作。v1.0 僅計算並顯示 `vote_rights`，但不開放投票功能。

## 投票權利

### 轉換規則

```
10 點 = 1 張投票權 (REWARD.POINTS_PER_VOTE_RIGHT = 10)
```

- **不可逆**: 投票權一旦取得,永久保留,不因點數變動而收回
- **不可退回**: 已使用的投票權不可退回或重新分配
- **獨立計算**: `vote_rights = floor(total_points / 10)`,與已使用的票數無關

### 投票週期

| 項目 | 規則 |
|------|------|
| 週期長度 | 每週一次 |
| 起始日 | 週一 00:00:00 Asia/Taipei |
| 結束日 | 週日 23:59:59 Asia/Taipei |
| 時區 | Asia/Taipei (UTC+8),使用 `shared/config.js LOCALIZATION.DEFAULT_TIMEZONE` |
| 投票次數 | 每週期每人可投 1 票 (消耗 1 vote_right) |
| 未使用票數 | 不累積到下週期,但 vote_rights 本身不過期 |

### 投票標的

使用者投票選出該週期內「最具價值的分析文章」。投票結果用於排名,排名使用 Fisher-Yates 洗牌處理同票文章 (詳見 `FISHER_YATES_SPEC.md`)。

### 投票流程

```
1. 每週一 00:00 (Asia/Taipei) 新週期開始
2. 系統列出該週期內所有已通過驗證 (status=validated) 的文章
3. 擁有 vote_rights > 0 的使用者可投票
4. 每人每週期限投 1 票
5. 週日 23:59:59 截止投票
6. 系統計票 -> Fisher-Yates 洗牌同票文章 -> 產生排名
7. 排名結果 commit 至 GitHub + 寫入 VOTE_AUDIT_LOG
```

---

## KV 資料模型

### USER_POINTS Namespace

遵循 `T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md` 定義,以下為 T05 使用的完整欄位:

**Key 格式**: `user:{user_hash}`

```javascript
{
  // === 身份識別 (匿名化) ===
  "user_hash": "sha256_of_google_uid",     // Google OAuth UID 的 SHA-256

  // === 點數資訊 ===
  "total_points": 1230,                     // 整數分 (cents), 1230 = 12.30 點
  "contribution_count": 123,                // 有效分析總次數
  "vote_rights": 1,                         // 已取得的投票權數量
  "votes_used": 0,                          // 已使用的投票權數量

  // === 防作弊欄位 ===
  "daily_analysis_count": 5,                // 當日已提交分析數 (每日 UTC+8 00:00 重置)
  "daily_analysis_date": "2026-03-06",      // 當日日期 (用於重置判斷)
  "consecutive_failures": 0,                // 連續失敗次數
  "cooldown_until": null,                   // 冷卻結束時間 (null = 無冷卻)

  // === 時間戳 ===
  "last_contribution_at": "2026-03-06T10:00:00+08:00",
  "created_at": "2026-03-01T00:00:00+08:00",
  "updated_at": "2026-03-06T10:00:00+08:00"
}
```

### 原子更新 (Atomic Updates)

Cloudflare KV 不支援原生事務。必須使用以下模式確保一致性:

```javascript
// 正確: Read-Modify-Write 搭配 ETag 樂觀鎖
async function addPoints(env, userHash, pointsCents) {
  const key = `user:${userHash}`;

  // 1. 讀取目前值
  const { value: current, metadata } = await env.USER_POINTS.getWithMetadata(key, "json");

  if (!current) {
    throw new Error(`User not found: ${userHash}`);
  }

  // 2. 建立新物件 (不可變更新!)
  const updated = {
    ...current,
    total_points: current.total_points + pointsCents,
    contribution_count: current.contribution_count + 1,
    vote_rights: Math.floor((current.total_points + pointsCents) / 1000), // 1000 cents = 10 點
    last_contribution_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // 3. 寫回 (KV 最終一致性,單一 Worker 內為原子)
  await env.USER_POINTS.put(key, JSON.stringify(updated));

  return updated;
}
```

**關鍵注意**:
- 使用不可變更新 (spread operator 建立新物件),原始物件不被修改
- `total_points` 使用 **整數分 (cents)**,1000 cents = 10.00 點,避免浮點誤差
- `vote_rights` 每次更新時重新計算,確保與 `total_points` 同步

---

## 排行榜

### 匿名化顯示

排行榜使用 `user_hash` 的前 8 個字元作為匿名顯示名稱,保護使用者隱私:

```
排行榜顯示範例:
┌──────┬──────────┬────────┬──────────────┐
│ 排名 │ 使用者   │ 貢獻數 │ 累積點數     │
├──────┼──────────┼────────┼──────────────┤
│  1   │ a1b2c3d4 │  523   │ 52.3 點      │
│  2   │ e5f6g7h8 │  412   │ 41.2 點      │
│  3   │ i9j0k1l2 │  389   │ 38.9 點      │
└──────┴──────────┴────────┴──────────────┘
```

### 排行榜規則

- **顯示名稱**: `user_hash.substring(0, 8)` (前 8 字元)
- **排序依據**: `total_points` 降序
- **更新頻率**: 每小時更新一次 (避免頻繁 KV 讀取)
- **顯示數量**: Top 100
- **隱私保護**: 符合 `shared/config.js SECURITY.ANONYMIZE_CONTRIBUTORS = true`

---

## 防作弊機制

### Pre-Check 防作弊閘門總覽 (T05 負責)

> **命名對齊 (2026-03-07)**: 依 M01 跨團隊請求,T05 閘門統一命名為 **Pre-Check A/B/C/D**,與 T03 的 **Quality Layer 1-4** 區分。執行順序: T05 Pre-Check → T03 Quality Layer。

| 層級 | 名稱 | 檢查內容 | 攔截目標 |
|------|------|---------|---------|
| Pre-Check A | 每日上限 | 每人每日最多 50 次分析提交 | 批量灌水 |
| Pre-Check B | 最低分析時間 | 從開啟文章到提交分析至少 5 秒 | 自動化腳本 |
| Pre-Check C | 文章重複 | 同一使用者 + 同一 article_hash = 拒絕 | 重複提交 |
| Pre-Check D | 內容重複 | 同一使用者 + 同一 content_hash = 拒絕 (T06 安全修補) | 轉載來源點數倍增 |

> **注意**: 一致性檢查 (原 Gate 3) 和 Sybil 抵抗 (原 Gate 4) 分別歸屬 T03 Quality Layer 3 和 T06,非 T05 職責。

### Pre-Check A: 每日分析上限

```
每人每日最多 50 次分析提交
超過限制: HTTP 429 "今日分析額度已用完,明天再來"
重置時間: 每日 00:00 Asia/Taipei (UTC+8)

KV 檢查:
  if (user.daily_analysis_date !== today) {
    // 新的一天,重置計數器
    user.daily_analysis_count = 0;
    user.daily_analysis_date = today;
  }
  if (user.daily_analysis_count >= 50) {
    return reject("每日上限 50 次");
  }
```

### Pre-Check B: 最低分析時間

```
從使用者開啟文章頁面到提交分析結果,至少須經過 5 秒
小於 5 秒: 拒絕 + 不計入失敗次數 (因為太明顯是腳本)

前端記錄:
  article_opened_at = Date.now()

提交時驗證:
  time_spent_ms = submit_time - article_opened_at
  if (time_spent_ms < 5000) {
    return reject("分析時間過短");
  }
```

### Pre-Check C: 文章重複 (article_id)

```
同一使用者 + 同一 article_hash = 拒絕
HTTP 409 "已分析過此文章"

KV 檢查:
  key = analysis:{user_hash}:{article_hash}
  if (exists) return reject("已分析過此文章");
```

### Pre-Check D: 內容重複 (content_hash)

> **T06 安全修補 (2026-03-07)**: 防止「轉載來源點數倍增攻擊」— 同一篇新聞由不同媒體轉載時，article_id 不同但 content_hash 相同，攻擊者可透過提交各轉載版本取得多次獎勵。

```
同一使用者 + 同一 content_hash = 拒絕
HTTP 409 "您已分析過相同內容的文章"

KV 檢查:
  key = analysis:{user_hash}:{content_hash}
  if (exists) return reject("您已分析過相同內容的文章");

注意: 此為精確 content_hash 比對。
模糊比對 (MinHash similarity > 85%) 由 T03 Quality Layer 4 負責。
```

### 參考: T03 品質驗證層 (非 T05 職責)

以下驗證由 T03 負責，T05 僅需知道結果 (`quality_gate_result: "passed"`):

- **Quality Layer 3: 一致性檢查** — 同 source + similarity cluster 雙維度 bias_score 差異 < 35%
- **Quality Layer 4: 重複偵測 (模糊)** — MinHash 相似度 > 85% 群組內不重複計分

### 參考: T06 Sybil 抵抗 (非 T05 職責)

- **Google OAuth 綁定** — `user_hash = SHA-256(google_uid)`，一人一帳號
- Google 帳號建立有手機驗證門檻，提高女巫攻擊成本

---

## 跨團隊整合介面

### T03 (AI Inference) -> T05

T03 負責執行 4 層品質驗證,驗證結果傳遞給 T05 進行點數計算:

```javascript
// T03 品質驗證結果格式
{
  "article_hash": "sha256...",
  "user_hash": "sha256...",
  "quality_gate_result": "passed",  // 使用 shared/enums.js QUALITY_GATE_RESULTS
  "quality_scores": {
    "format_valid": true,           // Layer 1
    "range_valid": true,            // Layer 2
    "consistency_valid": true,      // Layer 3
    "duplicate_valid": true         // Layer 4
  },
  "validated_at": "2026-03-06T10:05:00+08:00"
}

// T05 收到 "passed" 後:
//   1. 執行 Pre-Check A~D 防作弊檢查
//   2. 通過 -> addPoints(env, user_hash, 10)  // 10 cents = 0.1 點
//   3. 更新 REWARD_STATUS: "pending" -> "earned"
```

### T04 (Frontend) -> T05

T04 前端需顯示以下 T05 提供的資料:

| 顯示項目 | 資料來源 | 更新頻率 |
|---------|---------|---------|
| 我的點數 | `USER_POINTS.total_points / 100` | 即時 (每次分析後) |
| 我的投票權 | `USER_POINTS.vote_rights - USER_POINTS.votes_used` | 即時 |
| 排行榜 | 排行榜 API | 每小時 |
| 投票結果 | `VOTE_RESULTS` namespace | 每週一次 |
| 冷卻狀態 | `USER_POINTS.cooldown_until` | 即時 |

### T01 (System Architecture) -> T05

T05 使用 T01 定義的兩個 KV Namespace:

| Namespace | 用途 | 讀/寫 |
|-----------|------|-------|
| `USER_POINTS` | 使用者點數與貢獻紀錄 | 讀寫 |
| `VOTE_RESULTS` | 投票結果與審計紀錄 | 寫入 |

---

## Common Mistakes

### Mistake 1: 使用浮點數儲存點數

```javascript
// 錯誤: 浮點數累加會產生精度問題
let totalPoints = 0;
for (let i = 0; i < 100; i++) {
  totalPoints += 0.1;
}
console.log(totalPoints); // 9.99999999999998 (不是 10.0!)

// 正確: 使用整數分 (cents)
let totalCents = 0;
for (let i = 0; i < 100; i++) {
  totalCents += 10;  // 10 cents = 0.1 點
}
console.log(totalCents);          // 1000 (精確)
console.log(totalCents / 100);    // 10.0 (顯示用)
```

**教訓**: 所有點數計算在內部使用整數分 (cents),1 點 = 100 cents,0.1 點 = 10 cents。僅在顯示給使用者時才除以 100。

### Mistake 2: 並發更新導致點數遺失

```javascript
// 錯誤: 兩個 Worker 同時讀取相同使用者,寫回時覆蓋彼此
// Worker A: read total=100, write total=110
// Worker B: read total=100, write total=110  (A 的更新被覆蓋!)

// 正確: KV 單一 Worker 內是原子的,跨 Worker 需接受最終一致性
// 或使用 Durable Objects 做強一致性 (Phase 2+)
```

**教訓**: Cloudflare KV 是最終一致性儲存。對於點數更新這種低頻操作 (每次分析後才觸發),KV 的一致性延遲 (通常 < 60 秒) 是可接受的。若未來需要強一致性,升級為 Durable Objects。

### Mistake 3: 不設每日分析上限

```javascript
// 錯誤: 無上限,允許無限提交
// 攻擊者用腳本 24 小時不間斷提交,耗盡 KV 寫入額度 (免費方案 1000 次/天)

// 正確: 每人每日 50 次上限
// 50 人 * 50 次 = 2500 次/天 (但 KV 寫入包含點數更新,需控制總量)
// 配合 Pre-Check B 最低 5 秒限制: 50 次 * 5 秒 = 最少 250 秒 = 4 分鐘
```

**教訓**: 每日上限不僅防止作弊,更保護 Cloudflare KV 免費方案的寫入限額 (`CLOUDFLARE.KV_DAILY_WRITE_LIMIT = 1000`)。

### Mistake 4: 在 KV value 中儲存過多歷史紀錄

```javascript
// 錯誤: 把每一筆分析紀錄都存在 user value 裡
{
  "analyses": [
    { "article_hash": "...", "score": 65, "at": "..." },
    { "article_hash": "...", "score": 72, "at": "..." },
    // ... 數千筆紀錄, value 超過 KV 25MB 限制
  ]
}

// 正確: user value 只存聚合數據, 去重紀錄用獨立 key
// user:{user_hash} -> 聚合數據 (total_points, contribution_count)
// article:{user_hash}:{article_hash} -> 文章去重 (Pre-Check C)
// analysis:{user_hash}:{content_hash} -> 內容去重 (Pre-Check D)
```

**教訓**: KV value 大小有限制,聚合數據與明細數據必須分離儲存。

### Mistake 5: 忽略 KV 寫入預算

```javascript
// 錯誤: 沒有意識到 T05 只有 150 次寫入/天 (shared/config.js KV_WRITE_BUDGET.T05_REWARD)
// 每次成功提交 = 3 次 KV 寫入:
//   1. putUserRecord (user:{user_hash})
//   2. recordAnalysis article key (article:{user_hash}:{article_hash})
//   3. recordAnalysis content key (analysis:{user_hash}:{content_hash})
// 150 / 3 = 50 次成功提交/天 (全系統所有使用者合計!)

// 正確: 初期使用者少時可接受, 但擴展時需要:
//   方案 A: 升級 KV 為付費方案 (寫入上限大幅提升)
//   方案 B: 將 dedup key 改存 D1 (D1 寫入限額更高)
//   方案 C: 合併 dedup key 到單一 KV 寫入 (JSON 陣列)
```

**教訓**: 免費方案 KV 寫入限額 1000 次/天由 5 個團隊共享。T05 分配到 150 次/天,每次成功提交消耗 3 次寫入。務必監控寫入量,接近上限時降級。

### Mistake 6: 單位不一致導致靜默 bug

```javascript
// 錯誤: config.js 使用秒, 程式碼使用毫秒, 直接比較
const minTime = config.REWARD.MIN_ANALYSIS_TIME_SEC; // 5 (秒)
if (timeSpentMs < minTime) { ... }  // 比較 5000ms < 5 → 永遠 false!

// 正確: 統一使用毫秒, 或明確轉換
const minTimeMs = config.REWARD.MIN_ANALYSIS_TIME_MS; // 5000 (毫秒)
if (timeSpentMs < minTimeMs) { ... }  // 正確比較
```

**教訓**: 時間單位必須統一。建議所有 config 常數使用與 API 參數相同的單位 (毫秒),避免隱式轉換。已向 T01 提出修正請求 (`20260307_1510_T05_to_T01_min_analysis_time_discrepancy.md`)。

### Mistake 7: 條件檢查形同虛設

```javascript
// 錯誤: 把必要的安全檢查包在 if (contentHash) 裡
if (contentHash) {
  const isDup = await hasContentDuplicate(kv, userHash, contentHash);
  if (isDup) return reject();
}
// 攻擊者送 contentHash = null 或 "" → 完全繞過 Pre-Check D!

// 正確: API 層驗證 + 邏輯層無條件執行
// api.js: 驗證 content_hash 必填 + SHA-256 格式
// points.js: 直接執行 hasContentDuplicate(), 不加 if guard
```

**教訓**: 安全關鍵的 Pre-Check 不可使用 optional guard。必填欄位在 API 入口驗證,邏輯層假設欄位已通過驗證。T06 QA 發現此問題並要求修復。

### Mistake 8: 缺少分析時間上限

```javascript
// 錯誤: 只檢查下限,不檢查上限
if (timeSpentMs < 5000) return reject("太短");
// 攻擊者可送 time_spent_ms = Number.MAX_SAFE_INTEGER

// 正確: 同時檢查上下限
if (timeSpentMs < 5000) return reject("太短");
if (timeSpentMs > 3600000) return reject("異常");  // 1 小時上限
```

**教訓**: 數值型輸入必須同時驗證上下界。1 小時上限足以涵蓋所有正常使用場景。

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 | 影響團隊 |
|------|------|---------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 | - |
| v1.0 | 2026-03-06 | 完整設計文檔 | 定義點數生命週期、防作弊、KV 模型、跨團隊介面 | T01, T03, T04 |
| v1.1 | 2026-03-07 | 冷卻機制統一為 USER_POINTS.cooldown_until; Gate 3 一致性檢查擴充為雙維度 (同 source + similarity cluster); 投票相關章節標記 Phase 2+ | M01 跨團隊審查: 消除冷卻 KV key 雙重定義; 與 T03 QUALITY_GATES.md 對齊一致性檢查邏輯; 投票系統延後決策 | T01, T03, T04 |
| v1.2 | 2026-03-07 | Gate 1-4 命名統一為 Pre-Check A-D; 新增 Pre-Check C (article dedup) 和 Pre-Check D (content_hash dedup); 流程圖更新為雙層架構 (T05 Pre-Check → T03 Quality Layer); 一致性檢查和 Sybil 抵抗標記為非 T05 職責 | M01 命名統一請求 + T06 安全修補 (轉載來源點數倍增攻擊) | T01, T03, T06 |
| v1.3 | 2026-03-07 | QA 修復: SHA-256 格式驗證 (api.js); 移除 contentHash optional guard (T06 FIX 1); 新增 dedup rejection logging (T06 FIX 2); time_spent_ms 上限 1h; 匯出 DAILY_ANALYSIS_LIMIT + MAX_ANALYSIS_TIME_MS 常數; JSON parse try-catch; /me SHA-256 驗證 | QA 三方審查: code reviewer + security reviewer + integration contract reviewer | T01, T03, T06 |
| v2.0 | 2026-03-07 | **KV→D1 遷移**: 儲存層從 KV (USER_POINTS) 遷移至 D1 (users + reward_dedup 表); Repository pattern (createD1Repository); D1 batch 原子交易取代雙 KV write; article_hash→article_id SSOT 統一; total_points→total_points_cents 命名對齊; 新增 0003_t05_reward.sql migration; 移除 KV 綁定 | T06 Round 3 CRITICAL: KV 寫入預算耗盡 (1,350/day vs 150 budget); KV_SCHEMA.md v2.0 明確規定 KV 為 cache-only | T01, T06 |

---

**重要提醒**:
修改此文件前,必須:
1. 提 GitHub PR 討論
2. 通知所有下游團隊 (T03, T04, T01)
3. 更新 MASTER_ROADMAP.md 決策紀錄
4. M01 審查跨團隊影響
5. 同步更新 `shared/config.js` 中的 `REWARD.*` 常數

---

**文件維護者**: T05 (Reward System Team)
**最後更新**: 2026-03-07
**下次審查**: 階段 5 結束時
