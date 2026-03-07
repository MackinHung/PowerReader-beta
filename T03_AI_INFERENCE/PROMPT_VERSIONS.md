# Prompt Versions

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **下游文件**: T03_AI_INFERENCE/QUALITY_GATES.md, T03_AI_INFERENCE/MODEL_ACCURACY_REPORT.md, T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md (prompt_version field), T01_SYSTEM_ARCHITECTURE/CLOUDFLARE_ARCHITECTURE.md (Vectorize + Workers AI)
- **維護者**: T03 (AI Inference Team)
- **類型**: SINGLE SOURCE OF TRUTH (SSOT) + 滾動式紀錄
- **最後更新**: 2026-03-07

---

## 文件目的

這是 **Qwen3.5-4B Prompt 設計與版本演進的唯一定義**。
所有分析用的 System Prompt 必須從此文件取得,不可自行定義。

**修改此文件時必須通知**: T01 (KV Schema 的 prompt_version 欄位), T05 (品質影響獎勵)

---

## Prompt 設計哲學

### 1. 上下文注入優先 (Context Injection First)

Qwen3.5-4B 有 40 億參數,具備基礎推理能力,但缺乏台灣政治領域知識。
**測試證實: 小模型需要更多上下文,而非更少。但必須拿捏,過多會崩潰。**

**原則**:
- System Prompt (L1) 控制在 **300 tokens 以內**
- RAG 動態注入 (L2) **200-800 tokens** (根據文章內容即時查詢)
- 總 Prompt 長度 ~1500-2000 字元,推理時間約 6-10 秒,完全可接受
- **禁止 Few-shot**: 小模型會 pattern-match 而非 reasoning (測試 spread=82 崩潰)
- 不加 "You are a helpful assistant" 等空話
- 用結構化格式 (JSON schema) 取代自然語言描述

**測試數據 (Phase 2-4)**:
| Prompt 長度 | 速度 | bias spread | 穩定性 |
|------------|------|------------|--------|
| 117 字 (無上下文) | 5.7s | 42 | 崩潰 |
| 562 字 (立場上下文) | 6.6s | 7 | 通過 |
| 1176 字 (+錨點) | 8.3s | 2 | 最佳 |
| 1703 字 (XL 含人物+媒體) | 9.4s | 5 | 穩定 |

### 2. 零幻覺容忍 (Zero Hallucination Tolerance)

模型不可生成新聞中不存在的事實。所有輸出必須可追溯回輸入文章。

**約束**:
- `reasoning` 欄位必須引用文章中的具體詞句或論點
- `key_phrases` 必須為文章中實際出現的詞彙片段
- 禁止在 Prompt 中暗示模型進行推測或預測

### 3. 結構化 JSON 輸出 (Structured JSON Output)

模型輸出必須為嚴格 JSON,不允許自然語言包裹。

**原因**:
- 用戶端 (瀏覽器) 需直接 `JSON.parse()` 解析
- 品質驗證 (Quality Gates) 的 Layer 1 直接驗證 JSON 結構
- 去除自然語言包裹可減少 token 消耗 30-50%

### 4. 上下文窗口預算 (Context Window Budget)

Qwen3.5-4B 上下文窗口為 32,768 tokens。
**總 Prompt 輸入 (L1+L2+L3+指令) 不得超過上下文窗口的 40%** (~13,107 tokens)。

**預算分配**:

| 層 | 用途 | 估計 tokens | 佔比 |
|---|------|-----------|------|
| L1 | System Prompt | ~400-700 | ~2% |
| L2 | RAG 注入 (5 條) | ~300-450 | ~1.4% |
| 指令 | JSON 格式 + user prefix | ~100 | ~0.3% |
| **L3** | **文章原文** | **≤11,800** | **≤36%** |

**文章長度限制** (中文字 ≈ 1.3-1.5 tokens):
- 安全區: < 6,500 字 (≤32% context)
- 硬上限: ~8,400 字 (= 40% context)
- 超過上限的文章需截斷 (保留標題+前 N 段)

**超過 40% 後果**: 模型推理品質顯著下降，輸出不穩定。

### 5. 台灣語境意識 (Taiwan Context Awareness)

