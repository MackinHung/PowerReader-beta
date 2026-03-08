# Privacy Policy (隱私權政策)

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js (`SECURITY` section), shared/enums.js (`PLATFORMS`)
- **下游文件**: T04_FRONTEND/PWA_SPEC.md, T04_FRONTEND/LINE_BOT_DESIGN.md, T06_COMPLIANCE/CRAWLER_COMPLIANCE.md
- **維護者**: T06 Compliance
- **類型**: 參考文檔 (法律合規)
- **最後更新**: 2026-03-07

---

## 文件目的

本文件定義「台灣新聞立場分析系統 (Taiwan News Bias Analysis System)」的隱私權政策。
適用於所有存取管道 (platforms) 的使用者,說明系統如何蒐集、處理、儲存及保護個人資料。

本政策遵守中華民國《個人資料保護法》(PDPA) 及相關施行細則。

---

## 適用範圍

本隱私權政策適用於以下全部 5 個平台管道 (引用自 `shared/enums.js` 的 `PLATFORMS`):

| 平台代號 | 平台名稱 | 說明 |
|----------|---------|------|
| `web` | PWA 網頁應用 | Cloudflare Pages 上的漸進式網頁應用 |
| `line_bot` | LINE Bot | LINE 官方帳號機器人 |
| `browser_extension` | 瀏覽器擴充功能 | Chrome/Firefox 擴充套件 |
| `email` | Email 訂閱 | 電子郵件訂閱服務 |
| `api` | API 直接存取 | 開發者 API 介面 |

無論使用者透過哪個管道使用本系統,均適用相同的隱私保護標準。

---

## 蒐集的資料

### 身份識別資料 (僅雜湊值)

| 資料項目 | 蒐集方式 | 儲存形式 | 用途 |
|---------|---------|---------|------|
| Google OAuth 識別碼 | 使用者主動登入 | SHA-256 雜湊值 (不可逆) | 使用者帳號識別、貢獻紀錄歸屬 |
| LINE User ID | LINE Bot 互動時取得 | SHA-256 雜湊值 (不可逆) | LINE Bot 訊息推送、貢獻紀錄歸屬 |
| Email 地址 | 使用者主動訂閱 | 加密儲存 | Email 訂閱通知 (僅限 `email` 平台) |

### 使用行為資料 (匿名化)

| 資料項目 | 蒐集方式 | 儲存形式 | 用途 |
|---------|---------|---------|------|
| 分析結果 | 使用者端瀏覽器推理 (Qwen3-4B via WebLLM) | 匿名化提交 (不含身份資訊) | 偏見分數聚合、品質驗證 |
| 貢獻點數紀錄 | 系統自動計算 | 關聯至雜湊化使用者 ID | 獎金系統、票選權計算 |
| 品質驗證結果 | 4 層品質閘門自動判定 | 關聯至雜湊化使用者 ID | 貢獻品質追蹤 |

### 系統運作資料

| 資料項目 | 蒐集方式 | 儲存形式 | 用途 |
|---------|---------|---------|------|
| API 請求紀錄 | 系統自動記錄 | 結構化日誌 (不含個人身份) | 速率限制、異常偵測 |
| 錯誤日誌 | 系統自動記錄 | 伺服器端日誌 (不對外公開) | 系統除錯、穩定性監控 |

### 資料流架構與儲存 (v1.3 新增)

本系統採用「中央空廚 (Central Kitchen)」架構,資料流經兩個獨立系統:

1. **Crawler (閉源,GitHub Actions)**: 定期爬取公開新聞 → bge-small-zh-v1.5 議題篩選 → 清洗 → 透過 API 推送至 PowerReader。此階段**不涉及任何使用者個人資料**,僅處理公開新聞內容。資料處理發生在 GitHub Actions 環境中,非 Cloudflare 基礎設施。
2. **PowerReader (開源,Cloudflare 全棧)**: 接收處理好的新聞資料,提供查詢與分析服務。

#### 儲存服務與個資關聯

| 儲存服務 | 儲存內容 | 是否含個資 | 說明 |
|---------|---------|-----------|------|
| Cloudflare R2 | 新聞文章全文 (Markdown) | 否 | 僅儲存公開新聞內容;記者署名為公開資訊,直接保留 (詳見 CRAWLER_COMPLIANCE.md Section 5.3) |
| Cloudflare D1 | 使用者帳號、分析結果、獎勵紀錄、文章索引 | 是 (雜湊化) | 個人識別資料以 SHA-256 雜湊儲存 |
| Cloudflare KV | 系統設定、快取 | 否 | 不儲存個人資料,僅供系統配置使用 |
| Cloudflare Vectorize | 知識庫向量索引 | 否 | 僅儲存知識庫 (政治人物/媒體/議題) 的嵌入向量,不含使用者資料 |

---

## 明確不蒐集的資料

本系統 **明確承諾不蒐集** 以下資料:

