# 📚 台灣新聞立場分析系統 - 團隊文件架構總覽

## 🎯 已完成文件

### 核心文件 ✅
- [x] `CLAUDE.md` - 冷啟動主文件
- [x] `MASTER_ROADMAP.md` - 主節點路線圖
- [x] `shared/config.js` - 集中配置 (SSOT)
- [x] `shared/enums.js` - Enum 定義 (SSOT)

### M01 專案領導文件 ✅
- [x] `M01_PROJECT_LEAD/LOGIC_CONTRADICTION_REPORTS.md` - 邏輯矛盾報告 (滾動式紀錄)
- [x] `M01_PROJECT_LEAD/TEAM_ALIGNMENT_CHECKLIST.md` - 跨團隊對齊檢查清單

### T01 系統架構文件 (部分完成)
- [x] `T01_SYSTEM_ARCHITECTURE/KV_SCHEMA.md` - KV Schema 設計 (SSOT)
- [ ] `T01_SYSTEM_ARCHITECTURE/API_ROUTES.md` - API Routes 定義 (SSOT)
- [ ] `T01_SYSTEM_ARCHITECTURE/CLOUDFLARE_ARCHITECTURE.md` - Cloudflare 架構說明

---

## 📋 待建立文件清單

### T02 數據獲取團隊 (3 份文件)
- [ ] `T02_DATA_ACQUISITION/CRAWLER_SPEC.md`
  - 爬蟲技術規格
  - Rate Limiting 實作 (持久化到 KV)
  - robots.txt 遵守機制
  - User-Agent 設定
  - GitHub Actions 排程設定

- [ ] `T02_DATA_ACQUISITION/NEWS_SOURCES.md` (SSOT)
  - 台灣新聞來源完整清單
  - 每個來源的 URL 模式
  - 爬蟲頻率設定
  - 合規注意事項

- [ ] `T02_DATA_ACQUISITION/DEDUPLICATION_LOGIC.md`
  - MinHash 演算法說明
  - 相似度閾值定義 (< 30% 原創, 30-70% 不同角度, > 70% 轉載, > 85% 重複)
  - 去重處理流程

---

### T03 AI 推理團隊 (3 份文件)
- [ ] `T03_AI_INFERENCE/PROMPT_VERSIONS.md` (SSOT + 滾動式紀錄)
  - Prompt v1.0.0 完整內容
  - 版本變更歷史
  - 每個版本的測試結果 (至少 10 篇文章)
  - PR 審查流程

- [ ] `T03_AI_INFERENCE/QUALITY_GATES.md`
  - 4 層品質驗證邏輯
    - Layer 1: JSON 格式驗證
    - Layer 2: 數值範圍驗證
    - Layer 3: 一致性檢查 (同作者差距 < 35%)
    - Layer 4: 去重檢測
  - 目標通過率 60-70%

- [ ] `T03_AI_INFERENCE/MODEL_ACCURACY_REPORT.md`
  - 台灣華語準確率測試
  - 金標準資料集 (20 篇測試文章)
  - 與人工標註的一致性比較
  - Qwen3.5-2B vs 其他模型的對比

---

### T04 前端體驗團隊 (3 份文件)
- [ ] `T04_FRONTEND/PWA_SPEC.md`
  - PWA 技術規格
  - IndexedDB Schema 設計
  - Service Worker 快取策略
  - 模型檔案下載邏輯 (WiFi only, 電量 > 20%)
  - Storage Persistence 請求

- [ ] `T04_FRONTEND/LINE_BOT_DESIGN.md`
  - LINE Bot 設計規範
  - Flex Message 格式
  - 訊息長度限制 (≤ 200 字)
  - 新用戶流程設計
  - LINE 官方審查注意事項

- [ ] `T04_FRONTEND/UI_LOCALIZATION.md`
  - 台灣華語在地化指南
  - 新聞分類用語 (政治、經濟、社會等)
  - 媒體名稱顯示
  - 顏色視覺編碼 (左/右立場顏色)
  - 日期時間格式 (台灣時區)

---

### T05 獎金系統團隊 (3 份文件)
- [ ] `T05_REWARD_SYSTEM/REWARD_MECHANISM.md`
  - 點數機制設計
  - 每 0.1 點 = 一篇通過驗證的分析
  - 10 點 = 1 張投票權
  - 點數無法轉帳、買賣

- [ ] `T05_REWARD_SYSTEM/FISHER_YATES_SPEC.md`
  - Fisher-Yates 洗牌演算法
  - Seed 來源 (record_hash)
  - 可驗證性設計
  - 相同 seed 產生相同結果

- [ ] `T05_REWARD_SYSTEM/VOTE_AUDIT_LOG.md` (滾動式紀錄)
  - 票選結果審計日誌
  - 每次票選的 seed、結果、commit hash
  - GitHub 可審計性
  - 透明度機制

---

### T06 合規與安全團隊 (3 份文件)
- [ ] `T06_COMPLIANCE/CRAWLER_COMPLIANCE.md` (SSOT)
  - robots.txt 遵守規範
  - Rate Limiting 規範 (≥ 2 秒/請求)
  - User-Agent 規範
  - 快取策略 (24 小時內不重爬)
  - 新聞來源尊重 (canonical 標註)

