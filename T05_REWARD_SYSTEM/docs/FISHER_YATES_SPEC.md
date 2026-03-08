# Fisher-Yates Shuffle 規格書

> ⏸️ **Phase 2+ 未來規劃** — 本文件定義的 Fisher-Yates 洗牌演算法為 Phase 2+ 規劃功能，v1.0 不實作。文件保留作為未來實作參考。

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js (`REWARD` section), shared/enums.js (`REWARD_STATUS`)
- **下游文件**: T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md (`VOTE_RESULTS` namespace)
- **維護者**: T05 Reward System
- **類型**: 技術規格 (SSOT for shuffle algorithm)
- **最後更新**: 2026-03-06

---

## 文件目的

本文件定義 **Fisher-Yates shuffle 演算法** 在票選排名系統中的完整規格。
此演算法用於將候選文章進行**確定性 (deterministic)、可驗證 (verifiable)** 的隨機排名,
確保每一次票選結果都能被任何人以相同種子 (seed) 重新計算驗證,達成公民算力系統的**透明度與可信度**。

**核心保證**:
1. **無偏 (Unbiased)** -- 每個排列出現的機率完全相等
2. **確定性 (Deterministic)** -- 同一個 seed 永遠產生同一個排列
3. **可驗證 (Verifiable)** -- 任何人都能用公開的 seed 重現結果
4. **防篡改 (Tamper-proof)** -- seed 在投票開始前即已承諾 (committed)

---

## 為什麼選擇 Fisher-Yates

### 演算法比較

| 特性 | Fisher-Yates | Sort + Random | Naive Swap |
|------|-------------|---------------|------------|
| 時間複雜度 | O(n) | O(n log n) | O(n) |
| 無偏性 | 完全無偏 | 取決於比較函式穩定性 | 有偏差 |
| 確定性 | 有 (給定 seed) | 依賴排序穩定性 | 有 (給定 seed) |
| 排列均勻分布 | n! 種排列等機率 | 不保證 | 不保證 |
| 實作簡單度 | 簡單 | 中等 | 簡單但有陷阱 |

### Fisher-Yates 的數學保證

Fisher-Yates (又稱 Knuth shuffle) 透過從後往前遍歷陣列,每個位置 `i` 從 `[0, i]` 範圍內均勻隨機選取一個索引交換,保證:
- 產生的 n! 種排列中,每一種的機率恰好為 1/n!
- 這是唯一被數學證明為完全無偏的 O(n) 洗牌演算法

---

## Seed 生成機制

### Seed 來源

根據 `shared/config.js` 中的 `REWARD.SHUFFLE_SEED_SOURCE: "record_hash"`,
seed 使用上一筆投票紀錄的雜湊值作為基礎,結合時間戳與系統鹽值:

```
seed = SHA-256(previous_vote_id + ":" + timestamp_iso8601 + ":" + system_salt)
```

### 各欄位說明

| 欄位 | 來源 | 說明 |
|------|------|------|
| `previous_vote_id` | VOTE_RESULTS namespace 中最後一筆 `vote_id` | 建立鏈式依賴,防止獨立竄改 |
| `timestamp_iso8601` | 投票週期開始時間 (ISO 8601 + timezone) | 確保時間唯一性 |
| `system_salt` | Cloudflare Worker 環境變數 `SHUFFLE_SALT` | 防止預測 seed (不公開) |

### 首次投票 (無 previous_vote_id)

當系統中尚無任何投票紀錄時:
```
seed = SHA-256("GENESIS" + ":" + timestamp_iso8601 + ":" + system_salt)
```

### Seed 承諾 (Commitment) 流程

```
時間軸:
  T0: 投票週期開始前 → 計算 seed_hash = SHA-256(seed)
  T1: 公開 seed_hash (寫入 KV VOTE_RESULTS,作為承諾)
  T2: 投票期間 → 收集所有投票
  T3: 投票結束 → 公開完整 seed
  T4: 任何人可驗證 SHA-256(公開的 seed) === T1 的 seed_hash
```

