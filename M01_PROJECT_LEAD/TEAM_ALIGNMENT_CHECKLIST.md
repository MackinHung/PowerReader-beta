# ✅ 跨團隊對齊檢查清單 (Team Alignment Checklist)

## 📍 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md
- **下游文件**: 所有團隊
- **維護者**: M01 (需求師 & 專案邏輯檢測師)
- **最後更新**: 2025-03-06

---

## 🎯 使用時機
**M01 必須在每個階段結束時執行本檢查清單**,確保所有團隊對齊並記錄到 MASTER_ROADMAP.md。

---

## 📋 階段 1: 架構設計階段檢查清單

### 資料結構對齊
- [ ] T01 的 KV Schema 已定義完成
- [ ] T01 的 API Routes 已定義完成
- [ ] 向 T02 確認: "你們的 CKIP BERT 輸出格式是否符合 KV Schema?"
- [ ] 向 T03 確認: "你們的 Qwen 輸入格式是否符合 KV Schema?"
- [ ] 向 T04 確認: "你們的前端讀取 API 格式是否清楚?"
- [ ] 向 T05 確認: "你們的點數系統 KV 格式是否符合 Schema?"
- [ ] 檢查: 是否有欄位名稱衝突? (例如 `tokens` vs `words`)
- [ ] 檢查: 是否有資料型別不一致? (例如 timestamp 格式)

### 習慣與規範回顧
- [ ] 所有團隊都知道 `shared/config.js` 的存在
- [ ] 所有團隊都知道 `shared/enums.js` 的存在
- [ ] 確認沒有硬編碼字串 (必須使用 Enum)
- [ ] 確認所有常數都在 `shared/config.js` 定義
- [ ] 確認文檔已同步更新

### 跨團隊對齊詢問範例

**M01 → T02** (English):
```
Hi T02,

T01 has defined the KV Schema (see T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md).
Please confirm:
1. Does your CKIP BERT output format align with the schema?
2. Are you using the `tokens` field (not `words`)?
3. Do you need any additional fields in the schema?

Please reply by [date].

Best,
M01
```

**M01 → 專案負責人** (繁體中文):
```
階段 1 對齊檢查完成報告:

✅ 已完成:
- T01 KV Schema 定義完成
- T02 確認 CKIP BERT 輸出格式對齊
- T03 確認 Qwen 輸入格式對齊

⚠️ 待確認:
- T04 前端 API 讀取邏輯尚未確認
- T05 點數系統 KV 格式待討論

🔴 發現問題:
- (無)

請確認是否可以進入階段 2?
```

---

## 📋 階段 2: 爬蟲與數據處理階段檢查清單

### 資料結構對齊
- [ ] T02 的爬蟲輸出格式是否符合 KV Schema?
- [ ] T02 的 CKIP BERT 分詞結果是否符合 T03 期望?
- [ ] 檢查: MinHash 相似度計算結果的儲存格式

### 合規檢查
- [ ] T06 已審查 T02 的 robots.txt 遵守機制
- [ ] T06 已審查 T02 的 Rate Limiting 持久化
- [ ] T06 已審查 T02 的 User-Agent 設定
- [ ] T06 已審查 T02 的快取策略

### 跨團隊對齊詢問範例

**M01 → T06** (English):
```
Hi T06,

T02 has implemented the crawler (see T02_DATA_ACQUISITION/CRAWLER_SPEC.md).
Please perform compliance review:
1. robots.txt compliance
2. Rate limiting persistence (must use KV, not in-memory!)
3. User-Agent declaration
4. Cache strategy

Please submit review report by [date].

Best,
M01
```

---

## 📋 階段 3: AI 推理與品質驗證階段檢查清單

### 資料結構對齊
- [ ] T03 的 Prompt 版本是否已鎖定並記錄?
- [ ] T03 的評分輸出格式是否符合 KV Schema?
- [ ] T03 的品質閘門邏輯是否與 T05 獎金系統一致?

### 安全檢查
- [ ] T06 已審查 T03 的錯誤訊息處理 (不洩漏內部資訊)
- [ ] T06 已審查 T03 的 Prompt injection 防護
- [ ] 檢查: 錯誤訊息是否都使用 `shared/enums.js` 的 `getUserErrorMessage()`?

### Prompt 版本對齊
- [ ] T03 的 Prompt v1.0 已在 `T03_AI_INFERENCE/PROMPT_VERSIONS.md` 記錄
- [ ] 所有團隊都知道當前使用的 Prompt 版本
- [ ] Prompt 變更流程已建立 (GitHub PR + 測試報告)

