# Quality Gates

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js, T03_AI_INFERENCE/PROMPT_VERSIONS.md
- **下游文件**: T05_REWARD_SYSTEM/REWARD_MECHANISM.md (只有 "passed" 才給點數), T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md (quality_gate_result 欄位)
- **維護者**: T03 (AI Inference Team)
- **類型**: 技術規格
- **最後更新**: 2026-03-07

---

## 文件目的

這是 **AI 分析結果品質驗證的唯一定義**。
所有分析結果必須通過此 4 層驗證,才能標記為 "passed" 並觸發獎勵。

品質驗證在用戶端完成分析後、寫入 D1 之前執行。
驗證失敗的結果仍會寫入 D1 (供審計),但 `quality_gate_result` 欄位會標記失敗原因。

**修改此文件時必須通知**: T01 (KV Schema / D1 Schema), T05 (獎勵觸發條件)

---

## 4 層驗證架構總覽

```
Layer 1: Format Validation (格式驗證)
  ↓ pass
Layer 2: Range Validation (範圍驗證)
  ↓ pass
Layer 3: Consistency Validation (一致性驗證)
  ↓ pass
Layer 4: Duplicate Validation (重複驗證)
  ↓ pass
Result: "passed" → 寫入 D1 + 觸發 0.1 點獎勵
```

**短路邏輯**: 任一層失敗即停止後續驗證,回傳該層對應的失敗狀態碼。
失敗狀態碼定義於 `shared/enums.js QUALITY_GATE_RESULTS`。

---

## Layer 1: Format Validation (格式驗證)

**目的**: 確保 AI 模型輸出為合法 JSON,且包含所有必要欄位和正確型別。

**失敗狀態碼**: `failed_format`

### 驗證規則

| 檢查項目 | 規則 | 失敗原因 |
|---------|------|---------|
| JSON 合法性 | `JSON.parse()` 不拋出錯誤 | 模型輸出了自然語言而非 JSON |
| 必要欄位存在 | 6 個欄位全部存在 | 模型漏生成了欄位 |
| 型別正確 | 每個欄位型別符合預期 | 模型把數字生成為字串等 |

### 必要欄位與型別

| 欄位 | 預期型別 | 驗證方式 |
|------|---------|---------|
| `bias_score` | `number` (integer) | `typeof === 'number' && Number.isInteger()` |
| `bias_category` | `string` | `typeof === 'string'` |
| `controversy_score` | `number` (integer) | `typeof === 'number' && Number.isInteger()` |
| `controversy_level` | `string` | `typeof === 'string'` |
| `reasoning` | `string` | `typeof === 'string'` |
| `key_phrases` | `array of string` | `Array.isArray() && every item is string` |

### 程式碼範例

```javascript
import { QUALITY_GATE_RESULTS } from '../shared/enums.js';

function validateFormat(rawOutput) {
  // Step 1: JSON parse
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch (e) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `JSON parse error: ${e.message}`
    };
  }

  // Step 2: Required fields
  const REQUIRED_FIELDS = [
    'bias_score', 'bias_category', 'controversy_score',
    'controversy_level', 'reasoning', 'key_phrases'
  ];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) {
      return {
        passed: false,
        result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
        reason: `Missing required field: ${field}`
      };
    }
  }

  // Step 3: Type validation
  if (typeof parsed.bias_score !== 'number' || !Number.isInteger(parsed.bias_score)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `bias_score must be integer, got: ${typeof parsed.bias_score}`
    };
  }

  if (typeof parsed.controversy_score !== 'number' || !Number.isInteger(parsed.controversy_score)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `controversy_score must be integer, got: ${typeof parsed.controversy_score}`
    };
  }

  if (typeof parsed.bias_category !== 'string') {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `bias_category must be string`
    };
  }

  if (typeof parsed.controversy_level !== 'string') {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `controversy_level must be string`
    };
  }

  if (typeof parsed.reasoning !== 'string') {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `reasoning must be string`
    };
  }

  if (!Array.isArray(parsed.key_phrases) || !parsed.key_phrases.every(p => typeof p === 'string')) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_FORMAT,
      reason: `key_phrases must be array of strings`
    };
  }

  return { passed: true, parsed };
}
```