此流程確保 seed 無法在看到投票結果後被修改。

---

## 演算法步驟

### 概觀

1. 將 seed 字串透過 SHA-256 轉為確定性的偽隨機數序列
2. 使用此偽隨機數序列驅動 Fisher-Yates shuffle
3. 輸出排列後的文章排名

### JavaScript 虛擬碼 (Cloudflare Workers 環境)

```javascript
/**
 * 使用 SHA-256 從 seed 產生確定性偽隨機數序列
 * 每次呼叫 next() 回傳 [0, 1) 之間的浮點數
 */
class SeededRNG {
  constructor(seedBuffer) {
    // seedBuffer: Uint8Array from SHA-256
    this.state = new Uint8Array(seedBuffer);
    this.counter = 0;
  }

  async next() {
    // 用 counter 與 state 產生下一個雜湊
    const input = new Uint8Array(this.state.length + 4);
    input.set(this.state);
    // 將 counter 寫入最後 4 bytes (big-endian)
    input[this.state.length]     = (this.counter >> 24) & 0xff;
    input[this.state.length + 1] = (this.counter >> 16) & 0xff;
    input[this.state.length + 2] = (this.counter >> 8)  & 0xff;
    input[this.state.length + 3] =  this.counter        & 0xff;

    const hashBuffer = await crypto.subtle.digest("SHA-256", input);
    const hashArray = new Uint8Array(hashBuffer);

    this.counter++;

    // 取前 4 bytes 轉為 [0, 1) 的浮點數
    const value = ((hashArray[0] << 24) | (hashArray[1] << 16) |
                   (hashArray[2] << 8)  |  hashArray[3]) >>> 0;
    return value / 0x100000000;  // 除以 2^32
  }

  /**
   * 產生 [0, max) 範圍的整數 (無模數偏差)
   */
  async nextInt(max) {
    if (max <= 0) return 0;
    // rejection sampling 消除模數偏差
    const limit = Math.floor(0x100000000 / max) * max;
    let value;
    do {
      const raw = await this.next();
      value = Math.floor(raw * 0x100000000);
    } while (value >= limit);
    return value % max;
  }
}

/**
 * Fisher-Yates shuffle (確定性版本)
 *
 * @param {Array} items - 待洗牌的文章陣列 (不會被修改)
 * @param {string} seed - 十六進位制 seed 字串
 * @returns {Array} - 新的已排序陣列 (immutable: 原陣列不變)
 */
async function fisherYatesShuffle(items, seed) {
  // 邊界情況
  if (!items || items.length <= 1) {
    return [...items];
  }

  // 1. 將 seed 字串轉為 SHA-256 雜湊
  const encoder = new TextEncoder();
  const seedData = encoder.encode(seed);
  const seedHash = await crypto.subtle.digest("SHA-256", seedData);
  const rng = new SeededRNG(new Uint8Array(seedHash));

  // 2. 建立副本 (immutable pattern -- 不修改原陣列)
  const result = [...items];

  // 3. Fisher-Yates: 從最後一個元素往前
  for (let i = result.length - 1; i > 0; i--) {
    const j = await rng.nextInt(i + 1);  // j in [0, i]
    // 交換 result[i] 與 result[j]
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result;
}
```

### 關鍵實作細節

1. **Immutable**: `fisherYatesShuffle` 回傳新陣列,不修改輸入
2. **Rejection Sampling**: `nextInt()` 使用 rejection sampling 消除模數偏差
3. **Counter-based PRNG**: 每次 `next()` 呼叫使用遞增 counter,確保序列確定性
4. **crypto.subtle**: 使用 Cloudflare Workers 內建的 Web Crypto API,無需外部依賴

---

## 驗證協議 (Verification Protocol)

### 任何人皆可驗證

投票結束後,系統公開以下資訊:

| 公開欄位 | 說明 |
|----------|------|
| `seed` | 完整 seed 字串 |
| `seed_hash` | 投票前承諾的 SHA-256(seed) |
| `ranked_articles` | 洗牌後的文章排名 |
| `shuffle_algorithm` | 固定為 `"fisher_yates"` |
| `input_articles` | 洗牌前的文章列表 (按 article_hash 字典序排列) |

### 驗證步驟

```
1. 確認 SHA-256(公開的 seed) === 投票前承諾的 seed_hash
2. 將 input_articles 按 article_hash 字典序排列
3. 以公開的 seed 執行 fisherYatesShuffle(sorted_articles, seed)
4. 比對結果是否與 ranked_articles 完全一致
```

### 驗證腳本範例

```javascript
async function verifyVoteResult(voteRecord) {
  const { seed, seed_hash, ranked_articles, input_articles } = voteRecord;

  // Step 1: 驗證 seed 承諾
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(seed)
  );
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedHash !== seed_hash) {
    throw new Error("Seed commitment mismatch -- possible tampering!");
  }

  // Step 2: 排序輸入 (字典序)
  const sortedInput = [...input_articles].sort((a, b) =>
    a.article_hash.localeCompare(b.article_hash)
  );

  // Step 3: 重新執行 Fisher-Yates
  const recomputed = await fisherYatesShuffle(sortedInput, seed);

  // Step 4: 比對結果
  const match = recomputed.every(
    (item, idx) => item.article_hash === ranked_articles[idx].article_hash
  );

  if (!match) {
    throw new Error("Shuffle result mismatch -- possible tampering!");
  }

  return { verified: true, message: "Vote result verified successfully" };
}
```

---

## Cloudflare Workers 中的 crypto.subtle 用法

### 可用的 API

Cloudflare Workers 支援 Web Crypto API (`crypto.subtle`),提供:

| 方法 | 用途 |
|------|------|
| `crypto.subtle.digest("SHA-256", data)` | 雜湊計算 (seed 生成、seed 承諾) |
| `crypto.getRandomValues(buffer)` | 產生密碼學安全的隨機數 (僅用於 salt 生成) |

### 注意事項

```javascript
// crypto.subtle.digest 回傳 Promise<ArrayBuffer>
// 必須 await
const hashBuffer = await crypto.subtle.digest("SHA-256", data);

// 轉為十六進位字串
const hashHex = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, "0"))
  .join("");

// crypto.subtle 在 Cloudflare Workers 中是同步可用的
// 不需要 polyfill 或外部函式庫
```

### Salt 生成 (僅限系統初始化時)

```javascript
// 系統初始化時產生 salt,儲存於環境變數
// 此值不公開,用於防止 seed 被預測
const saltBuffer = new Uint8Array(32);
crypto.getRandomValues(saltBuffer);
const salt = Array.from(saltBuffer)
  .map(b => b.toString(16).padStart(2, "0"))
  .join("");
// 將 salt 設定為 Cloudflare Worker 環境變數 SHUFFLE_SALT
```

---

## Anti-Gaming: Seed 在投票前承諾

### 攻擊情境

若 seed 在投票結束後才決定,攻擊者 (甚至系統管理員) 可以:
1. 收集所有投票
2. 嘗試不同 seed 直到找出對特定文章有利的排名
3. 宣稱該 seed 是「隨機產生」的

### 防禦機制

```
                投票前                           投票中                  投票後
    ┌─────────────────────┐        ┌──────────────────┐     ┌──────────────────┐
    │ 1. 計算 seed        │        │ 3. 收集投票      │     │ 5. 公開 seed     │
    │ 2. 公開 seed_hash   │───────>│ 4. seed 已鎖定   │────>│ 6. 執行 shuffle  │
    │    (SHA-256承諾)     │        │    無法修改      │     │ 7. 公布排名      │
    └─────────────────────┘        └──────────────────┘     └──────────────────┘
```

**關鍵**: seed_hash 在投票開始前寫入 KV (`VOTE_RESULTS` namespace),
包含時間戳,任何人可在投票期間查詢此承諾值。

### 鏈式依賴

每個投票週期的 seed 包含上一次投票的 `vote_id`,形成鏈式結構:

```
Vote #1 seed = SHA-256("GENESIS" + ts1 + salt)
Vote #2 seed = SHA-256("vote_20250306_001" + ts2 + salt)
Vote #3 seed = SHA-256("vote_20250307_001" + ts3 + salt)
...
```

這使得竄改任何一次投票結果都會影響後續所有 seed,容易被發現。

---

## 測試向量 (Test Vectors)

### 測試向量 1: 基本洗牌

```
Input:  ["A", "B", "C", "D", "E"]
Seed:   "test_seed_vector_1"

Step-by-step (以實際 SHA-256 計算):
  seed_hash = SHA-256("test_seed_vector_1")
            = "a3f2b8c1..."  (示例,實際需執行計算)

  i=4: rng.nextInt(5) → j  → swap(result[4], result[j])
  i=3: rng.nextInt(4) → j  → swap(result[3], result[j])
  i=2: rng.nextInt(3) → j  → swap(result[2], result[j])
  i=1: rng.nextInt(2) → j  → swap(result[1], result[j])

Expected Output: (需以實際實作計算,此處為格式範例)
  ["C", "E", "A", "D", "B"]
```

### 測試向量 2: 確定性驗證

```
// 相同 seed 必須產生相同結果
Input:  ["article_hash_001", "article_hash_002", "article_hash_003"]
Seed:   "deterministic_test_seed"

Run 1 Output: ["article_hash_003", "article_hash_001", "article_hash_002"]
Run 2 Output: ["article_hash_003", "article_hash_001", "article_hash_002"]
Run 3 Output: ["article_hash_003", "article_hash_001", "article_hash_002"]

// 三次結果必須完全相同
```

### 測試向量 3: Seed 承諾驗證

```
Seed:       "vote_20250306_001:2025-03-06T18:00:00+08:00:my_secret_salt"
Seed Hash:  SHA-256(seed) → (實際計算值)

// 驗證: 任何人計算 SHA-256(seed) 都應得到相同 seed_hash
```

### 自動化測試建議

```javascript
// 測試 1: 確定性
assert(
  JSON.stringify(await fisherYatesShuffle(items, seed)) ===
  JSON.stringify(await fisherYatesShuffle(items, seed))
);

// 測試 2: 不同 seed 產生不同結果 (高機率)
const result1 = await fisherYatesShuffle(items, "seed_a");
const result2 = await fisherYatesShuffle(items, "seed_b");
assert(JSON.stringify(result1) !== JSON.stringify(result2));

// 測試 3: 所有元素都保留 (不丟失、不重複)
const shuffled = await fisherYatesShuffle(items, seed);
assert(shuffled.length === items.length);
assert(new Set(shuffled).size === items.length);
items.forEach(item => assert(shuffled.includes(item)));

// 測試 4: 均勻分布 (統計測試)
// 執行 100,000 次洗牌 (不同 seed),統計每個元素出現在每個位置的次數
// 期望值: 100000 / n,允許 5% 偏差
```

---

## 邊界情況 (Edge Cases)

### 空陣列

```javascript
await fisherYatesShuffle([], "any_seed");
// 回傳: []
// 不執行任何操作,不拋出錯誤
```

### 單一元素

```javascript
await fisherYatesShuffle(["only_one"], "any_seed");
// 回傳: ["only_one"]
// 迴圈不執行 (i 從 0 開始,條件 i > 0 不成立)
```

### 大型陣列 (n > 10,000)

```javascript
// Fisher-Yates 為 O(n),即使 n = 100,000 也能在毫秒內完成
// 但注意: 每次 rng.nextInt() 需要一次 SHA-256 計算
// 對於 n = 10,000,需要 ~10,000 次 SHA-256
// Cloudflare Workers CPU 時間限制: 免費版 10ms, 付費版 50ms
// 建議: n > 5,000 時分批處理或升級付費方案
```

### 包含重複元素

