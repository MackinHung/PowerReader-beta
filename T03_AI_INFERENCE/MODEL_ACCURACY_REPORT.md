# 📊 Model Accuracy Report (滾動式紀錄)

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js, shared/enums.js
- **下游文件**: T03/PROMPT_VERSIONS.md, T03/QUALITY_GATES.md
- **維護者**: T03 (AI Inference Team)
- **類型**: 滾動式紀錄 (Living Document)
- **最後更新**: 2026-03-07

---

## 🎯 文件目的
追蹤 **Qwen3.5-4B 模型在台灣新聞立場分析任務上的準確率**。
每次 Prompt 版本更新後，必須使用金標準資料集重新測試並更新此報告。

---

## 📐 評估方法論

### 金標準資料集 v2 (Gold Standard Dataset)

**v2 變更摘要** (2026-03-07):
- CKIP 斷詞已完全移除，文章以原始文本輸入
- 輸入格式對齊 Crawler API 輸出規格
- 儲存位置: R2 `gold-standard/v2/`
- 新增台灣政治光譜標註指南

**設計原則**:
- 最少 20 篇手動標註台灣新聞文章
- 覆蓋所有 7 種偏向分類 (`BIAS_CATEGORIES`)
- 覆蓋至少 10 個不同來源 (`NEWS_SOURCES`)
- 至少 3 名獨立標註者
- 文章直接使用原始 Markdown 文本，不做任何斷詞前處理

**輸入格式** (對齊 Crawler API 輸出):

| 欄位 | 類型 | 說明 |
|------|------|------|
| `title` | string | 新聞標題 |
| `summary` | string | 摘要 (nullable) |
| `content_markdown` | string | 清洗後的 Markdown 全文 |
| `source` | string | `NEWS_SOURCES` enum (e.g. `liberty_times`) |
| `author` | string | 記者名 (nullable) |
| `published_at` | string | ISO 8601 日期 |

**標註欄位**:

| 欄位 | 類型 | 驗證 |
|------|------|------|
| `article_id` | string | SHA-256 of content |
| `source` | string | `NEWS_SOURCES` enum |
| `gold_bias_score` | number | 0-100 |
| `gold_bias_category` | string | `BIAS_CATEGORIES` enum |
| `gold_controversy_score` | number | 0-100 |
| `gold_controversy_level` | string | `CONTROVERSY_LEVELS` enum |
| `annotator_ids` | string[] | 至少 3 人 |

**儲存格式** (R2 `gold-standard/v2/`):
```json
{
  "version": "2.0",
  "article_id": "sha256_of_content_markdown",
  "title": "新聞標題",
  "summary": "摘要",
  "content_markdown": "清洗後全文",
  "source": "liberty_times",
  "author": "記者名",
  "published_at": "2026-03-07T14:00:00+08:00",
  "annotations": [
    {
      "annotator_id": "A001",
      "bias_score": 18,
      "bias_category": "lean_green",
      "controversy_score": 78,
      "controversy_level": "high",
      "reasoning": "標註理由簡述",
      "annotated_at": "2026-03-07T15:00:00+08:00"
    }
  ],
  "consensus": {
    "bias_score": 18,
    "bias_category": "lean_green",
    "controversy_score": 78,
    "controversy_level": "high",
    "agreement_method": "majority_vote"
  }
}
```

### 台灣政治光譜標註指南

標註者必須理解台灣特有的政治光譜，才能正確標註新聞偏向。

**偏向分類 (BIAS_CATEGORIES)**:

| 分類代碼 | 中文名稱 | bias_score 區間 | 辨識特徵 |
|---------|---------|----------------|---------|
| `extreme_green` | 極度偏綠 | 0-15 | 全面批評藍營或全面宣傳綠營，語氣強烈 |
| `lean_green` | 明顯偏綠 | 15-30 | 明確站在綠營立場，批評藍營政策 |
| `slight_green` | 略偏綠 | 30-45 | 有綠營傾向但語氣較溫和 |
| `center` | 中立 | 45-55 | 客觀陳述雙方或完全非政治新聞 |
| `slight_blue` | 略偏藍 | 55-70 | 有藍營傾向但語氣較溫和 |
| `lean_blue` | 明顯偏藍 | 70-85 | 明確站在藍營立場，正面報導藍營 |
| `extreme_blue` | 極度偏藍 | 85-100 | 全面批評綠營或全面宣傳藍營 |

**標註判斷要點**:

1. **批評型 vs 宣傳型**: 偏向有兩種表現模式
   - 批評型: 批評對立陣營 (e.g. 偏綠文章批評國民黨阻擋軍購)
   - 宣傳型: 正面報導自身陣營 (e.g. 偏藍文章宣傳藍營候選人政績)