模型必須理解台灣特有的政治光譜、媒體生態、用語習慣。

**關鍵指引**:
- 偏左/偏右定義基於 **台灣本土政治光譜**,非美國或中國標準
- 泛綠 = 偏左 (本土派), 泛藍 = 偏右 (統派/親中), 中間 = 不明顯傾向
- 台灣用語: 立委、行政院、公投、九二共識、兩岸關係
- 爭議性判斷需考慮台灣社會脈絡 (如統獨議題天然高爭議)

---

## Prompt v2.0.0 -- 當前生產版本

### 三層 Prompt 架構

#### Layer 1: System Prompt (核心/靜態, 本地快取)

```
你是台灣新聞立場分析器。

台灣政治光譜:
- 0=極度偏綠(本土/獨派) 50=中立 100=極度偏藍(統派)

偏向辨識方法:

批評型偏向:
- 偏綠文章傾向批評國民黨或藍營政策立場
- 偏藍文章傾向批評民進黨或綠營政策立場

宣傳型偏向:
- 偏綠文章傾向正面報導綠營人物政績或主張
- 偏藍文章傾向正面報導藍營人物政績或主張

分數錨點:
- 0-15: 單方面批評藍營 或 單方面宣傳綠營
- 30-40: 偏綠但有平衡報導
- 45-55: 中立或非政治新聞
- 60-70: 偏藍但有平衡報導
- 85-100: 單方面批評綠營 或 單方面宣傳藍營

輸出嚴格 JSON,不加任何額外文字:
{
  "bias_score": 0-100,
  "bias_category": "extreme_left|left|center_left|center|center_right|right|extreme_right",
  "controversy_score": 0-100,
  "controversy_level": "low|moderate|high|very_high",
  "reasoning": "最多200字,引用原文論據",
  "key_phrases": ["從原文擷取的關鍵詞彙"]
}
```

#### Layer 2: RAG 動態知識注入 (即時 API 查詢)

由 PowerReader Cloudflare Workers 透過 Vectorize 查詢知識庫,根據 bge-m3 標題嵌入的 cosine 相似度回傳相關條目,格式:

```
[背景知識]
- {人名}: {黨派}, {職位}, {立場標籤}
- {媒體名}: 傾向分數 {score}, {描述}
- {議題}: 綠營立場={desc}, 藍營立場={desc}, 爭議度={level}
```

**使用者透明化**: 此層內容使用者可展開查看,建立信任。

#### Layer 3: 輸入 (新聞原文)

```json
{
  "title": "新聞標題",
  "summary": "摘要",
  "content_markdown": "清洗後的 Markdown 全文",
  "source": "媒體來源 (enum)",
  "author": "記者名 (nullable)",
  "published_at": "ISO 8601"
}
```

### Input Format

模型接收的用戶訊息格式 (對應 Crawler API 輸出):

```json
{
  "title": "新聞標題",
  "summary": "摘要",
  "content_markdown": "清洗後的 Markdown 全文",
  "source": "媒體來源 (enum)",
  "author": "記者名 (nullable)",
  "published_at": "ISO 8601"
}
```

> **注意**: `tokens` 欄位已移除 -- CKIP BERT 分詞不再使用,嵌入改由 Cloudflare Workers AI bge-m3 處理。

**欄位說明**:

| 欄位 | 來源 | 用途 |
|------|------|------|
| `title` | Crawler API 擷取 | 標題往往最能反映立場 |
| `summary` | Crawler API 擷取 | 快速概覽,輔助分析 |
| `content_markdown` | Crawler API 擷取 + 清洗 | 主體分析素材 |
| `source` | `shared/enums.js NEWS_SOURCES` | 提供媒體背景脈絡 (但不可作為唯一判斷依據) |
| `author` | Crawler API 擷取 (nullable) | 記者背景脈絡 |
| `published_at` | Crawler API 擷取 (ISO 8601) | 新聞時效性判斷 |

### Output Format