---

## Layer 2: Range Validation (範圍驗證)

**目的**: 確保所有數值在合法範圍內,類別值與分數對應正確。

**失敗狀態碼**: `failed_range`

### 驗證規則

| 檢查項目 | 規則 | 來源 |
|---------|------|------|
| `bias_score` 範圍 | 0-100 (整數) | `shared/config.js ANALYSIS.BIAS_SCORE_MIN/MAX` |
| `controversy_score` 範圍 | 0-100 (整數) | `shared/config.js ANALYSIS.CONTROVERSY_MIN/MAX` |
| `bias_category` 合法值 | 必須為 7 個值之一 | `shared/enums.js BIAS_CATEGORIES` |
| `bias_category` 與 `bias_score` 一致 | `getBiasCategory(score)` 結果必須等於 `bias_category` | `shared/enums.js getBiasCategory()` |
| `controversy_level` 合法值 | 必須為 4 個值之一 | `shared/enums.js CONTROVERSY_LEVELS` |
| `controversy_level` 與 `controversy_score` 一致 | `getControversyLevel(score)` 結果必須等於 `controversy_level` | `shared/enums.js getControversyLevel()` |
| `reasoning` 長度 | 10-200 字元 | Prompt 設計限制 |
| `key_phrases` 數量 | 1-10 個項目 | 過少 = 未分析;過多 = 幻覺風險 |

### 程式碼範例

```javascript
import { isValidBiasScore, isValidControversyScore } from '../shared/config.js';
import {
  BIAS_CATEGORIES, CONTROVERSY_LEVELS,
  getBiasCategory, getControversyLevel,
  QUALITY_GATE_RESULTS
} from '../shared/enums.js';

function validateRange(parsed) {
  // Score ranges
  if (!isValidBiasScore(parsed.bias_score)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `bias_score ${parsed.bias_score} out of range [0, 100]`
    };
  }

  if (!isValidControversyScore(parsed.controversy_score)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `controversy_score ${parsed.controversy_score} out of range [0, 100]`
    };
  }

  // Category validity
  if (!Object.values(BIAS_CATEGORIES).includes(parsed.bias_category)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `Invalid bias_category: ${parsed.bias_category}`
    };
  }

  if (!Object.values(CONTROVERSY_LEVELS).includes(parsed.controversy_level)) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `Invalid controversy_level: ${parsed.controversy_level}`
    };
  }

  // Score-category consistency
  const expectedCategory = getBiasCategory(parsed.bias_score);
  if (parsed.bias_category !== expectedCategory) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `bias_category mismatch: score ${parsed.bias_score} should be "${expectedCategory}", got "${parsed.bias_category}"`
    };
  }

  const expectedLevel = getControversyLevel(parsed.controversy_score);
  if (parsed.controversy_level !== expectedLevel) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `controversy_level mismatch: score ${parsed.controversy_score} should be "${expectedLevel}", got "${parsed.controversy_level}"`
    };
  }

  // Reasoning length (character count, not byte count -- CJK chars count as 1)
  const reasoningLen = parsed.reasoning.length;
  if (reasoningLen < 10 || reasoningLen > 200) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `reasoning length ${reasoningLen} out of range [10, 200]`
    };
  }

  // Key phrases count
  const phrasesCount = parsed.key_phrases.length;
  if (phrasesCount < 1 || phrasesCount > 10) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_RANGE,
      reason: `key_phrases count ${phrasesCount} out of range [1, 10]`
    };
  }

  return { passed: true };
}
```

---

## Layer 3: Consistency Validation (一致性驗證)

**目的**: 檢測分析結果是否與同一作者/來源的歷史分析一致,識別離群值。

**失敗狀態碼**: `failed_consistency`

### 驗證規則