2. **來源不等於立場**: 自由時報的文章通常偏綠，但個別文章仍須獨立判斷

3. **非政治新聞**: 社會事件 (車禍、犯罪等) 若無政治立場，一律標註 `center` (bias=50)

4. **爭議程度 (CONTROVERSY_LEVELS)**:
   - `low` (10-25): 日常社會事件，無政治爭議
   - `moderate` (25-50): 一般政策討論，有不同意見但非核心對立
   - `high` (50-75): 藍綠交鋒議題，有明確對立
   - `critical` (75-100): 國防外交重大爭議，核心政治分歧

5. **台灣特有脈絡**: 標註者需具備以下知識
   - 藍綠政黨光譜 (民進黨=綠、國民黨=藍、民眾黨=白)
   - 主要媒體傾向 (自由=綠、中時/聯合=藍、公視=中立)
   - 核心議題立場 (軍購/兩岸/統獨/能源/轉型正義)
   - 政治人物黨籍與立場

### 評估指標

| 指標 | 說明 | 目標 |
|------|------|------|
| Bias MAE | 模型 vs 金標準平均絕對誤差 | < 15 |
| Bias F1 | 7 分類 macro-F1 | > 0.50 |
| Controversy F1 | 4 分類 macro-F1 | > 0.55 |
| Pass Rate | 通過品質驗證比例 | 60-70% |
| Cohen's κ | 標註者間一致性 | ≥ 0.60 |

### 混淆矩陣範本

```
               Predicted →
Actual ↓    EL   L   CL   C   CR   R   ER
EL          __   __   __  __   __  __   __
L           __   __   __  __   __  __   __
CL          __   __   __  __   __  __   __
C           __   __   __  __   __  __   __
CR          __   __   __  __   __  __   __
R           __   __   __  __   __  __   __
ER          __   __   __  __   __  __   __
```

---

## 📊 裝置效能基準

| 裝置層級 | 代表設備 | RAM | 推理時間 (think=false) | 狀態 |
|---------|---------|-----|---------|------|
| 高階 | RTX 4060+, M3 | ≥16GB | ~6s | ✅ |
| 中階 | GTX 1060, M1 | 8-16GB | 6-10s | ✅ |
| 低階 | 內顯, 舊手機 | < 8GB | >15s 或無法運行 | ⚠️ 需 fallback |

**實測數據** (Qwen3.5-4B, think=false, t=0.5):
- 平均推理時間: 6-10 秒/篇
- Prompt 長度影響: 每增加 ~500 字約 +1 秒
- 1700 字 prompt: ~9.4 秒 (可接受)

### 記憶體使用

| 模型 | 大小 | 量化後 | Runtime RAM |
|------|------|--------|------------|
| Qwen3.5-4B | ~3.4GB | 官方 Ollama (已量化) | ~4GB |
| ~~CKIP BERT~~ | ~~已移除~~ | - | - |
| ~~MiniLM Embedding~~ | ~~已移除~~ | - | - |
| bge-m3 (Workers AI) | Cloudflare 邊緣 GPU | 不佔本地空間 | 不佔本地 RAM |
| bge-small-zh (Crawler) | ~130MB | ~130MB | ~200MB |

---

## 📊 實測結果 (Phase 1-7, 2026-03-06~07)

### 測試新聞素材

| ID | 主題 | 類型 | 預期 bias | 預期 controv |
|----|------|------|----------|-------------|
| news1 | 軍購特別條例 | 偏綠批評型 | 18 | 78 |
| news2 | 宜蘭車禍吸毒撞死人 | 非政治 | 50 | 15 |
| news3 | 吳宗憲(KMT)育嬰政策 | 偏藍宣傳型 | 72 | 35 |

### 無 RAG vs RAG 對比 (3篇 × 3次)

| 新聞 | 方法 | bias_err | b_spread | c_err | c_spread |
|------|------|---------|----------|-------|----------|
| news1 軍購 | 無RAG | 0 | 25 | 1 | 20 |
| news1 軍購 | **RAG** | 5 | **5** | 1 | 20 |
| news2 車禍 | 無RAG | 2 | 0 | 2 | 10 |
| news2 車禍 | RAG | 2 | 0 | 3 | 10 |
| news3 育嬰 | 無RAG | **45** | 37 | 7 | 18 |
| news3 育嬰 | **RAG** | **7** | 20 | 5 | 7 |

### 關鍵發現

1. **RAG 修復最大失敗**: news3 bias_err 45→7 (改善 84%),因為檢索到「吳宗憲=國民黨」
2. **RAG 提升穩定性**: news1 spread 25→5
3. **不傷已準的**: news2 非政治新聞 RAG 與無 RAG 結果一致
4. **向量檢索品質高**: news3 第一命中 score=0.736 正確抓到吳宗憲