---

## 📋 階段 4: 前端與用戶體驗階段檢查清單

### 資料結構對齊
- [ ] T04 的 PWA IndexedDB Schema 是否與 KV Schema 一致?
- [ ] T04 的 LINE Bot 訊息格式是否符合長度限制 (≤ 200 字)?
- [ ] T04 的前端評分顯示是否符合 T03 的輸出格式?

### 安全檢查
- [ ] T06 已審查 T04 的 XSS 防護 (所有使用者輸入都轉義)
- [ ] T06 已審查 T04 的錯誤訊息處理
- [ ] 檢查: 是否所有使用者輸入都經過 `escapeHtml()`?

### UI 在地化對齊
- [ ] T04 的新聞分類是否使用 `shared/enums.js` 的 `NEWS_CATEGORIES`?
- [ ] T04 的媒體名稱是否使用 `shared/enums.js` 的 `NEWS_SOURCES`?
- [ ] T04 的顏色主題是否使用 `shared/enums.js` 的 `THEME_COLORS`?

---

## 📋 階段 5: 獎金系統與部署階段檢查清單

### 資料結構對齊
- [ ] T05 的點數計算邏輯是否與 T03 的品質閘門一致?
- [ ] T05 的票選結果儲存格式是否符合 KV Schema?
- [ ] T05 的 Fisher-Yates 洗牌演算法是否可驗證?

### 審計對齊
- [ ] T05 的票選結果是否 commit 到 GitHub?
- [ ] T05 的審計日誌是否在 `T05_REWARD_SYSTEM/VOTE_AUDIT_LOG.md` 記錄?
- [ ] 檢查: 票選演算法是否使用 `record_hash` 作為 seed?

### 部署流程對齊
- [ ] T07 的 CI/CD Pipeline 是否涵蓋所有團隊的代碼?
- [ ] T07 的監控儀表板是否監控所有關鍵指標?
- [ ] 檢查: 部署流程是否會中斷服務?

---

## 📊 對齊狀態總覽 (滾動式更新)

| 階段 | T01 | T02 | T03 | T04 | T05 | T06 | T07 | 整體狀態 |
|------|-----|-----|-----|-----|-----|-----|-----|---------|
| 階段 1 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ 進行中 |
| 階段 2 | - | ⏳ | - | - | - | ⏳ | - | ⏳ 待開始 |
| 階段 3 | - | - | ⏳ | - | - | ⏳ | - | ⏳ 待開始 |
| 階段 4 | - | - | - | ⏳ | - | ⏳ | - | ⏳ 待開始 |
| 階段 5 | - | - | - | - | ⏳ | - | ⏳ | ⏳ 待開始 |

圖例:
- ✅ 已對齊
- 🔄 對齊中
- ⏳ 待開始
- ❌ 對齊失敗

---

## 📝 對齊會議紀錄範本

### 對齊會議 #001: 階段 1 跨團隊對齊
**日期**: YYYY-MM-DD
**參與者**: M01, T01, T02, T03, T04, T05, T06, T07
**議程**:
1. T01 說明 KV Schema 設計
2. T01 說明 API Routes 定義
3. 各團隊確認介面對齊
4. 討論發現的矛盾

**決議事項**:
- [ ] 決議1
- [ ] 決議2

**行動項目**:
| 團隊 | 行動項目 | 期限 | 狀態 |
|------|---------|------|------|
| T02 | 修改 CKIP BERT 輸出格式 | YYYY-MM-DD | ⏳ |

**下次會議**: YYYY-MM-DD

---

## 🚀 快速檢查腳本 (概念範例)

```bash
# (範例,不執行)
# M01 可以使用此腳本快速檢查對齊狀態

# 檢查 shared/config.js 是否被所有團隊引用
grep -r "from.*shared/config" T0*/**/*.js

# 檢查是否有硬編碼的新聞來源名稱
grep -r "自由時報" --exclude-dir=shared T0*/**/*.js
# (應該只在 shared/enums.js 出現)

# 檢查是否有硬編碼的評分範圍
grep -r "100" --exclude-dir=shared T0*/**/*.js
# (應該使用 ANALYSIS.BIAS_SCORE_MAX)
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v1.0 | 2025-03-06 | 初版跨團隊對齊檢查清單 | 專案啟動,建立對齊機制 |

---

**文件維護者**: M01 (需求師 & 專案邏輯檢測師)
**最後更新**: 2025-03-06
**下次審查**: 每個階段結束時