| 檢查項目 | 規則 | 來源 |
|---------|------|------|
| 同作者同來源差異 | 同一 user 對同一 source 的 bias_score 歷史差異 < 35% | `shared/config.js ANALYSIS.SAME_AUTHOR_MAX_DIFF_PCT` |
| 離群值偵測 | 同一文章多人分析的 bias_score, 若超出平均值 2 個標準差則標記 | 統計學常規 (2-sigma rule) |
| 歷史穩定性 | 同一用戶最近 10 次分析的 bias_score 波動不超過 +/-15% | 防止隨機亂分 |

### 同作者同來源差異檢查

```javascript
/**
 * 檢查同一用戶對同一來源的分析是否一致
 * @param {number} currentScore - 當前分析的 bias_score
 * @param {string} userHash - 匿名用戶 hash
 * @param {string} source - 新聞來源
 * @param {object} db - Cloudflare D1 database binding (env.DB)
 */
async function checkAuthorConsistency(currentScore, userHash, source, db) {
  // 取得該用戶對同一來源的歷史分析 (D1 SQL query)
  const { results: history } = await db.prepare(
    'SELECT bias_score FROM analyses WHERE user_hash = ? AND article_id IN (SELECT article_id FROM articles WHERE source = ?) ORDER BY created_at DESC LIMIT 10'
  ).bind(userHash, source).all();

  if (history.length === 0) {
    return { passed: true, reason: 'No history for comparison' };
  }

  // 計算歷史平均
  const avgScore = history.reduce((sum, h) => sum + h.bias_score, 0) / history.length;

  // 差異百分比
  const diffPct = Math.abs(currentScore - avgScore) / 100;
  const MAX_DIFF = 0.35;  // ANALYSIS.SAME_AUTHOR_MAX_DIFF_PCT

  if (diffPct > MAX_DIFF) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_CONSISTENCY,
      reason: `Author consistency check failed: current=${currentScore}, avg=${avgScore.toFixed(1)}, diff=${(diffPct * 100).toFixed(1)}% > ${MAX_DIFF * 100}%`
    };
  }

  return { passed: true };
}
```

### 離群值偵測 (2-Sigma Rule)

```javascript
/**
 * 檢查當前分析是否為離群值 (相對於同篇文章的其他分析)
 * @param {number} currentScore - 當前分析的 bias_score
 * @param {number[]} allScores - 同篇文章所有 bias_score
 */
function checkOutlier(currentScore, allScores) {
  if (allScores.length < 3) {
    return { passed: true, reason: 'Not enough data for outlier detection (need >= 3)' };
  }

  const mean = allScores.reduce((s, v) => s + v, 0) / allScores.length;
  const variance = allScores.reduce((s, v) => s + (v - mean) ** 2, 0) / allScores.length;
  const stdDev = Math.sqrt(variance);

  const zScore = Math.abs(currentScore - mean) / stdDev;

  if (zScore > 2.0) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_CONSISTENCY,
      reason: `Outlier detected: score=${currentScore}, mean=${mean.toFixed(1)}, stdDev=${stdDev.toFixed(1)}, z=${zScore.toFixed(2)} > 2.0`
    };
  }

  return { passed: true };
}
```

### 歷史穩定性 (+/-15%)

```javascript
/**
 * 檢查用戶最近 N 次分析的穩定性
 * @param {number} currentScore - 當前分析的 bias_score
 * @param {number[]} recentScores - 用戶最近 10 次分析的 bias_score
 */
function checkHistoricalStability(currentScore, recentScores) {
  if (recentScores.length < 5) {
    return { passed: true, reason: 'Not enough history for stability check (need >= 5)' };
  }

  const avgRecent = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
  const deviation = Math.abs(currentScore - avgRecent);
  const maxDeviation = 15;  // +/- 15 points on 0-100 scale

  if (deviation > maxDeviation) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_CONSISTENCY,
      reason: `Historical stability check failed: current=${currentScore}, recent_avg=${avgRecent.toFixed(1)}, deviation=${deviation.toFixed(1)} > ${maxDeviation}`
    };
  }

  return { passed: true };
}
```

---