- [ ] `T06_COMPLIANCE/PRIVACY_POLICY.md`
  - 隱私政策
  - 本地算力,數據不上傳
  - 貢獻者匿名化 (Google UID hash)
  - GDPR / 台灣個資法合規
  - 用戶資料保留政策

- [ ] `T06_COMPLIANCE/ERROR_HANDLING.md` (SSOT)
  - 錯誤處理規範
  - 不洩漏內部錯誤給客戶端 (參考 OceanRAG 教訓)
  - 統一使用 `shared/enums.js getUserErrorMessage()`
  - 伺服器端完整日誌記錄

---

### T07 部署監控團隊 (3 份文件)
- [ ] `T07_DEPLOYMENT/CI_CD_PIPELINE.md`
  - GitHub Actions CI/CD 流程
  - 每日自動爬蟲排程
  - 失敗通知機制 (最多重試 3 次)
  - Email 通知設定

- [ ] `T07_DEPLOYMENT/MONITORING_DASHBOARD.md`
  - 監控儀表板設計
  - Cloudflare Pages `/admin` 實作
  - 監控指標:
    - 總文章數
    - 今日通過率
    - KV 使用量
    - 熱門回傳者排名
  - 每小時更新

- [ ] `T07_DEPLOYMENT/PERFORMANCE_BENCHMARKS.md`
  - 效能基準定義
  - KV 延遲 < 30ms
  - CDN 快取命中率 > 80%
  - 本地模型推理 < 5 秒/篇
  - 測試方法和工具

---

## 📊 文件統計

- **已完成**: 7 份
- **待建立**: 21 份
- **總計**: 28 份

### 按類型統計
- SSOT (單一真理來源): 7 份
- 滾動式紀錄: 3 份
- 技術規格: 10 份
- 設計文檔: 5 份
- 測試報告: 2 份
- 核心文件: 1 份

---

## 🚀 建立優先級

### 🔴 高優先級 (階段 1 必需)
1. `T01_SYSTEM_ARCHITECTURE/API_ROUTES.md` - T02, T03, T04 都需要
2. `T02_DATA_ACQUISITION/NEWS_SOURCES.md` - 爬蟲必需
3. `T03_AI_INFERENCE/PROMPT_VERSIONS.md` - AI 推理必需

### 🟡 中優先級 (階段 2-3)
4. `T02_DATA_ACQUISITION/CRAWLER_SPEC.md`
5. `T06_COMPLIANCE/CRAWLER_COMPLIANCE.md`
6. `T03_AI_INFERENCE/QUALITY_GATES.md`

### 🟢 低優先級 (階段 4-5)
7. `T04_FRONTEND/PWA_SPEC.md`
8. `T05_REWARD_SYSTEM/REWARD_MECHANISM.md`
9. `T07_DEPLOYMENT/CI_CD_PIPELINE.md`

---

## 📝 文件建立標準

所有文件都必須包含:

### 1. 導航區塊
```markdown
## 📍 導航
- **上游文件**: [列出依據的文件]
- **下游文件**: [列出使用此文件的團隊/文件]
- **維護者**: [負責團隊]
- **類型**: [SSOT / 滾動式紀錄 / 技術規格 / 等]
- **最後更新**: YYYY-MM-DD
```

### 2. 文件目的
```markdown
## 🎯 文件目的
[簡述此文件的用途和重要性]
```

### 3. 變更紀錄
```markdown
## 📜 變更紀錄
| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v1.0 | 2025-03-06 | 初版 | 專案啟動 |
```

### 4. OceanRAG 教訓參考
```markdown
## ⚠️ Common Mistakes (Learned from OceanRAG)
[引用相關的錯誤案例]
```

### 5. 範例代碼 (僅參考,不執行)
```javascript
// Example (concept only, not executable)
```

---

## 💡 下一步建議

### 選項 A: 快速建立所有文件骨架
為所有 21 份待建立文件建立骨架 (包含導航、目的、變更紀錄),詳細內容之後補充。

**優點**: 快速建立完整架構,讓所有團隊看到全貌
**缺點**: 內容不夠詳細,需要後續補充

### 選項 B: 按優先級逐步完成
按照高→中→低優先級,逐步完成每份文件的詳細內容。

**優點**: 每份文件都完整且可用
**缺點**: 需要較長時間,低優先級文件需等待

### 選項 C: 混合模式 (推薦)
先建立所有文件骨架,然後優先完成高優先級文件的詳細內容。

**優點**: 兼顧架構完整性和內容品質
**缺點**: 需要分兩輪工作

---

## 🎯 您的決策

請確認:
1. 是否需要繼續建立剩餘的 21 份文件?
2. 採用哪種建立策略? (A / B / C)
3. 是否有需要調整的文件清單?
4. 是否有需要補充的內容?

---

**文件建立者**: Claude Agent
**建立日期**: 2025-03-06
**狀態**: 等待專案負責人確認