```json
{
  "bias_score": 65,
  "bias_category": "center_right",
  "controversy_score": 42,
  "controversy_level": "high",
  "reasoning": "文章多次使用『兩岸和平』、『經貿合作』等框架,引用國民黨立委發言但未平衡報導民進黨觀點,標題『兩岸關係回暖有望』帶有正面暗示。",
  "key_phrases": ["兩岸和平", "經貿合作", "兩岸關係回暖有望"]
}
```

**Output 欄位驗證規則** (對應 `shared/enums.js` + `shared/config.js`):

| 欄位 | 型別 | 範圍 | 對應驗證 |
|------|------|------|---------|
| `bias_score` | integer | 0-100 | `isValidBiasScore()` |
| `bias_category` | string | 7 個值之一 | `getBiasCategory(score)` 結果需一致 |
| `controversy_score` | integer | 0-100 | `isValidControversyScore()` |
| `controversy_level` | string | 4 個值之一 | `getControversyLevel(score)` 結果需一致 |
| `reasoning` | string | 10-200 字元 | 長度檢查 |
| `key_phrases` | string[] | 1-10 個項目 | 陣列長度檢查 |

### Qwen3.5-4B 推理設定 (CONFIRMED 2026-03-07)

> **STATUS: LOCKED** — 參數經 Phase 1-7 測試驗證，已由專案負責人確認鎖定。
> 除非 Gold Standard 測試顯示必要性，否則不得修改。

```javascript
// 推理設定 (從 shared/config.js MODELS 取得模型名稱)
const inferenceConfig = {
  model: "qwen3.5:4b",            // Ollama 官方模型 (含 RENDERER+PARSER)
  think: false,                     // 4B thinking 不值得 (170-300s, 品質差)
  temperature: 0.5,                 // 穩定性甜蜜點 (測試驗證)
  top_p: 0.95,                      // 官方值
  presence_penalty: 1.5,            // 官方值 (加法型, 非 repeat_penalty)
  num_predict: 4096,                // 不 think 不需要多
  response_format: { type: "json_object" }
};
```

**參數選擇理由 (基於 Phase 1-4 測試)**:

| 參數 | 值 | 理由 |
|------|-----|------|
| `think` | false | 4B thinking 170-300s 且 bias 仍偏差 29 分,不值得 |
| `temperature` | 0.5 | 0.3 太死板, 1.0 不穩定, 0.5 是測試驗證的甜蜜點 |
| `top_p` | 0.95 | Qwen3.5 官方推薦值 |
| `presence_penalty` | 1.5 | 官方值;注意是加法型,與 repeat_penalty (乘法型) 不同 |
| `num_predict` | 4096 | JSON 結構約 200-400 tokens;4096 留餘量 |

---

## 語意版本控制規則 (Semantic Versioning)

Prompt 版本遵循 **MAJOR.MINOR.PATCH** 格式:

### MAJOR (主版本)
**何時遞增**: 輸出 JSON schema 結構變更 (新增/刪除/改名欄位)

**範例**:
- 新增 `sentiment_score` 欄位 → v2.0.0
- 刪除 `key_phrases` 欄位 → v2.0.0
- `bias_category` 改名為 `stance` → v2.0.0

**影響**: 所有下游系統必須同步更新 (T01 KV Schema, T04 前端, T05 獎勵)

### MINOR (次版本)
**何時遞增**: Prompt 措辭調整、分數閾值變更、新增指引但不改 schema

**範例**:
- 調整政治光譜說明文字 → v1.1.0
- 新增「諷刺性文章處理指引」 → v1.1.0
- 修改 temperature 從 0.3 → 0.25 → v1.1.0

**影響**: 需重新跑 Gold Standard 測試,不影響下游 schema

### PATCH (修補版本)
**何時遞增**: 錯字修正、格式微調、註解更新

**範例**:
- 修正 "爭意" → "爭議" → v1.0.1
- 調整 System Prompt 中的空白排版 → v1.0.1

**影響**: 不需重新測試,不影響分析結果

---

## 版本變更流程

### 變更前必做 (MANDATORY)