## Layer 4: Duplicate Validation (重複驗證)

**目的**: 防止同一用戶重複提交、單篇文章分析過多、以及過時文章的分析。

**失敗狀態碼**: `failed_duplicate`

### 驗證規則

| 檢查項目 | 規則 | 理由 |
|---------|------|------|
| 同用戶同文章 | 同一 `user_hash` 不可對同一 `article_id` 提交超過 1 次分析 | 防止刷點數 (D1 UNIQUE constraint 保障) |
| 單篇文章上限 | 每篇文章最多 10 次分析 | 超過 10 次的邊際價值極低 |
| 過時文章封鎖 | 文章 `published_at` 超過 72 小時不再接受新分析 | 新聞時效性;過時分析價值低 |

### 程式碼範例

```javascript
/**
 * Layer 4: 重複驗證
 * @param {string} userHash - 匿名用戶 hash
 * @param {string} articleId - 文章 ID (SHA-256 of primary_url)
 * @param {object} db - Cloudflare D1 database binding (env.DB)
 */
async function validateDuplicate(userHash, articleId, db) {
  // Check 1: Same user same article (D1 UNIQUE(article_id, user_hash) also enforces this)
  const { results: existing } = await db.prepare(
    'SELECT id FROM analyses WHERE article_id = ? AND user_hash = ? LIMIT 1'
  ).bind(articleId, userHash).all();

  if (existing.length > 0) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_DUPLICATE,
      reason: `User ${userHash.slice(0, 8)}... already analyzed article ${articleId.slice(0, 8)}...`
    };
  }

  // Check 2: Max analyses per article
  const MAX_ANALYSES = 10;
  const countResult = await db.prepare(
    'SELECT COUNT(*) as cnt FROM analyses WHERE article_id = ?'
  ).bind(articleId).first();
  const analysisCount = countResult.cnt;

  if (analysisCount >= MAX_ANALYSES) {
    return {
      passed: false,
      result: QUALITY_GATE_RESULTS.FAILED_DUPLICATE,
      reason: `Article ${articleId.slice(0, 8)}... has reached max analyses (${MAX_ANALYSES})`
    };
  }

  // Check 3: Stale article (> 72 hours)
  const STALE_HOURS = 72;
  const articleRow = await db.prepare(
    'SELECT published_at FROM articles WHERE article_id = ?'
  ).bind(articleId).first();

  if (articleRow) {
    const publishedAt = new Date(articleRow.published_at);
    const now = new Date();
    const hoursSincePublish = (now - publishedAt) / (1000 * 60 * 60);

    if (hoursSincePublish > STALE_HOURS) {
      return {
        passed: false,
        result: QUALITY_GATE_RESULTS.FAILED_DUPLICATE,
        reason: `Article is stale: published ${hoursSincePublish.toFixed(0)}h ago (limit: ${STALE_HOURS}h)`
      };
    }
  }

  return { passed: true };
}
```

---

## 完整驗證管線 (Pipeline)