### Prompt 策略比較 (Phase 2)

| 策略 | bias avg | b_spread | contv avg | c_spread | 速度 | 結果 |
|------|---------|----------|----------|----------|------|------|
| 無上下文 | 37 | 40 | 78 | 20 | 6.5s | FAIL |
| 立場上下文 (V2) | 14 | 15 | 77 | 10 | 5.4s | 差1分 |
| 上下文+few-shot (V3) | 62 | 82 | 73 | 5 | 6.2s | FAIL |
| V2b+錨點 t=1.0 | 8 | 7 | 83 | 18 | 6.3s | FAIL |
| **V2b+錨點 t=0.5** | **10** | **10** | **88** | **7** | **5.9s** | **PASS** |

### 能力矩陣

| 任務 | 評級 | 說明 |
|------|------|------|
| 摘要/總結 | ★★★★☆ | 幾乎無幻覺,品質高 |
| 條列重點 | ★★★★☆ | 結構清晰,事實正確 |
| 立場判斷 (自然語言) | ★★★☆☆ | 好於數字評分 |
| 數字評分 | ★★☆☆☆ | 必須 RAG 注入,否則不穩 |

### RAG MVP 架構

- **Embedding**: Cloudflare Workers AI @cf/baai/bge-m3 (GPU, 1024dim)
- **向量搜索**: Cloudflare Vectorize (cosine similarity)
- **知識庫**: 31 筆 (政治人物 15 + 媒體 8 + 議題 8)
- **速度**: 邊緣 GPU 推理,每次查詢延遲極低

> **注意**: MVP 測試使用 MiniLM (384d),生產環境已改為 bge-m3 (1024d) -- 精度更高,且在 Cloudflare GPU 上免費運行。

---

## 📈 版本追蹤表

| Prompt Ver | 日期 | 測試數 | Bias MAE | Bias F1 | Controversy F1 | Pass Rate | 備註 |
|-----------|------|-------|----------|---------|---------------|-----------|------|
| v1.0.0 | 2026-03-06 | 3 | ~29 | - | - | - | 2B think=true，失敗 |
| v2.0.0 | 2026-03-07 | 9 | ~5 (RAG) | - | - | - | 4B+RAG, think=false |

---

## 🧪 A/B 測試框架

```
1. 定義假設 → "v1.1 bias F1 比 v1.0 高 5%"
2. 分組 → Control (v1.0) 50% / Treatment (v1.1) 50%
3. 樣本 → 至少 50 篇/組
4. 檢驗 → paired t-test, p < 0.05
5. 決策 → 顯著改善採用，否則保留舊版
```

### 回歸測試 Edge Cases

- [ ] 諷刺文章 (satire)
- [ ] 社論 (opinion/editorial)
- [ ] 通訊社稿件 (應為 center)
- [ ] 新聞稿 (低爭議度)
- [ ] 長文章 > 2000 字 (推理時間)
- [ ] 短文章 < 200 字 (穩定性)
- [ ] 中英夾雜 (分詞正確性)

---

## 🎯 來源準確率追蹤

| 來源 | 預期偏向 | 實際 avg | 準確率 | 備註 |
|------|---------|----------|--------|------|
| 自由時報 | left | TBD | TBD | |
| 中國時報 | right | TBD | TBD | |
| 聯合報 | right | TBD | TBD | |
| 中央社 | center | TBD | TBD | 基準校正用 |
| 公視新聞 | center | TBD | TBD | 基準校正用 |
| 報導者 | center | TBD | TBD | |

---

## ⚠️ Common Mistakes

### Mistake 1: 只看整體準確率
```
❌ "整體 F1=0.72" — extreme_left 可能 0.0
✅ 分開看每個分類的 P/R/F1
```

### Mistake 2: 資料集偏斜
```
❌ 20 篇中 15 篇來自同一來源
✅ 均勻分布，覆蓋所有 BIAS_CATEGORIES
```

### Mistake 3: 未記錄 Prompt 版本
```
❌ "準確率提高了" — 哪個 Prompt?
✅ 每次記錄 prompt_version
```

### Mistake 4: 只在高階裝置測效能
```
❌ M3 MacBook 永遠 < 1s
✅ 三個層級都測
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-03-06 | 骨架版本 |
| v1.0 | 2026-03-06 | 完整評估框架 |
| v2.0 | 2026-03-07 | 模型 4B 實測數據 + RAG MVP 結果 + 能力矩陣 |

---

**文件維護者**: T03 (AI Inference Team)
**最後更新**: 2026-03-07
**狀態**: ✅ 完成 (框架建立，實測數據已填入)