1. **準備 Gold Standard 測試集**: 20 篇文章 (詳見 MODEL_ACCURACY_REPORT.md)
2. **跑基準測試**: 使用當前版本的 Prompt 跑一次完整測試,記錄分數
3. **修改 Prompt**: 進行計畫中的變更
4. **跑對比測試**: 使用新版本的 Prompt 跑一次完整測試
5. **比較結果**: 新版本必須在所有指標上**不劣於**舊版本
   - bias MAE 不可增加超過 2 分
   - category accuracy 不可降低超過 5%
   - controversy MAE 不可增加超過 3 分
6. **記錄**: 在下方滾動式紀錄表中新增一列
7. **通知**: MINOR 以上變更需通知 T01、T04、T05

### 測試集要求 (20 篇 Gold Standard 文章)

| 條件 | 要求 |
|------|------|
| 來源平衡 | 至少涵蓋 5 個不同媒體來源 |
| 立場平衡 | 左派 6 篇, 中間 4 篇, 右派 6 篇, 極端 4 篇 |
| 爭議平衡 | 低爭議 5 篇, 中爭議 5 篇, 高爭議 5 篇, 極高爭議 5 篇 |
| 專家標註 | 每篇至少 3 名標註者,取中位數 |
| 儲存位置 | Cloudflare R2: `gold-standard/v{version}/` |

---

## Prompt Injection 防護

### 威脅模型

用戶端在本地運行 Qwen3.5-4B,理論上可修改 Prompt。但：
- 分析結果需通過 4 層品質驗證 (QUALITY_GATES.md),注入造成的異常輸出會被攔截
- Prompt 版本記錄在 KV 的 `prompt_version` 欄位,不匹配的版本會被標記

### 防護措施

**1. 輸入消毒 (Input Sanitization)**

```javascript
// 在傳入模型前清除潛在注入
function sanitizeArticleInput(article) {
  return {
    title: article.title.replace(/[\x00-\x1f]/g, ''),            // 移除控制字元
    summary: (article.summary || '').replace(/[\x00-\x1f]/g, ''),// 移除控制字元
    content_markdown: article.content_markdown.slice(0, 4096),    // 截斷過長內容
    source: NEWS_SOURCES_REVERSE[article.source]                  // 驗證來源合法性
      ? article.source
      : null,                                                    // 非法來源則設 null
    author: article.author || null,                               // nullable
    published_at: article.published_at                            // ISO 8601
  };
}
```

**2. 輸出驗證 (Output Validation)**

即使 Prompt 被注入,輸出仍需通過 QUALITY_GATES.md 的 4 層驗證:
- Layer 1: JSON 格式驗證 -- 注入產生的自然語言輸出直接失敗
- Layer 2: 範圍驗證 -- 分數超出 0-100 直接失敗
- Layer 3: 一致性驗證 -- 與歷史分析差距過大被標記
- Layer 4: 重複提交驗證 -- 同一用戶反覆提交同篇文章被阻擋

**3. 版本校驗**

```javascript
// KV 寫入時驗證 prompt_version
function validatePromptVersion(submittedVersion) {
  const CURRENT_VERSION = "v2.0.0";  // 必須與此文件同步
  if (submittedVersion !== CURRENT_VERSION) {
    console.warn(`Prompt version mismatch: expected ${CURRENT_VERSION}, got ${submittedVersion}`);
    return false;
  }
  return true;
}
```

---

## 滾動式紀錄表

### 版本歷史

| 版本 | 日期 | 變更類型 | 變更摘要 | Gold Standard 結果 | 變更者 |
|------|------|---------|---------|-------------------|--------|
| v1.0.0 | 2026-03-06 | MAJOR | 初版 Prompt: System Prompt + JSON schema + Thinking Mode config | 待測試 | T03 |
| v2.0.0 | 2026-03-07 | MAJOR | 模型 2B→4B + RAG 三層架構 + 參數更新 (think=false, t=0.5) + 禁止 few-shot | Phase 1-7 測試: bias_err 84%↓, spread 25→5 | T03 |

### 紀錄填寫範例

| 版本 | 日期 | 變更類型 | 變更摘要 | Gold Standard 結果 | 變更者 |
|------|------|---------|---------|-------------------|--------|
| v1.1.0 | (範例) | MINOR | 新增諷刺文章處理指引 | bias MAE 14→12, cat acc 72%→75% | T03 |
| v1.0.1 | (範例) | PATCH | 修正 "爭意" typo | N/A (不影響結果) | T03 |
| v2.0.0 | (範例) | MAJOR | 新增 sentiment_score 欄位 | bias MAE 12→11, cat acc 75%→78% | T03 |