```javascript
import { QUALITY_GATE_RESULTS } from '../shared/enums.js';

/**
 * 執行完整 4 層品質驗證
 * @param {string} rawOutput - 模型原始 JSON 字串輸出
 * @param {string} userHash - 匿名用戶 hash
 * @param {string} articleId - 文章 ID (SHA-256 of primary_url)
 * @param {string} articleSource - 文章來源 (NEWS_SOURCES enum value)
 * @param {object} db - Cloudflare D1 database binding (env.DB)
 * @returns {{ result: string, quality_scores: object, parsed?: object, reason?: string }}
 *
 * SECURITY: The `reason` field in the returned object is for SERVER-SIDE LOGGING ONLY.
 * It contains internal thresholds and validation details (e.g., "35% diff", "z=2.15")
 * that MUST NEVER be included in HTTP response bodies sent to clients.
 * The HTTP response MUST use getQualityGateUserMessage(result.result) instead,
 * which returns safe, generic Chinese messages (see T06 ERROR_HANDLING.md).
 * The caller MUST strip `reason` before constructing the API response.
 */
async function runQualityGates(rawOutput, userHash, articleId, articleSource, db) {
  const qualityScores = {
    format_valid: false,
    range_valid: false,
    consistency_valid: false,
    duplicate_valid: false
  };

  // === Layer 1: Format ===
  const formatResult = validateFormat(rawOutput);
  if (!formatResult.passed) {
    return {
      result: formatResult.result,
      quality_scores: qualityScores,
      reason: formatResult.reason
    };
  }
  qualityScores.format_valid = true;
  const parsed = formatResult.parsed;

  // === Layer 2: Range ===
  const rangeResult = validateRange(parsed);
  if (!rangeResult.passed) {
    return {
      result: rangeResult.result,
      quality_scores: qualityScores,
      reason: rangeResult.reason
    };
  }
  qualityScores.range_valid = true;

  // === Layer 3: Consistency ===
  const authorResult = await checkAuthorConsistency(
    parsed.bias_score, userHash, articleSource, db
  );
  if (!authorResult.passed) {
    return {
      result: authorResult.result,
      quality_scores: qualityScores,
      reason: authorResult.reason
    };
  }

  // Outlier check (only if multiple analyses exist for this article)
  const { results: existingAnalyses } = await db.prepare(
    'SELECT bias_score FROM analyses WHERE article_id = ?'
  ).bind(articleId).all();
  const existingScores = existingAnalyses.map(a => a.bias_score);

  if (existingScores.length >= 3) {
    const outlierResult = checkOutlier(parsed.bias_score, existingScores);
    if (!outlierResult.passed) {
      return {
        result: outlierResult.result,
        quality_scores: qualityScores,
        reason: outlierResult.reason
      };
    }
  }

  // Historical stability check (user's recent 10 analyses across all articles)
  const { results: recentAnalyses } = await db.prepare(
    'SELECT bias_score FROM analyses WHERE user_hash = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(userHash).all();
  const recentScores = recentAnalyses.map(a => a.bias_score);

  if (recentScores.length >= 5) {
    const stabilityResult = checkHistoricalStability(parsed.bias_score, recentScores);
    if (!stabilityResult.passed) {
      return {
        result: stabilityResult.result,
        quality_scores: qualityScores,
        reason: stabilityResult.reason
      };
    }
  }
  qualityScores.consistency_valid = true;

  // === Layer 4: Duplicate ===
  const duplicateResult = await validateDuplicate(userHash, articleId, db);
  if (!duplicateResult.passed) {
    return {
      result: duplicateResult.result,
      quality_scores: qualityScores,
      reason: duplicateResult.reason
    };
  }
  qualityScores.duplicate_valid = true;

  // === All layers passed ===
  return {
    result: QUALITY_GATE_RESULTS.PASSED,
    quality_scores: qualityScores,
    parsed
  };
}
```

### `reason` 欄位安全規範

> **SECURITY**: `reason` 欄位包含驗證閾值和內部演算法細節 (如 `"35% diff"`, `"z=2.15 > 2.0"`, `"15-point deviation"`)。
> 此欄位 **僅供伺服器端日誌記錄**,**絕對不可**包含在回傳給客戶端的 HTTP response body 中。
>
> 客戶端應收到的錯誤訊息必須透過 `getQualityGateUserMessage(result)` 產生,
> 該函式回傳安全的通用中文訊息 (定義於 `shared/enums.js`)。
>
> **呼叫端責任** (Workers handler):
> ```javascript
> const gateResult = await runQualityGates(rawOutput, userHash, articleId, source, db);
>
> // Server-side logging — reason is safe here
> console.log(`[QualityGate] ${gateResult.result}: ${gateResult.reason}`);
>
> // HTTP response — NEVER include reason
> return Response.json({
>   success: gateResult.result === QUALITY_GATE_RESULTS.PASSED,
>   data: gateResult.result === QUALITY_GATE_RESULTS.PASSED ? gateResult.parsed : null,
>   error: gateResult.result !== QUALITY_GATE_RESULTS.PASSED ? {
>     type: gateResult.result,
>     message: getQualityGateUserMessage(gateResult.result),  // safe message
>     request_id: requestId
>   } : null
> });
> ```
>
> 參考: T06 `ERROR_HANDLING.md` — 品質門錯誤類型定義