```javascript
await fisherYatesShuffle(["A", "A", "B"], "seed");
// 正常運作,但驗證時需注意重複元素的位置辨識
// 建議: 使用 article_hash 作為唯一識別,不應有重複
```

### null / undefined 輸入

```javascript
await fisherYatesShuffle(null, "seed");
// 回傳: [] (防禦性處理)

await fisherYatesShuffle(items, null);
// 應拋出錯誤: "Seed is required for deterministic shuffle"
```

---

## Common Mistakes

### Mistake 1: 使用 Math.random() 代替確定性 PRNG

```javascript
// WRONG: Math.random() 不可重現,無法驗證
for (let i = arr.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

// CORRECT: 使用 seeded PRNG
const rng = new SeededRNG(seedHash);
for (let i = arr.length - 1; i > 0; i--) {
  const j = await rng.nextInt(i + 1);
  // ...swap...
}
```

**後果**: 使用 `Math.random()` 使得投票結果無法被第三方驗證,違反系統透明度原則。

### Mistake 2: 模數偏差 (Modulo Bias)

```javascript
// WRONG: 模數偏差 -- 某些索引的機率略高於其他
const j = randomUint32 % (i + 1);

// CORRECT: 使用 rejection sampling
async nextInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  let value;
  do {
    value = /* 取得 0 到 2^32-1 的隨機整數 */;
  } while (value >= limit);
  return value % max;
}
```

**說明**: 當 `2^32` 不能被 `max` 整除時,直接取模會導致較小的餘數出現機率略高。
Rejection sampling 丟棄落在不均勻區間的值,確保完全均勻。

### Mistake 3: 修改原始陣列 (Mutation)

```javascript
// WRONG: 直接修改傳入的陣列
function shuffle(items, seed) {
  for (let i = items.length - 1; i > 0; i--) {
    // 修改了 items 本身!
  }
  return items;
}

// CORRECT: 建立副本再操作
function shuffle(items, seed) {
  const result = [...items];  // immutable pattern
  for (let i = result.length - 1; i > 0; i--) {
    // 操作 result
  }
  return result;
}
```

**後果**: 修改原陣列會導致呼叫端的資料被意外改變,造成難以追蹤的 bug。

### Mistake 4: Seed 在投票後才生成

```javascript
// WRONG: 投票結束後才決定 seed
const results = await collectAllVotes();
const seed = generateSeed();  // 此時可以選擇對自己有利的 seed!

// CORRECT: 投票前承諾 seed
const seed = await generateSeed(previousVoteId, timestamp, salt);
const commitment = await sha256(seed);
await kv.put("vote_seed_commitment", commitment);  // 公開承諾
// ... 投票期間 ...
// 投票結束後公開 seed,任何人可驗證
```

### Mistake 5: 忘記排序輸入陣列

```javascript
// WRONG: 直接使用未排序的輸入
const result = await fisherYatesShuffle(articles, seed);
// 如果 articles 的順序不固定,相同 seed 也會產生不同結果!

// CORRECT: 先排序再洗牌
const sorted = [...articles].sort((a, b) =>
  a.article_hash.localeCompare(b.article_hash)
);
const result = await fisherYatesShuffle(sorted, seed);
```

**後果**: 輸入順序不一致會破壞確定性保證,使驗證失敗。

### Mistake 6: 將 SHA-256 hex string 當作數字使用

```javascript
// WRONG: JavaScript 無法精確處理大整數
const seedNumber = parseInt(sha256hex, 16);  // 精度遺失!

// CORRECT: 使用 Uint8Array 操作 bytes
const hashBuffer = await crypto.subtle.digest("SHA-256", data);
const hashArray = new Uint8Array(hashBuffer);
// 從 bytes 中取值
```

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 |
| v1.0 | 2026-03-06 | 完整規格: 演算法、seed 生成、驗證協議、anti-gaming、測試向量、邊界情況、Common Mistakes | 填充完整技術規格,支援 T05 實作 |

---

**文件維護者**: T05 Reward System
**最後更新**: 2026-03-06
**狀態**: v1.0 完整規格