---

## Common Mistakes

### Mistake 1: Few-shot 範例 (嚴重!)

- **問題**: 小模型看到 few-shot 範例會 pattern-match 而非 reasoning,導致 bias spread=82 崩潰
- **錯誤做法**: 在 Prompt 中加入範例輸出
- **正確做法**: 用上下文注入 (立場定義+分數錨點) 取代範例;禁止任何 few-shot
- **測試數據**: V3 (含 few-shot) bias spread=82 vs V2b (無 few-shot) spread=7

### Mistake 2: 在 Prompt 中硬編碼分數

- **問題**: 模型會學習到特定媒體應該得到固定分數,失去分析能力
- **錯誤做法**: "自由時報通常 bias_score 在 20-30 之間"
- **正確做法**: 只提供政治光譜定義,讓模型基於文章內容自行判斷
- **驗證方法**: 同一媒體的不同文章應該得到不同分數

### Mistake 3: 忽略台灣語境

- **問題**: 使用通用政治光譜定義 (如美國左右派),導致台灣政治議題分析錯誤
- **錯誤做法**: "left = progressive, right = conservative" (美國定義)
- **正確做法**: 明確定義台灣光譜 -- 0=深綠獨派, 50=中立, 100=深藍統派
- **測試方法**: 用涉及兩岸關係的文章測試,確認模型理解台灣脈絡

### Mistake 4: 未鎖定模型版本

- **問題**: Qwen 模型可能更新,導致相同 Prompt 產生不同結果
- **錯誤做法**: 使用 "latest" 版本標籤
- **正確做法**: 鎖定 `qwen3.5:4b` (Ollama 官方模型, 含 RENDERER+PARSER)
- **驗證方法**: 每次模型更新後必須重跑 Gold Standard 測試
- **⚠️ 注意**: 自訂 Modelfile 缺少 RENDERER+PARSER 會導致輸出異常

### Mistake 5: 允許模型輸出自然語言包裹

- **問題**: 模型有時會在 JSON 前後加上 "Here is the analysis:" 等文字,導致 `JSON.parse()` 失敗
- **錯誤做法**: 不設 `response_format` 或 `stop` token
- **正確做法**: 設定 `response_format: { type: "json_object" }` + `stop: ["\n\n"]`
- **後備方案**: 在 Quality Gates Layer 1 中 catch JSON parse error 並標記 `failed_format`

### Mistake 6: Prompt 本身帶有政治修辭 (媒體識讀原則!)

- **問題**: 在 Prompt 中使用政治攻擊性語言（如「親中賣台」「操弄意識形態」），會讓模型內化這些修辭框架
- **錯誤做法**: `偏綠批評型: 批評國民黨親中賣台、配合對岸`
- **正確做法**: `偏綠文章傾向批評國民黨或藍營政策立場` (中性描述行為模式)
- **原則**: 分析框架本身不可帶有立場判斷。Prompt 描述「如何識別偏向」，不是「哪些政治修辭是對的」
- **同理**: 知識庫條目也不可標註「立場偏綠」「立場偏藍」(已移除媒體標籤)

### Mistake 7: 啟用 Thinking Mode

- **問題**: 4B 模型的 thinking 品質不足,speed 不可接受
- **測試數據**: think=true 推理 170-300s, bias 仍偏差 +29 分
- **正確做法**: 永遠使用 think=false
- **原因**: 4B 的「思考」品質不足以改善結果,反而浪費時間

---

## 重要提醒

修改此文件前,必須:
1. 跑完 20 篇 Gold Standard 測試 (MINOR 以上變更)
2. 比較新舊版本的指標差異
3. 更新滾動式紀錄表
4. 通知下游團隊 (T01, T04, T05)
5. 同步更新 MASTER_ROADMAP.md 決策紀錄

---

**文件維護者**: T03 (AI Inference Team)
**最後更新**: 2026-03-07
**下次審查**: Gold Standard 測試集建立完成後