---

## 目標通過率

**目標**: 60-70% 的分析結果通過所有 4 層驗證。

來源: `shared/config.js ANALYSIS.TARGET_PASS_RATE_MIN` (0.60) / `TARGET_PASS_RATE_MAX` (0.70)

| 指標 | 預期值 | 過低時的行動 | 過高時的行動 |
|------|--------|------------|------------|
| 通過率 < 60% | 異常 | 檢查 Prompt 是否退化;放寬 Layer 3 閾值 | -- |
| 通過率 60-70% | 健康 | 維持現狀 | 維持現狀 |
| 通過率 > 70% | 異常 | -- | 檢查 Layer 3/4 是否太寬鬆;可能有刷分行為 |

**監控方式**: T07 監控儀表板每小時統計通過率,觸發 alert 閾值定義在 `shared/config.js MONITORING.ALERT_ANALYSIS_FAILURE_THRESHOLD` (0.40)。

---

## 與獎勵系統的整合

**核心規則**: 只有 `quality_gate_result === "passed"` 的分析才觸發獎勵。

```javascript
import { QUALITY_GATE_RESULTS } from '../shared/enums.js';
import { REWARD } from '../shared/config.js';

/**
 * 根據品質驗證結果發放獎勵
 * @param {string} qualityResult - Quality Gate 結果
 * @param {string} userHash - 用戶 hash
 * @param {object} db - Cloudflare D1 database binding (env.DB)
 */
async function processReward(qualityResult, userHash, db) {
  if (qualityResult !== QUALITY_GATE_RESULTS.PASSED) {
    // 失敗的分析不獲得獎勵,但記錄嘗試
    return { rewarded: false, reason: qualityResult };
  }

  // 取得用戶當前資料 (D1 users table, integer cents)
  const userData = await db.prepare(
    'SELECT total_points_cents, contribution_count, vote_rights FROM users WHERE user_hash = ?'
  ).bind(userHash).first();

  const currentCents = userData?.total_points_cents ?? 0;
  const currentCount = userData?.contribution_count ?? 0;
  const newCents = currentCents + REWARD.POINTS_PER_VALID_ANALYSIS;  // 10 cents = 0.10 points
  const newCount = currentCount + 1;
  const newVoteRights = Math.floor(newCents / 1000);  // 1000 cents = 10.00 points = 1 vote right
  const nowISO = new Date().toISOString();

  // Upsert user record (immutable: INSERT or UPDATE, never mutate in-place)
  await db.prepare(
    `INSERT INTO users (user_hash, total_points_cents, contribution_count, vote_rights, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_hash) DO UPDATE SET
       total_points_cents = ?,
       contribution_count = ?,
       vote_rights = ?,
       updated_at = ?`
  ).bind(
    userHash, newCents, newCount, newVoteRights, nowISO,
    newCents, newCount, newVoteRights, nowISO
  ).run();

  return {
    rewarded: true,
    points_earned_cents: REWARD.POINTS_PER_VALID_ANALYSIS,
    new_total_cents: newCents
  };
}
```

---

## 儲存格式

通過或失敗的分析結果寫入 **Cloudflare D1** (取代原 KV 設計):

```sql
-- D1 analyses table
INSERT INTO analyses (
  article_id, user_hash,
  quality_gate_result, quality_scores,
  prompt_version, created_at
) VALUES (?, ?, ?, ?, ?, ?);
```

```javascript
// quality 相關欄位
{
  "quality_gate_result": "passed",
  "quality_scores": {
    "format_valid": true,
    "range_valid": true,
    "consistency_valid": true,
    "duplicate_valid": true
  },
  "prompt_version": "v2.0.0"
}
```

---

## Common Mistakes

### Mistake 1: Layer 順序錯誤

