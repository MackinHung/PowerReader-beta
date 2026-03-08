# T05 Common Mistakes

**維護者**: T05 (Reward System Team)
**最後更新**: 2026-03-08

> 踩雷經驗回寫。所有 Agent 在 T05 模組工作前必讀此文件。

---

## Mistake 1: 使用浮點數儲存點數

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

**教訓**: 所有點數在內部使用整數分 (cents)。1 點 = 100 cents，0.1 點 = 10 cents。僅在 `centsToDisplayPoints()` 顯示時除以 100。

---

## Mistake 2: 條件檢查形同虛設 (Pre-Check D 繞過)

```javascript
// 錯誤: 把安全檢查包在 if (contentHash) 裡
if (contentHash) {
  const isDup = await repo.hasContentDuplicate(userHash, contentHash);
  if (isDup) return reject();
}
// 攻擊者送 contentHash = null → 完全繞過 Pre-Check D!

// 正確: API 層驗證 + 邏輯層無條件執行
// api.js: 驗證 content_hash 必填 + SHA-256 格式
// reward-flow.js: 直接執行 hasContentDuplicate(), 不加 if guard
```

**教訓**: 安全關鍵的 Pre-Check 不可使用 optional guard。必填欄位在 `api.js` 入口驗證，業務邏輯層假設欄位已通過驗證。T06 QA 發現此問題。

---

## Mistake 3: 缺少分析時間上限

```javascript
// 錯誤: 只檢查下限
if (timeSpentMs < 5000) return reject("太短");
// 攻擊者可送 time_spent_ms = Number.MAX_SAFE_INTEGER

// 正確: 同時檢查上下限
if (timeSpentMs < 5000) return reject("太短");
if (timeSpentMs > 3600000) return reject("異常");  // 1 小時上限
```

**教訓**: 數值型輸入必須同時驗證上下界。`MAX_ANALYSIS_TIME_MS = 3600000` (1 小時)。

---

## Mistake 4: 單位不一致導致靜默 bug

```javascript
// 錯誤: config 使用秒, 程式碼使用毫秒
const minTime = config.REWARD.MIN_ANALYSIS_TIME_SEC; // 5 (秒)
if (timeSpentMs < minTime) { ... }  // 比較 5000ms < 5 → 永遠 false!

// 正確: 統一使用毫秒
const minTimeMs = 5000;  // points-calculation.js 常數
if (timeSpentMs < minTimeMs) { ... }
```

**教訓**: 時間單位必須統一為毫秒 (ms)。常數定義在 `points-calculation.js`。

---

## Mistake 5: D1 batch 操作順序錯誤

```javascript
// 錯誤: 先寫 dedup 再更新 user — 如果 user update 失敗，dedup 已寫入
await db.prepare("INSERT INTO reward_dedup ...").run();
await db.prepare("UPDATE users SET ...").run();

// 正確: 使用 D1 batch() 確保原子性
await db.batch([
  db.prepare("UPDATE users SET ..."),
  db.prepare("INSERT INTO reward_dedup ..."),
]);
```

**教訓**: `persistReward()` 使用 `db.batch()` 將 user update + dedup insert 包裝為原子操作。任一失敗則全部回滾。

---

## Mistake 6: 忘記清除過期冷卻

```javascript
// 錯誤: 直接檢查 cooldown_until，不清除已過期的值
if (record.cooldown_until) {
  return reject("冷卻中");  // 冷卻早已過期但欄位沒清除 → 永久封鎖!
}

// 正確: 先清除過期冷卻，再檢查
record = clearExpiredCooldown(record, now);
const { inCooldown } = checkCooldown(record, now);
if (inCooldown) { ... }
```

**教訓**: `processAnalysisReward()` 和 `processAnalysisFailure()` 開頭都必須呼叫 `clearExpiredCooldown()`。

---

## Mistake 7: 直接操作 D1 而非透過 repository

```javascript
// 錯誤: 在業務邏輯中直接寫 SQL
const row = await env.DB.prepare("SELECT * FROM users WHERE ...").first();

// 正確: 透過 repository.js 抽象層
const repo = createD1Repository(env.DB);
const row = await repo.getUser(userHash);
```

**教訓**: 所有 D1 操作封裝在 `repository.js`。業務邏輯 (`reward-flow.js`) 不應包含 SQL。這使得未來切換儲存後端 (如 Durable Objects) 只需替換 repository 實作。

---

## Mistake 8: 忽略 T01 雙重實作問題

```
⚠️ 已知問題: T01 的 src/workers/handlers/rewards.js 重新實作了 T05 的邏輯。
兩份實作的 Pre-Check 覆蓋度不同 (T01 缺少 content_hash dedup)。

修復方向: T01 應 import T05 的 processAnalysisReward()，不應自行實作。
狀態: 待 M01 協調跨團隊統一。
```

**教訓**: SSOT 原則 — 獎勵邏輯只在 T05 定義一次。T01 只負責路由轉發。