- **真實姓名** -- 系統不要求也不儲存使用者真實姓名
- **通訊地址** -- 無需也不蒐集實體地址
- **瀏覽歷史** -- 不追蹤使用者在本系統以外的瀏覽行為
- **裝置指紋** (Device Fingerprint) -- 不使用 canvas fingerprint、WebGL fingerprint 或任何裝置辨識技術
- **地理位置** -- 不要求也不蒐集 GPS 或 IP 地理定位資料
- **社群媒體帳號** -- 除 Google OAuth 和 LINE User ID 外,不蒐集其他社群帳號
- **支付資訊** -- 本系統為免費開源專案,不處理任何支付資訊

---

## 台灣個人資料保護法 (PDPA) 合規

本系統遵守中華民國《個人資料保護法》(個資法) 第 5 條至第 11 條:

### 蒐集合法性 (第 5 條)
- 所有個人資料蒐集均經使用者明確同意 (OAuth 授權流程)
- 蒐集目的明確且特定: 新聞立場分析系統的帳號管理與貢獻追蹤

### 告知義務 (第 8 條)
- 本隱私權政策即為告知文件
- 於使用者首次登入時顯示並取得同意

### 安全維護 (第 6 條)
- 個人識別資料以 SHA-256 不可逆雜湊處理
- JWT RS256 非對稱加密簽章
- Session 交叉驗證機制

### 目的限制 (第 5 條)
- 蒐集的資料僅用於本系統服務,不做其他用途
- 不將資料提供給第三方

### 資料正確性 (第 11 條)
- 使用者可隨時查閱、更正或刪除其個人資料 (詳見「使用者權利」段落)

---

## 使用者權利

依據台灣個資法,使用者享有以下權利:

### 查閱權 (Right of Access)
使用者可查閱系統中與其相關的所有資料。

```
API 端點: GET /api/user/me/data
認證方式: JWT Bearer Token
回應內容: 使用者個人資料、貢獻紀錄、點數紀錄
```

### 更正權 (Right of Correction)
使用者可更正其個人資料中的錯誤。

```
API 端點: PUT /api/user/me/profile
認證方式: JWT Bearer Token
可更正欄位: 顯示名稱、通知偏好、訂閱設定
```

### 刪除權 (Right of Deletion)
使用者可要求刪除其所有個人資料。

```
API 端點: DELETE /api/user/me/account
認證方式: JWT Bearer Token
處理方式: 完全刪除雜湊化身份資料;歷史貢獻資料轉為匿名保留 (無法反向追溯)
處理時間: 30 日內完成
```

### 可攜權 (Right of Portability)
使用者可匯出其個人資料的可攜格式。

```
API 端點: GET /api/user/me/export
認證方式: JWT Bearer Token
匯出格式: JSON
內容: 帳號資料、貢獻紀錄、點數紀錄、票選紀錄
```

---

## 資料保留政策

引用自 `shared/config.js` 的 `SECURITY` 配置:

| 設定項目 | 配置值 | 說明 |
|---------|--------|------|
| `SECURITY.DATA_RETENTION_DAYS` | **365** (天) | 所有使用者相關資料最多保留 365 天 |
| `REWARD.AUDIT_RETENTION_DAYS` | **365** (天) | 獎金審計日誌保留 365 天 |

### 保留規則
- 超過保留期限的資料將自動清除或匿名化
- 使用者主動刪除帳號時,個人資料於 30 日內完全清除
- 匿名化的聚合統計資料 (如整體偏見分數分布) 不受保留期限限制

---

## 匿名化機制

引用自 `shared/config.js` 的 `SECURITY` 配置:

| 設定項目 | 配置值 | 說明 |
|---------|--------|------|
| `SECURITY.ANONYMIZE_CONTRIBUTORS` | **true** | 所有貢獻者資料預設匿名化 |

### 匿名化方式
1. **身份雜湊**: Google OAuth ID 和 LINE User ID 皆使用 SHA-256 不可逆雜湊,原始 ID 不儲存
2. **貢獻匿名**: 公開的分析結果不包含任何可識別貢獻者的資訊
3. **聚合統計**: 所有對外公開的統計資料均為聚合結果,無法反推個別使用者

---

## Cookie 政策

### 不使用追蹤 Cookie
本系統 **不使用任何追蹤 Cookie** (包括第三方追蹤 Cookie、廣告 Cookie、分析 Cookie)。

### 僅使用 Session Cookie
| Cookie 類型 | 用途 | 有效期 | 範圍 |
|------------|------|--------|------|
| Session Cookie | 維持登入狀態 | `SECURITY.SESSION_TTL_HOURS`: 24 小時 | 僅限本站 (First-party) |
| JWT Token | API 認證 | `SECURITY.JWT_TTL_DAYS`: 30 天 | 僅限本站 (First-party) |

### 本地儲存 (IndexedDB)
PWA 使用 IndexedDB 快取已下載的分析資料:
- 資料庫名稱: `FRONTEND.INDEXEDDB_NAME` = `TaiwanNewsBias`
- 快取天數: `FRONTEND.INDEXEDDB_CACHE_DAYS` = 10 天
- 不含個人身份資訊
- 使用者可隨時透過瀏覽器設定清除

---

## 資料共享政策

### 不與第三方共享
本系統 **不將任何使用者資料分享給第三方**。原因:

1. **自建架構**: PowerReader 完全建置於 Cloudflare 基礎設施上 (Workers + D1 + R2 + KV + Vectorize),不依賴第三方分析或廣告服務
2. **開源專案**: PowerReader 採用 AGPL-3.0 授權,所有程式碼公開透明。Crawler 為獨立閉源 repo,僅處理公開新聞內容,不接觸使用者個資
3. **無商業動機**: 本專案為公民科技專案,無廣告收益或資料販售需求

### 例外情況
僅在以下情況下可能揭露資料:
- **法律要求**: 依中華民國法律,經法院裁定或檢察官命令
- **安全事件**: 為保護系統安全而必須的最小揭露

---

## 安全措施

引用自 `shared/config.js` 的 `SECURITY` 配置:

### 認證安全
| 機制 | 配置 | 說明 |
|------|------|------|
| JWT 簽章演算法 | `SECURITY.JWT_ALGORITHM`: **RS256** | 非對稱加密,私鑰不離開伺服器 |
| JWT 有效期 | `SECURITY.JWT_TTL_DAYS`: **30** 天 | 過期自動失效 |
| Session 交叉驗證 | `SECURITY.SESSION_CROSS_VERIFY`: **true** | JWT 與 Session 雙重驗證,防止 IDOR 攻擊 |

### 輸入安全
| 機制 | 配置 | 說明 |
|------|------|------|
| HTML 轉義 | `SECURITY.ESCAPE_HTML`: **true** | 所有使用者輸入統一轉義,防止 XSS |

### API 速率限制
| 機制 | 配置 | 說明 |
|------|------|------|
| 每分鐘限制 | `SECURITY.API_RATE_LIMIT_PER_MINUTE`: **60** | 防止暴力攻擊 |
| 每小時限制 | `SECURITY.API_RATE_LIMIT_PER_HOUR`: **1000** | 防止 DDoS |

### 爬蟲 Rate Limit
| 機制 | 配置 | 說明 |
|------|------|------|
| 請求間隔 | `CRAWLER.RATE_LIMIT_DELAY_MS`: **2000** ms | 每來源至少 2 秒間隔 |
| 持久化 | `CRAWLER.RATE_LIMIT_PERSISTENT`: **true** | 儲存於 KV,重啟不歸零 |

---

## Common Mistakes (Learned from OceanRAG)

### Mistake 1: 以明文儲存個人識別資訊 (PII)

- **問題**: 將 Google OAuth ID 或 LINE User ID 以明文直接存入資料庫
- **風險**: 資料外洩時可直接關聯到使用者的 Google/LINE 帳號
- **正確做法**: 所有個人識別資訊必須經 SHA-256 雜湊處理後再儲存,原始值不落地

```javascript
// WRONG: 直接儲存原始 ID
await kv.put(`user:${googleOAuthId}`, userData);

// CORRECT: 雜湊後儲存
const hashedId = await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(googleOAuthId)
);
const hashHex = Array.from(new Uint8Array(hashedId))
  .map(b => b.toString(16).padStart(2, '0')).join('');
await kv.put(`user:${hashHex}`, userData);
```

### Mistake 2: 在公開結果中洩漏貢獻者身份

- **問題**: 分析結果 API 的回應中包含貢獻者的雜湊 ID
- **風險**: 長期追蹤特定雜湊 ID 的行為模式,可能推斷出使用者身份
- **正確做法**: 公開 API 回應中完全不包含貢獻者相關欄位;`SECURITY.ANONYMIZE_CONTRIBUTORS = true` 時,聚合結果不帶任何個人標記

```javascript
// WRONG: 公開結果包含 contributor 欄位
return {
  bias_score: 65,
  contributor_hash: "a1b2c3..."  // 可被追蹤!
};

// CORRECT: 公開結果完全匿名
return {
  bias_score: 65
  // contributor 資訊僅在內部使用,不對外暴露
};
```

### Mistake 3: Session Cookie 缺少安全標記

- **問題**: Cookie 未設定 `Secure`、`HttpOnly`、`SameSite` 屬性
- **風險**: Cookie 可被 JavaScript 讀取 (XSS) 或在跨站請求中被送出 (CSRF)
- **正確做法**: 所有 Cookie 必須設定完整安全屬性

```javascript
// WRONG: 裸 Cookie
Set-Cookie: session=abc123

// CORRECT: 完整安全屬性
Set-Cookie: session=abc123; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400
```

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 |
| v1.0 | 2026-03-06 | 完整隱私權政策 | 填充所有章節: 適用範圍、蒐集資料、PDPA 合規、使用者權利、資料保留、匿名化、Cookie 政策、資料共享、安全措施、Common Mistakes |
| v1.3 | 2026-03-07 | 對齊 v1.3 架構: Qwen3.5-4B、中央空廚架構、R2/D1/Vectorize 儲存服務、雙 repo 隱私影響 | 架構升級 v1.2-v1.3,模型與儲存架構變更 |

---

**文件維護者**: T06 Compliance
**最後更新**: 2026-03-07
**狀態**: v1.3 完成