- **問題**: 先跑 Layer 3 (需要查 D1 歷史) 再跑 Layer 1 (JSON parse),浪費 I/O
- **正確做法**: 嚴格按照 1 → 2 → 3 → 4 的順序,Layer 1/2 為純本地計算,失敗即短路,避免不必要的 D1 查詢
- **效能影響**: Layer 1/2 失敗率約 20-30%,提前短路可節省大量 D1 讀取

### Mistake 2: 忘記驗證 category 與 score 的一致性

- **問題**: 模型可能輸出 `bias_score: 75` 但 `bias_category: "center"`,數值與類別不匹配
- **正確做法**: 使用 `getBiasCategory(score)` 重新計算預期類別,與模型輸出比較
- **根本原因**: 2B 模型有時會「記住」常見的 score-category 組合而非計算

### Mistake 3: 離群值偵測不足 3 筆就執行

- **問題**: 少於 3 筆資料時計算標準差無意義 (樣本太小)
- **正確做法**: `allScores.length < 3` 時跳過離群值偵測,直接通過
- **數學原因**: 2 個點的標準差無法代表分布特徵

### Mistake 4: 使用 byte length 而非 character length 檢查 reasoning

- **問題**: CJK 字元在 UTF-8 中佔 3 bytes,用 `Buffer.byteLength()` 會讓中文 reasoning 提前觸發長度上限
- **正確做法**: 使用 `string.length` (JavaScript 的字元計數),中文字符各計 1
- **範例**: "兩岸和平" = 4 字元 (正確) vs 12 bytes (錯誤)

### Mistake 5: 過時文章判斷使用本地時間

- **問題**: 用戶端可能在不同時區,導致 72 小時判斷不一致
- **正確做法**: `published_at` 使用 ISO 8601 帶時區格式 (`+08:00`),比較時統一轉為 UTC
- **來源**: KV_SCHEMA.md Rule 3 -- 所有 timestamp 必須為 ISO 8601 帶時區

### Mistake 6: 通過率太高不警覺

- **問題**: 通過率 > 70% 可能意味著驗證太寬鬆,或有用戶找到了系統漏洞
- **正確做法**: 監控通過率,超過 70% 時觸發 T07 告警,人工審查
- **歷史教訓**: 高通過率 + 低分散度 = 可能有批量刷分腳本

---

## 重要提醒

修改此文件前,必須:
1. 確認變更不影響 D1 Schema (KV_SCHEMA.md) 中 `quality_gate_result` 的合法值
2. 確認變更不影響 T05 獎勵觸發條件
3. 如新增/修改 Layer,同步更新 `shared/enums.js QUALITY_GATE_RESULTS`
4. 更新變更紀錄
5. 通知 T01, T05, T07

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 | 影響團隊 |
|------|------|---------|---------|---------|
| v1.0 | 2026-03-06 | 初版: 4 層驗證完整定義 + 程式碼範例 + 獎勵整合 | 專案啟動,T03 階段 3 規格制定 | T01, T05, T07 |
| v1.1 | 2026-03-07 | KV→D1 儲存遷移標註 + prompt_version 更新為 v2.0.0 | 架構更新: Cloudflare 全棧 | T01, T05, T07 |
| v1.2 | 2026-03-07 | 完成 KV→D1 程式碼遷移: Layer 3/4 全面改用 D1 SQL 查詢, pipeline 函式參數改為 db binding, 獎勵函式改用 integer cents + D1 upsert, 移除所有 kvStore 引用 | T06 安全審計: 程式碼/文件不一致 (CRITICAL) | T01, T05, T06, T07 |
| v1.3 | 2026-03-07 | 新增 `reason` 欄位安全規範: 明確標記 reason 為伺服器端日誌專用,禁止暴露至 HTTP response。新增呼叫端範例程式碼 | T06 安全審計: reason 欄位暴露範圍待確認 (MEDIUM) | T06 |

---

**文件維護者**: T03 (AI Inference Team)
**最後更新**: 2026-03-07
**下次審查**: Prompt v2.0.0 Gold Standard 測試完成後
