# UI Localization (在地化規格書)

## 導航

- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js (`LOCALIZATION`, `FRONTEND`), shared/enums.js (`NEWS_CATEGORIES`, `BIAS_CATEGORIES`, `CONTROVERSY_LEVELS`, `THEME_COLORS`, `NEWS_SOURCES`, `ERROR_TYPES`)
- **下游文件**: T04_FRONTEND/PWA_SPEC.md (Manifest `lang`, UI 文案), T04_FRONTEND/LINE_BOT_DESIGN.md (LINE Bot 訊息文案), T06_COMPLIANCE/ERROR_HANDLING.md (使用者錯誤訊息)
- **維護者**: T04 (Frontend Experience Team)
- **類型**: SSOT - 前端在地化規格
- **最後更新**: 2026-03-07

**修改此文件時必須通知**: T03 (Prompt 中文用語一致性), T06 (錯誤訊息合規)

---

## 1. 文件目的

此文件是 **台灣新聞立場分析系統前端在地化的唯一規格來源 (SSOT)**。

定義內容包含:

- zh-TW 在地化策略與 i18n 架構
- 所有 UI 字串的繁體中文翻譯對照表
- 台灣特有政治術語與機構名稱規範
- 日期、時間、數字的格式化規則
- 錯誤訊息的在地化映射
- 無障礙 (a11y) 螢幕閱讀器文字規範
- 字型選擇與排版建議

所有前端顯示文字必須遵循本文件定義,**禁止在程式碼中直接硬編碼中文字串**。

---

## 2. 在地化策略 (zh-TW Localization Strategy)

### 2.1 核心原則

| 原則 | 說明 |
|------|------|
| 單一語系優先 | v1.0 僅支援 `zh-TW` (繁體中文台灣),不做多語系架構 |
| 字串集中管理 | 所有 UI 字串統一定義在 `locale/zh-TW.js`,禁止散落在各元件中 |
| Enum 顯示分離 | `shared/enums.js` 儲存程式用 key,`locale/zh-TW.js` 儲存顯示用 label |
| 台灣用語優先 | 使用台灣慣用語,非中國大陸用語 (例: 程式/程序, 資料/数据) |
| 無障礙完整 | 每個互動元件都必須有對應的 `aria-label` 中文文字 |

### 2.2 語系設定來源

所有語系相關設定從 `shared/config.js` 的 `LOCALIZATION` 區塊讀取:

```javascript
// shared/config.js - LOCALIZATION
export const LOCALIZATION = {
  DEFAULT_LOCALE: "zh-TW",       // BCP 47 語系標籤
  DEFAULT_TIMEZONE: "Asia/Taipei", // IANA 時區
  DATE_FORMAT: "YYYY-MM-DD",     // ISO 8601 日期格式
  TIME_FORMAT: "HH:mm:ss"        // 24 小時制
};
```

### 2.3 HTML 語系宣告

```html
<!DOCTYPE html>
<html lang="zh-TW" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="language" content="zh-TW">
  <!-- ... -->
</head>
```

### 2.4 未來多語系擴充

當前架構預留多語系擴充空間,但 v1.0 不實作:

```
locale/
├── zh-TW.js    // v1.0 唯一語系 (SSOT)
├── en-US.js    // 預留,v2.0 考慮
└── index.js    // 語系載入器 (根據 config.js 決定)
```

---

## 3. i18n Key 命名慣例

### 3.1 命名結構

```
{feature}.{component}.{element}
```

**規則**:
- 全部使用 `snake_case`
- 最多三層深度
- feature: 功能模組 (如 `bias`, `controversy`, `nav`, `error`)
- component: UI 元件 (如 `label`, `button`, `tooltip`, `placeholder`)
- element: 具體項目 (如 `extreme_left`, `submit`, `search`)

### 3.2 命名範例

```javascript
// 正確命名
"bias.label.extreme_left"       // 立場標籤 - 極左
"controversy.label.very_high"   // 爭議程度標籤 - 極高
"nav.button.home"               // 導航按鈕 - 首頁
"error.message.not_found"       // 錯誤訊息 - 找不到
"article.status.published"      // 文章狀態 - 已發布
"model.download.wifi_required"  // 模型下載 - 需要 WiFi

// 錯誤命名
"biasExtremeLeft"               // 禁止 camelCase
"bias-label-extreme-left"       // 禁止 kebab-case
"bias.label.extreme.left.text"  // 禁止超過三層
```

### 3.3 Key 分類前綴表

| 前綴 | 用途 | 範例 |
|------|------|------|
| `bias.*` | 立場分析相關 | `bias.label.center` |
| `controversy.*` | 爭議程度相關 | `controversy.label.high` |
| `nav.*` | 導航與選單 | `nav.button.settings` |
| `error.*` | 錯誤訊息 | `error.message.rate_limit` |
| `article.*` | 文章相關 | `article.status.crawled` |
| `category.*` | 新聞分類 | `category.label.politics` |
| `source.*` | 新聞來源 | `source.display.liberty_times` |
| `model.*` | 模型管理 | `model.download.progress` |
| `reward.*` | 獎金系統 | `reward.status.earned` |
| `a11y.*` | 無障礙文字 | `a11y.bias_bar` |
| `common.*` | 通用文字 | `common.button.confirm` |
| `time.*` | 時間相關 | `time.format.relative` |
| `quality.*` | 品質門回饋 | `quality.failed_format` |
| `login.*` | 登入認證 | `login.prompt` |
| `onboarding.*` | 首次引導 | `onboarding.step1.title` |
| `privacy.*` | 隱私同意 | `privacy.consent.title` |
| `pwa.*` | PWA 相關 | `pwa.install.prompt` |

---

## 4. UI 字串對照表

### 4.1 立場分類標籤 (Bias Labels)

對應 `shared/enums.js` 的 `BIAS_CATEGORIES`:

| Enum Key | Enum Value | i18n Key | zh-TW 顯示 | 分數範圍 | 色碼 |
|----------|-----------|----------|-----------|---------|------|
| `EXTREME_LEFT` | `extreme_left` | `bias.label.extreme_left` | 極左 | < 5 | `#0066CC` |
| `LEFT` | `left` | `bias.label.left` | 偏左 | 5 - 39 | `#3399FF` |
| `CENTER_LEFT` | `center_left` | `bias.label.center_left` | 中間偏左 | 40 - 47 | `#6699CC` |
| `CENTER` | `center` | `bias.label.center` | 中立 | 48 - 52 | `#999999` |
| `CENTER_RIGHT` | `center_right` | `bias.label.center_right` | 中間偏右 | 53 - 60 | `#CC6666` |
| `RIGHT` | `right` | `bias.label.right` | 偏右 | 61 - 95 | `#FF6666` |
| `EXTREME_RIGHT` | `extreme_right` | `bias.label.extreme_right` | 極右 | > 95 | `#CC0000` |

**用法範例**:

```javascript
import { BIAS_CATEGORIES } from '../../shared/enums.js';
import { t } from '../locale/zh-TW.js';

function getBiasLabel(biasCategory) {
  const key = `bias.label.${biasCategory}`;
  return t(key); // 回傳 zh-TW 顯示文字
}

// getBiasLabel(BIAS_CATEGORIES.EXTREME_LEFT) → "極左"
// getBiasLabel(BIAS_CATEGORIES.CENTER)       → "中立"
```

**注意**: 台灣新聞語境中的「左/右」指的是政治光譜上的泛綠/泛藍立場,並非嚴格的國際政治左右派定義。立場光譜條的視覺化設計中,左側 (藍色) 對應泛綠,右側 (紅色) 對應泛藍。

### 4.2 爭議程度標籤 (Controversy Labels)

對應 `shared/enums.js` 的 `CONTROVERSY_LEVELS`:

| Enum Key | Enum Value | i18n Key | zh-TW 顯示 | 分數範圍 | 色碼 |
|----------|-----------|----------|-----------|---------|------|
| `LOW` | `low` | `controversy.label.low` | 低 | < 5 | `#28A745` |
| `MODERATE` | `moderate` | `controversy.label.moderate` | 中等 | 5 - 14 | `#FFC107` |
| `HIGH` | `high` | `controversy.label.high` | 高 | 15 - 49 | `#FD7E14` |
| `VERY_HIGH` | `very_high` | `controversy.label.very_high` | 極高 | >= 50 | `#DC3545` |

**爭議程度 Badge 樣式**:

```javascript
// 爭議程度使用中括號包覆顯示在文章卡片上
// 例: [極高爭議], [高度爭議], [中等爭議], [低度爭議]
const controversyBadge = {
  [CONTROVERSY_LEVELS.LOW]:       "低度爭議",
  [CONTROVERSY_LEVELS.MODERATE]:  "中等爭議",
  [CONTROVERSY_LEVELS.HIGH]:      "高度爭議",
  [CONTROVERSY_LEVELS.VERY_HIGH]: "極高爭議"
};
```

### 4.3 新聞分類標籤 (News Category Labels)

對應 `shared/enums.js` 的 `NEWS_CATEGORIES`:

| Enum Key | Enum Value (zh-TW) | i18n Key | 篩選器顯示 | 圖示建議 |
|----------|-------------------|----------|-----------|---------|
| `POLITICS` | `政治` | `category.label.politics` | 政治 | 🏛️ (僅設計參考,程式碼不使用 emoji) |
| `ECONOMY` | `經濟` | `category.label.economy` | 經濟 | 💰 |
| `SOCIETY` | `社會` | `category.label.society` | 社會 | 👥 |
| `TECHNOLOGY` | `科技` | `category.label.technology` | 科技 | 💻 |
| `INTERNATIONAL` | `國際` | `category.label.international` | 國際 | 🌍 |
| `ENTERTAINMENT` | `娛樂` | `category.label.entertainment` | 娛樂 | 🎬 |
| `SPORTS` | `體育` | `category.label.sports` | 體育 | ⚽ |
| `HEALTH` | `健康` | `category.label.health` | 健康 | 🏥 |
| `EDUCATION` | `教育` | `category.label.education` | 教育 | 📚 |
| `ENVIRONMENT` | `環境` | `category.label.environment` | 環境 | 🌱 |

**注意**: `NEWS_CATEGORIES` 的 Enum value 本身就是中文 (例: `POLITICS: "政治"`),因此在某些情境下可直接使用 value 顯示。但為維持 i18n key 體系的一致性,前端仍應透過 locale 檔案取得顯示文字,以便未來新增英文介面時無須修改元件邏輯。

### 4.4 新聞來源顯示名稱 (Source Display Names)

對應 `shared/enums.js` 的 `NEWS_SOURCES`:

| Enum Key | 顯示名稱 (zh-TW) | 分類 | 備註 |
|----------|-----------------|------|------|
| `LIBERTY_TIMES` | 自由時報 | 傳統泛綠媒體 | |
| `TAIWAN_APPLE_DAILY` | 蘋果日報 | 傳統泛綠媒體 | 2021 年停刊,僅歷史資料 |
| `CHINA_TIMES` | 中國時報 | 傳統泛藍媒體 | |
| `UNITED_DAILY_NEWS` | 聯合報 | 傳統泛藍媒體 | |
| `COMMON_WEALTH` | 天下雜誌 | 中立/獨立媒體 | |
| `BUSINESS_WEEKLY` | 商業週刊 | 中立/獨立媒體 | |
| `THE_NEWS_LENS` | 關鍵評論網 | 中立/獨立媒體 | |
| `THE_REPORTER` | 報導者 | 中立/獨立媒體 | |
| `CNA` | 中央社 | 公共媒體 | Central News Agency |
| `PTS` | 公視新聞 | 公共媒體 | Public Television Service |
| `ECONOMIC_DAILY_NEWS` | 經濟日報 | 財經媒體 | |
| `COMMERCIAL_TIMES` | 工商時報 | 財經媒體 | |
| `INSIDE` | Inside | 科技/新媒體 | 英文名稱,不翻譯 |
| `TECHNEWS` | 科技新報 | 科技/新媒體 | |
| `ITHOME` | iThome | 科技/新媒體 | 英文名稱,不翻譯 |
| `REW_CAUSAS` | 新新聞 | 調查報導 | |
| `STORM_MEDIA` | 風傳媒 | 調查報導 | |

**來源分類標籤 (用於篩選器)**:

```javascript
const sourceGroupLabels = {
  "pan_green":    "傳統泛綠媒體",
  "pan_blue":     "傳統泛藍媒體",
  "independent":  "中立/獨立媒體",
  "public":       "公共媒體",
  "financial":    "財經媒體",
  "tech":         "科技/新媒體",
  "investigative":"調查報導"
};
```

### 4.5 文章狀態標籤 (Article Status Labels)

對應 `shared/enums.js` 的 `ARTICLE_STATUS`:

| Enum Value | i18n Key | zh-TW 顯示 | 使用場景 |
|-----------|----------|-----------|---------|
| `crawled` | `article.status.crawled` | 已抓取 | 管理後台 |
| `tokenized` | `article.status.tokenized` | 已分詞 | 管理後台 |
| `deduplicated` | `article.status.deduplicated` | 已去重 | 管理後台 |
| `analyzed` | `article.status.analyzed` | 已分析 | 管理後台 |
| `validated` | `article.status.validated` | 已驗證 | 管理後台 |
| `published` | `article.status.published` | 已發布 | 使用者可見 |
| `rejected` | `article.status.rejected` | 未通過 | 管理後台 |
| `duplicate` | `article.status.duplicate` | 重複文章 | 管理後台 |

### 4.6 導航與通用 UI 文字

```javascript
const nav = {
  "nav.button.home":       "首頁",
  "nav.button.compare":    "比較",
  "nav.button.analyze":    "分析",
  "nav.button.profile":    "我的",
  "nav.button.settings":   "設定",
  "nav.button.search":     "搜尋",
  "nav.button.back":       "返回",
  "nav.button.share":      "分享",
  "nav.title.home":        "今日熱門新聞",
  "nav.title.compare":     "跨媒體比較",
  "nav.title.analyze":     "立場分析",
  "nav.title.profile":     "個人資料",
  "nav.title.settings":    "設定"
};

const common = {
  "common.button.confirm":     "確認",
  "common.button.cancel":      "取消",
  "common.button.submit":      "提交",
  "common.button.retry":       "重試",
  "common.button.close":       "關閉",
  "common.button.load_more":   "載入更多",
  "common.button.view_detail": "查看詳細",
  "common.button.go_original": "前往原文",
  "common.button.start_analysis": "我要分析",
  "common.label.loading":      "載入中...",
  "common.label.no_data":      "暫無資料",
  "common.label.offline":      "離線模式",
  "common.label.version":      "版本",
  "common.label.last_update":  "最後更新",
  "common.label.source_count": "來源: {count} 家媒體",
  "common.label.analyst_count":"分析: {count} 人",
  "common.label.pass_rate":    "通過率: {rate}%",
  "common.label.consensus":    "共識分數: {score}/100"
};
```

### 4.7 模型管理 UI 文字

```javascript
const model = {
  "model.title":                 "模型管理",
  "model.name":                  "Qwen3.5-4B",
  "model.version_label":         "版本: v{version}",
  "model.size_label":            "大小: 3.4 GB",
  "model.download.button":       "下載模型",
  "model.download.pause":        "暫停下載",
  "model.download.resume":       "繼續下載",
  "model.download.progress":     "已下載: {downloaded} / {total}",
  "model.download.estimate":     "預估剩餘: 約 {minutes} 分鐘",
  "model.download.complete":     "下載完成",
  "model.download.wifi_required":"請連接 WiFi 後再下載模型 (約 3.4 GB)",
  "model.download.low_battery":  "電量不足 20%,請充電後再下載",
  "model.download.charging_required": "請接上充電器後再下載模型",
  "model.delete.button":         "刪除模型",
  "model.delete.confirm":        "確定要刪除已下載的模型嗎?刪除後需要重新下載。",
  "model.status.not_downloaded": "尚未下載",
  "model.status.downloaded":     "已下載",
  "model.status.downloading":    "下載中...",
  "model.inference.webgpu":      "推理引擎: WebGPU",
  "model.inference.wasm":        "推理引擎: WASM",
  "model.inference.server":      "推理引擎: 伺服器",
  "model.inference.thinking":    "思考中...",
  "model.inference.analyzing":   "分析結果產生中...",
  "model.storage.label":         "儲存空間使用量",
  "model.inference.preparing":     "正在組裝提示詞...",
  "model.inference.running":       "AI 分析中...",
  "model.inference.generating":    "產生結果...",
  "model.inference.slow_hint":     "分析較複雜的文章需要較長時間",
  "model.inference.timeout_offer": "分析時間較長，是否切換至伺服器模式？",
  "model.inference.switch_server": "切換至伺服器模式"
};
```

### 4.8 獎金系統 UI 文字

```javascript
const reward = {
  "reward.title":              "我的點數",
  "reward.total_points":       "總點數: {points}",
  "reward.vote_power":         "投票權: {votes} 票",
  "reward.conversion_hint":    "每 10 點 = 1 票",
  "reward.history.title":      "貢獻歷史",
  "reward.history.date":       "日期",
  "reward.history.article":    "分析文章",
  "reward.history.result":     "驗證結果",
  "reward.status.pending":     "待驗證",
  "reward.status.earned":      "已獲得",
  "reward.status.rejected":    "未通過",
  "reward.status.claimed":     "已使用",
  "reward.cooldown.active":      "分析功能暫時停用",
  "reward.cooldown.remaining":   "剩餘等待時間: {minutes} 分鐘",
  "reward.cooldown.reason":      "連續 3 次未通過品質驗證，已暫停分析功能 1 小時"
};
```

### 4.9 PWA 與系統提示文字

```javascript
const pwa = {
  "pwa.install.prompt":        "將台灣新聞立場分析加入主畫面,獲得更好的使用體驗",
  "pwa.install.button":        "加入主畫面",
  "pwa.install.dismiss":       "稍後再說",
  "pwa.offline.banner":        "目前處於離線模式 - 已快取的內容仍可瀏覽,分析結果將於上線後自動提交",
  "pwa.update.available":      "有新版本可用",
  "pwa.update.button":         "立即更新",
  "pwa.sync.pending":          "有 {count} 筆資料待同步",
  "pwa.sync.complete":         "同步完成",
  "pwa.sync.failed":           "同步失敗,將於稍後重試",
  "pwa.sync.saved_offline":        "已保存，連線後自動提交",
  "pwa.sync.failed_permanent":     "同步失敗次數過多，此筆資料需手動重新提交",
  "pwa.sync.retry_button":         "重新提交",
  "pwa.sync.discard_button":       "捨棄"
};
```

### 4.10 品質門回饋訊息 (Quality Gate Feedback)

```javascript
const quality = {
  "quality.failed_format":       "分析結果格式異常，請重新分析",
  "quality.failed_range":        "分析結果包含無效數值，請重新分析",
  "quality.failed_consistency":  "您的分析與過往紀錄差異較大，請重新審視後再提交",
  "quality.failed_duplicate":    "此文章已完成分析，或已達分析次數上限"
};
```

### 4.11 文章分析期限 (Article Deadline)

```javascript
const deadline = {
  "article.deadline.remaining":   "可分析剩餘時間: {hours} 小時",
  "article.deadline.expired":     "已截止分析",
  "article.deadline.warning":     "即將截止 (剩餘 {hours} 小時)"
};
```

### 4.12 登入與認證 (Login & Auth)

```javascript
const login = {
  "login.prompt":                "請先登入以參與分析",
  "login.google_oauth":          "使用 Google 帳號登入",
  "login.anonymous_browse":      "先瀏覽看看",
  "login.success":               "登入成功",
  "login.failed":                "登入失敗，請稍後再試",
  "login.logout":                "登出",
  "login.logout_confirm":        "確定要登出嗎？"
};
```

### 4.13 首次使用引導 (Onboarding)

```javascript
const onboarding = {
  "onboarding.step1.title":      "歡迎使用新聞立場分析",
  "onboarding.step1.desc":       "透過公民算力，分析台灣新聞媒體的報導立場",
  "onboarding.step2.title":      "認識立場光譜",
  "onboarding.step2.desc":       "光譜左側代表泛綠立場，右側代表泛藍立場，中間為中立",
  "onboarding.step3.title":      "AI 本地分析",
  "onboarding.step3.desc":       "下載 AI 模型後，分析完全在您的裝置上進行，資料不會外洩",
  "onboarding.step4.title":      "開始使用",
  "onboarding.step4.desc":       "瀏覽今日新聞，或立即開始您的第一次分析",
  "onboarding.button.next":      "下一步",
  "onboarding.button.skip":      "略過",
  "onboarding.button.start":     "開始使用"
};
```

### 4.14 隱私同意 (Privacy Consent)

```javascript
const privacy = {
  "privacy.consent.title":       "隱私政策同意",
  "privacy.consent.checkbox":    "我已閱讀並同意隱私政策",
  "privacy.consent.link":        "查看完整隱私政策",
  "privacy.consent.required":    "需要同意隱私政策才能繼續",
  "privacy.consent.button":      "同意並繼續"
};
```

---

## 5. 錯誤訊息在地化表 (Error Message Localization)

### 5.1 使用者可見錯誤

對應 `shared/enums.js` 的 `ERROR_TYPES` + `getUserErrorMessage()`:

| Error Type | Enum Value | i18n Key | zh-TW 訊息 | HTTP Status | 使用者可見 |
|-----------|-----------|----------|-----------|------------|-----------|
| `VALIDATION_ERROR` | `validation_error` | `error.message.validation` | 輸入資料格式錯誤,請檢查後重試 | 400 | Yes |
| `NOT_FOUND` | `not_found` | `error.message.not_found` | 找不到請求的資源 | 404 | Yes |
| `RATE_LIMIT_EXCEEDED` | `rate_limit_exceeded` | `error.message.rate_limit` | 請求過於頻繁,請稍後再試 | 429 | Yes |
| `UNAUTHORIZED` | `unauthorized` | `error.message.unauthorized` | 未授權,請先登入 | 401 | Yes |

### 5.2 伺服器端錯誤 (使用者看到通用訊息)

| Error Type | Enum Value | 使用者看到的訊息 | 伺服器日誌 |
|-----------|-----------|----------------|-----------|
| `INTERNAL_ERROR` | `internal_error` | 系統錯誤,請稍後再試 | 完整 stack trace |
| `DATABASE_ERROR` | `database_error` | 系統錯誤,請稍後再試 | KV/R2 錯誤詳情 |
| `API_ERROR` | `api_error` | 系統錯誤,請稍後再試 | API 回應碼 + body |
| `MODEL_ERROR` | `model_error` | 系統錯誤,請稍後再試 | 模型推理錯誤詳情 |

**通用錯誤訊息來源**: `shared/config.js` 的 `FRONTEND.ERROR_MESSAGE_GENERIC = "系統錯誤,請稍後再試"`

### 5.3 前端特有錯誤訊息

```javascript
const frontendErrors = {
  "error.network.offline":       "網路連線中斷,請檢查網路設定",
  "error.network.timeout":       "連線逾時,請稍後再試",
  "error.network.slow":          "網路速度較慢,載入可能需要較長時間",
  "error.storage.full":          "儲存空間已滿,請清理快取後重試",
  "error.storage.denied":        "無法存取本地儲存,請檢查瀏覽器設定",
  "error.model.not_downloaded":  "尚未下載分析模型,請先至設定頁面下載",
  "error.model.load_failed":     "模型載入失敗,請重新下載",
  "error.model.inference_failed":"分析失敗,正在切換至伺服器模式...",
  "error.webgpu.not_supported":  "您的裝置不支援 WebGPU,將使用 WASM 模式",
  "error.wasm.not_supported":    "您的瀏覽器不支援 WASM,將使用伺服器模式",
  "error.browser.outdated":      "您的瀏覽器版本過舊,建議更新至最新版本",
  "error.sync.max_retries":      "同步失敗次數過多,此筆資料已放棄提交",
  "error.article.not_cached":    "此文章尚未快取,請在連線時重新載入"
};
```

### 5.4 錯誤訊息設計原則

1. **禁止洩漏內部資訊** - 不顯示 stack trace、KV key、API endpoint 等 (OceanRAG 教訓 #2)
2. **提供可行動建議** - 每條錯誤訊息都應告訴使用者接下來可以做什麼
3. **語氣友善** - 使用「請」開頭,避免指責性用語
4. **簡短明確** - 單一句子,不超過 30 個中文字

---

## 6. 台灣特有術語規範 (Taiwan-Specific Terminology)

### 6.1 政治機構名稱

在本系統中涉及台灣政治新聞時,必須使用以下正式名稱:

| 正式名稱 | 說明 | 禁止使用 |
|---------|------|---------|
| 立法院 | 台灣最高立法機關 | 國會 (非正式)、人大 |
| 立法委員 (立委) | 立法院成員 | 議員、代表 |
| 行政院 | 最高行政機關 | 國務院 |
| 行政院長 | 行政院首長 | 總理 |
| 司法院 | 最高司法機關 | 最高法院 |
| 考試院 | 考試權機關 | - |
| 監察院 | 監察權機關 | - |
| 總統府 | 國家元首辦公室 | - |
| 總統 | 國家元首 | 主席 |
| 直轄市 | 六都 (台北/新北/桃園/台中/台南/高雄) | 省會 |
| 縣市長 | 地方首長 | 省長 |

### 6.2 政黨與政治術語

| 術語 | 說明 | 在系統中的用途 |
|------|------|-------------|
| 泛綠 | 民進黨及其盟友陣營 | 立場光譜左側標籤 |
| 泛藍 | 國民黨及其盟友陣營 | 立場光譜右側標籤 |
| 第三勢力 | 非藍綠陣營的政治力量 | 分類標籤 |
| 兩岸關係 | 台灣與中國大陸的關係 | 新聞分類 |
| 九二共識 | 兩岸政治議題 | 新聞內容 |
| 公投 | 全國性公民投票 | 新聞分類 |
| 質詢 | 立委在立法院質詢行政官員 | 新聞內容 |

### 6.3 台灣慣用語 vs 中國大陸用語

本系統一律使用台灣繁體中文慣用語:

| 台灣用語 (使用) | 中國大陸用語 (禁止) | 領域 |
|---------------|-----------------|------|
| 程式 | 程序 | 科技 |
| 資料 | 数据 | 科技 |
| 軟體 | 软件 | 科技 |
| 硬體 | 硬件 | 科技 |
| 網路 | 网络 | 科技 |
| 伺服器 | 服务器 | 科技 |
| 影片 | 视频 | 媒體 |
| 部落格 | 博客 | 媒體 |
| 計程車 | 出租车 | 生活 |
| 捷運 | 地铁 | 交通 |
| 機車 | 摩托车 | 交通 |
| 瓦斯 | 燃气 | 生活 |
| 列印 | 打印 | 辦公 |
| 記憶體 | 内存 | 科技 |
| 滑鼠 | 鼠标 | 科技 |
| 簡訊 | 短信 | 通訊 |
| 行動裝置 | 移动设备 | 科技 |

### 6.4 貨幣與單位

| 項目 | 格式 | 範例 |
|------|------|------|
| 貨幣 | 新台幣 (NT$) 或 元 | NT$ 1,000 或 1,000 元 |
| 溫度 | 攝氏 (°C) | 28°C |
| 距離 | 公里 (km) | 300 公里 |
| 面積 | 坪 (台灣常用) 或 平方公尺 | 30 坪 |

---

## 7. 日期與時間格式化

### 7.1 時區設定

| 設定項 | 值 | 來源 |
|--------|-----|------|
| 預設時區 | `Asia/Taipei` (UTC+8) | `shared/config.js` LOCALIZATION.DEFAULT_TIMEZONE |
| 日期格式 | `YYYY-MM-DD` | `shared/config.js` LOCALIZATION.DATE_FORMAT |
| 時間格式 | `HH:mm:ss` (24 小時制) | `shared/config.js` LOCALIZATION.TIME_FORMAT |

### 7.2 日期顯示格式

```javascript
// 使用 Intl.DateTimeFormat 進行在地化格式化
const dateFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
// 輸出: "2026年3月6日"

const dateTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
// 輸出: "2026年3月6日 14:30"
```

### 7.3 日期格式使用場景

| 場景 | 格式 | 範例 |
|------|------|------|
| 文章發布日期 | `YYYY年M月D日` | 2026年3月6日 |
| 文章列表日期 | `M/D HH:mm` | 3/6 14:30 |
| 完整時間戳記 | `YYYY年M月D日 HH:mm` | 2026年3月6日 14:30 |
| 相對時間 | 動態計算 | 3 分鐘前 / 2 小時前 / 昨天 |
| ISO 格式 (API) | `YYYY-MM-DDTHH:mm:ss+08:00` | 2026-03-06T14:30:00+08:00 |

### 7.4 相對時間格式化

```javascript
function formatRelativeTime(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60)   return "剛剛";
  if (diffMin < 60)   return `${diffMin} 分鐘前`;
  if (diffHour < 24)  return `${diffHour} 小時前`;
  if (diffDay === 1)  return "昨天";
  if (diffDay === 2)  return "前天";
  if (diffDay < 7)    return `${diffDay} 天前`;
  if (diffDay < 30)   return `${Math.floor(diffDay / 7)} 週前`;

  // 超過 30 天顯示完整日期
  return dateFormatter.format(date);
}
```

### 7.5 民國年 (ROC Calendar) 選項

台灣政府文件常使用民國紀年。系統預設使用西元年,但在特定場景 (如政府新聞、法律文件相關) 可提供民國年對照:

```javascript
/**
 * 將西元年轉換為民國年
 * 民國元年 = 西元 1912 年
 */
function toROCYear(date) {
  const year = date.getFullYear();
  const rocYear = year - 1911;
  return rocYear;
}

/**
 * 格式化為民國年日期
 * 輸出: "民國115年3月6日"
 */
function formatROCDate(dateString) {
  const date = new Date(dateString);
  const rocYear = toROCYear(date);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `民國${rocYear}年${month}月${day}日`;
}

// formatROCDate("2026-03-06") → "民國115年3月6日"
```

**使用場景**:
- 政治新聞中引述政府文件日期時可顯示民國年對照
- 使用者設定中可切換「顯示民國年」選項
- 預設關閉,僅作為輔助資訊

---

## 8. 數字格式化

### 8.1 千分位分隔

台灣使用逗號 (`,`) 作為千分位分隔符號,小數點使用句點 (`.`):

```javascript
const numberFormatter = new Intl.NumberFormat('zh-TW');
// 1000    → "1,000"
// 1000000 → "1,000,000"
// 3.14    → "3.14"

function formatNumber(num) {
  return new Intl.NumberFormat('zh-TW').format(num);
}

// formatNumber(1234567) → "1,234,567"
```

### 8.2 百分比格式

```javascript
const percentFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

// 0.65  → "65%"
// 0.723 → "72.3%"
```

### 8.3 各場景數字格式

| 場景 | 格式 | 範例 |
|------|------|------|
| 立場分數 | 整數 (0-100) | 65 |
| 爭議分數 | 整數 (0-100) | 72 |
| 通過率 | 百分比 (整數) | 65% |
| 點數 | 一位小數 | 12.5 |
| 參與人數 | 千分位整數 | 1,234 |
| 檔案大小 | 兩位小數 + 單位 | 1.36 GB |
| 下載進度 | 百分比 (整數) | 68% |
| 信賴區間 | 整數範圍 | 30-40 |

---

## 9. 字型規範 (Font Recommendations)

### 9.1 字型堆疊 (Font Stack)

```css
/* 主要字型堆疊 - 繁體中文最佳化 */
:root {
  --font-sans: 'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC',
               'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'Source Code Pro', 'Noto Sans Mono CJK TC',
               'Microsoft JhengHei', Consolas, monospace;
}

body {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 9.2 字型選擇說明

| 字型 | 用途 | 說明 |
|------|------|------|
| Noto Sans TC | 首選 (Web Font) | Google 免費字型,繁體中文完整覆蓋,透過 CDN 載入 |
| Microsoft JhengHei | Windows fallback | 微軟正黑體,Windows 內建 |
| PingFang TC | macOS/iOS fallback | 蘋方-繁,Apple 系統內建 |
| Source Code Pro | 程式碼等寬字型 | 搭配 Noto Sans Mono CJK TC |

### 9.3 字型載入策略

```html
<!-- 預載入關鍵字型 -->
<link rel="preload" href="/fonts/NotoSansTC-Regular.woff2"
      as="font" type="font/woff2" crossorigin>

<style>
  @font-face {
    font-family: 'Noto Sans TC';
    font-style: normal;
    font-weight: 400;
    font-display: swap; /* 先顯示系統字型,載入後切換 */
    src: url('/fonts/NotoSansTC-Regular.woff2') format('woff2');
    unicode-range: U+4E00-9FFF, U+3400-4DBF, U+F900-FAFF; /* CJK 範圍 */
  }

  @font-face {
    font-family: 'Noto Sans TC';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url('/fonts/NotoSansTC-Bold.woff2') format('woff2');
    unicode-range: U+4E00-9FFF, U+3400-4DBF, U+F900-FAFF;
  }
</style>
```

### 9.4 字型大小規範

| 層級 | 大小 | 字重 | 用途 |
|------|------|------|------|
| H1 | 24px | 700 (Bold) | 頁面標題 |
| H2 | 20px | 700 | 區塊標題 |
| H3 | 18px | 700 | 卡片標題 |
| Body | 16px | 400 (Regular) | 內文 |
| Caption | 14px | 400 | 輔助文字 |
| Small | 12px | 400 | 標籤、時間戳 |

### 9.5 中文排版注意事項

| 規則 | 說明 |
|------|------|
| 行高 | 中文建議 `line-height: 1.6` 以上,確保可讀性 |
| 字間距 | 使用預設即可,不建議額外設定 `letter-spacing` |
| 段落間距 | 段落之間使用 `margin-bottom: 1em` |
| 標點禁則 | 句號、逗號等標點不可出現在行首 (瀏覽器預設處理) |
| 字型子集化 | 僅包含 CJK Unified Ideographs 範圍,減少檔案大小 |
| font-display | 使用 `swap`,避免 FOIT (Flash of Invisible Text) |

---

## 10. 無障礙文字 (Accessibility / a11y)

### 10.1 螢幕閱讀器文字

所有互動元件和視覺化圖表必須提供無障礙文字:

```javascript
const a11y = {
  // 導航
  "a11y.nav.main":              "主要導航",
  "a11y.nav.bottom":            "底部導航列",
  "a11y.nav.skip_to_content":   "跳至主要內容",
  "a11y.nav.breadcrumb":        "麵包屑導航",

  // 立場視覺化
  "a11y.bias_bar":              "立場分析光譜條,分數 {score},分類 {category}",
  "a11y.bias_bar.left_end":     "光譜左端,代表泛綠立場",
  "a11y.bias_bar.right_end":    "光譜右端,代表泛藍立場",
  "a11y.bias_bar.indicator":    "目前立場指標位於分數 {score},屬於{category}",

  // 爭議程度
  "a11y.controversy_bar":       "爭議程度指標,分數 {score},等級 {level}",
  "a11y.controversy_badge":     "爭議程度標籤: {level}",

  // 文章卡片
  "a11y.article_card":          "新聞文章: {title},來源: {source},發布於 {date}",
  "a11y.article_card.bias":     "立場分析: {category} (分數 {score})",
  "a11y.article_card.controversy": "爭議程度: {level}",

  // 按鈕
  "a11y.button.analyze":        "開始分析此文章的立場",
  "a11y.button.share":          "分享此分析結果",
  "a11y.button.go_original":    "在新視窗開啟原文連結",
  "a11y.button.install_pwa":    "將此應用程式加入主畫面",
  "a11y.button.download_model": "下載 AI 分析模型,檔案大小約 3.4 GB",
  "a11y.button.delete_model":   "刪除已下載的 AI 分析模型",

  // 表單
  "a11y.search.input":          "搜尋新聞文章",
  "a11y.search.clear":          "清除搜尋條件",
  "a11y.filter.category":       "依新聞分類篩選",
  "a11y.filter.source":         "依新聞來源篩選",
  "a11y.filter.controversy":    "依爭議程度篩選",

  // 狀態提示
  "a11y.status.loading":        "內容載入中,請稍候",
  "a11y.status.offline":        "目前處於離線模式",
  "a11y.status.sync_pending":   "有待同步的資料",
  "a11y.status.model_downloading": "模型下載中,進度 {percent}%",

  // 圖表
  "a11y.chart.bias_spectrum":   "跨媒體立場光譜比較圖",
  "a11y.chart.controversy_trend": "爭議程度趨勢圖",
  "a11y.chart.points_trend":    "點數趨勢折線圖,近 30 天",
  "a11y.chart.radar":           "各面向差異雷達圖",

  // 通知
  "a11y.notification.success":  "成功: {message}",
  "a11y.notification.error":    "錯誤: {message}",
  "a11y.notification.warning":  "警告: {message}",
  "a11y.notification.info":     "資訊: {message}"
};
```

### 10.2 ARIA 標籤使用規範

```html
<!-- 立場光譜條 -->
<div role="meter"
     aria-label="立場分析光譜條"
     aria-valuenow="65"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuetext="偏右,分數 65">
  <div class="bias-indicator" style="left: 65%"></div>
</div>

<!-- 爭議程度進度條 -->
<div role="meter"
     aria-label="爭議程度"
     aria-valuenow="72"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuetext="高度爭議,分數 72">
  <div class="controversy-fill" style="width: 72%"></div>
</div>

<!-- 即時更新區域 -->
<div role="status" aria-live="polite" aria-atomic="true">
  <!-- 載入狀態、同步狀態等動態訊息 -->
</div>

<!-- 搜尋結果 -->
<div role="region" aria-label="搜尋結果" aria-live="polite">
  <p>找到 {count} 篇相關文章</p>
</div>
```

### 10.3 鍵盤導航支援

| 按鍵 | 功能 | WCAG 準則 |
|------|------|-----------|
| Tab | 依序聚焦互動元件 | 2.1.1 |
| Shift+Tab | 反向聚焦 | 2.1.1 |
| Enter | 觸發按鈕/連結 | 2.1.1 |
| Escape | 關閉對話框/下拉選單 | 2.1.1 |
| Arrow Keys | 在光譜條上微調分數 | 2.1.1 |
| Home/End | 跳至光譜起點/終點 | 2.1.1 |

### 10.4 色彩對比度要求

| 元素 | 最低對比度 | WCAG 準則 | 實際對比度 (建議) |
|------|-----------|-----------|-----------------|
| 正常文字 (16px) | 4.5:1 | 1.4.3 AA | >= 7:1 |
| 大文字 (>= 18px bold) | 3:1 | 1.4.3 AA | >= 4.5:1 |
| UI 元件 (按鈕邊框等) | 3:1 | 1.4.11 AA | >= 3:1 |
| Focus indicator | 3:1 | 2.4.7 AA | 明確可辨識 |

---

## 11. LINE Bot 訊息在地化

### 11.1 摘要訊息格式

LINE Bot 訊息長度限制: 200 字 (from `shared/config.js` FRONTEND.LINE_BOT_SUMMARY_MAX_CHARS)

```javascript
// LINE Bot 新聞摘要格式
function formatLineBotSummary(article) {
  const biasLabel = getBiasLabel(article.bias_category);
  const controversyLabel = getControversyBadge(article.controversy_level);

  return [
    `[${controversyLabel}]`,
    `${article.title}`,
    `立場: ${biasLabel} (${article.bias_score})`,
    `來源: ${article.source}`,
    `${formatRelativeTime(article.published_at)}`,
    `查看詳細 >`
  ].join('\n');
}
```

### 11.2 Flex Message 文字

```javascript
const lineBotText = {
  "line.header.daily":          "今日熱門新聞",
  "line.header.alert":          "高度爭議新聞提醒",
  "line.button.detail":         "查看詳細分析",
  "line.button.compare":        "跨媒體比較",
  "line.footer.source_count":   "共 {count} 家媒體報導",
  "line.footer.powered_by":     "由公民算力驅動"
};
```

---

## 12. 瀏覽器插件在地化

```javascript
const extension = {
  "ext.badge.analyzing":        "分析中",
  "ext.badge.score":            "{score}",
  "ext.popup.title":            "立場分析結果",
  "ext.popup.bias_label":       "立場: {category}",
  "ext.popup.controversy":      "爭議: {level}",
  "ext.popup.compare":          "查看其他媒體報導",
  "ext.popup.not_supported":    "不支援此網站",
  "ext.popup.loading":          "正在分析...",
  "ext.context_menu.analyze":   "使用公民算力分析此文章"
};
```

---

## 13. Common Mistakes

### Mistake 1: 直接使用 Enum value 作為顯示文字

```javascript
// WRONG: 直接用 BIAS_CATEGORIES value 顯示
const label = BIAS_CATEGORIES.EXTREME_LEFT; // "extreme_left" ← 使用者看到英文!

// CORRECT: 透過 locale 取得 zh-TW 顯示文字
const label = t(`bias.label.${BIAS_CATEGORIES.EXTREME_LEFT}`); // "極左"
```

**教訓**: Enum value 是程式內部用的 key,不是給使用者看的。即使 `NEWS_CATEGORIES` 的 value 本身是中文,也應統一透過 locale 取得,確保一致性。

### Mistake 2: 硬編碼中文字串在元件中

```javascript
// WRONG: 硬編碼
element.textContent = "載入中...";

// CORRECT: 從 locale 取得
element.textContent = t("common.label.loading"); // "載入中..."
```

**教訓**: 硬編碼字串分散在各檔案,修改時容易遺漏,也無法統一管理。

### Mistake 3: 使用中國大陸用語

```javascript
// WRONG: 中國大陸用語
const label = "数据加载中...";   // 簡體 + 大陸用語
const label = "視頻載入中";      // 台灣不說「視頻」

// CORRECT: 台灣繁體中文
const label = "資料載入中...";   // 繁體 + 台灣用語
const label = "影片載入中";      // 台灣說「影片」
```

**教訓**: 目標使用者是台灣讀者,必須使用台灣繁體中文慣用語。參考第 6.3 節對照表。

### Mistake 4: 日期格式不一致

```javascript
// WRONG: 各處使用不同格式
const d1 = "2026/03/06";       // 斜線格式
const d2 = "Mar 6, 2026";     // 英文格式
const d3 = "06-03-2026";      // DD-MM-YYYY

// CORRECT: 統一使用 Intl.DateTimeFormat
const d = dateFormatter.format(new Date()); // "2026年3月6日"
```

**教訓**: 日期格式必須統一,使用 `Intl.DateTimeFormat` 搭配 `zh-TW` locale 和 `Asia/Taipei` 時區。

### Mistake 5: 數字未加千分位分隔

```javascript
// WRONG: 原始數字
element.textContent = `參與人數: 12345`;

// CORRECT: 加入千分位
element.textContent = `參與人數: ${formatNumber(12345)}`; // "12,345"
```

**教訓**: 大數字缺少千分位分隔符號會降低可讀性。

### Mistake 6: 錯誤訊息洩漏內部資訊

```javascript
// WRONG: 暴露內部細節
showError(`KV read failed: key=article:${hash}, status=500`);

// CORRECT: 使用通用訊息
showError(t("error.message.not_found")); // "找不到請求的資源"
console.error(`KV read failed: key=article:${hash}, status=500`); // 只記錄到 console
```

**教訓**: OceanRAG 教訓 #2 - 絕對不能將內部錯誤細節暴露給使用者。

### Mistake 7: ARIA label 使用英文

```html
<!-- WRONG: 英文 ARIA label -->
<button aria-label="analyze this article">分析</button>

<!-- CORRECT: 中文 ARIA label,與 UI 語言一致 -->
<button aria-label="開始分析此文章的立場">分析</button>
```

**教訓**: 螢幕閱讀器會朗讀 `aria-label`,如果是英文會讓使用中文介面的視障使用者困惑。

### Mistake 8: 忘記 font-display: swap

```css
/* WRONG: 未設定 font-display,CJK 字型載入慢時頁面一片空白 */
@font-face {
  font-family: 'Noto Sans TC';
  src: url('/fonts/NotoSansTC-Regular.woff2') format('woff2');
}

/* CORRECT: 先用系統字型顯示,載入完成後切換 */
@font-face {
  font-family: 'Noto Sans TC';
  font-display: swap;
  src: url('/fonts/NotoSansTC-Regular.woff2') format('woff2');
}
```

**教訓**: CJK 字型檔案較大 (通常 > 1 MB),未設 `swap` 會導致長時間白屏 (FOIT)。

### Mistake 9: 民國年轉換忘記處理跨年

```javascript
// WRONG: 簡單減法,未考慮月份
function toROCYear(year) { return year - 1911; }

// CORRECT: 使用完整 Date 物件
function toROCYear(date) {
  const d = new Date(date);
  return d.getFullYear() - 1911;
}
```

**教訓**: 確保使用完整的 `Date` 物件進行轉換,避免時區和跨年問題。

---

## 14. locale/zh-TW.js 完整範例結構

```javascript
/**
 * zh-TW Locale - 繁體中文 (台灣)
 *
 * SSOT for all UI strings in the application.
 * Import this file instead of hardcoding Chinese strings.
 *
 * Usage:
 *   import { t } from '../locale/zh-TW.js';
 *   element.textContent = t('bias.label.center'); // "中立"
 *   element.textContent = t('common.label.source_count', { count: 3 }); // "來源: 3 家媒體"
 */

const messages = {
  // === Bias Labels ===
  "bias.label.extreme_left":   "極左",
  "bias.label.left":           "偏左",
  "bias.label.center_left":    "中間偏左",
  "bias.label.center":         "中立",
  "bias.label.center_right":   "中間偏右",
  "bias.label.right":          "偏右",
  "bias.label.extreme_right":  "極右",

  // === Controversy Labels ===
  "controversy.label.low":       "低",
  "controversy.label.moderate":  "中等",
  "controversy.label.high":      "高",
  "controversy.label.very_high": "極高",

  // === Controversy Badges ===
  "controversy.badge.low":       "低度爭議",
  "controversy.badge.moderate":  "中等爭議",
  "controversy.badge.high":      "高度爭議",
  "controversy.badge.very_high": "極高爭議",

  // === News Categories ===
  "category.label.politics":      "政治",
  "category.label.economy":       "經濟",
  "category.label.society":       "社會",
  "category.label.technology":    "科技",
  "category.label.international": "國際",
  "category.label.entertainment": "娛樂",
  "category.label.sports":        "體育",
  "category.label.health":        "健康",
  "category.label.education":     "教育",
  "category.label.environment":   "環境",

  // === Error Messages ===
  "error.message.validation":     "輸入資料格式錯誤,請檢查後重試",
  "error.message.not_found":      "找不到請求的資源",
  "error.message.rate_limit":     "請求過於頻繁,請稍後再試",
  "error.message.unauthorized":   "未授權,請先登入",
  "error.message.generic":        "系統錯誤,請稍後再試",

  // === Quality Gate Feedback ===
  "quality.failed_format":       "分析結果格式異常，請重新分析",
  "quality.failed_range":        "分析結果包含無效數值，請重新分析",
  "quality.failed_consistency":  "您的分析與過往紀錄差異較大，請重新審視後再提交",
  "quality.failed_duplicate":    "此文章已完成分析，或已達分析次數上限",

  // === Cooldown ===
  "reward.cooldown.active":      "分析功能暫時停用",
  "reward.cooldown.remaining":   "剩餘等待時間: {minutes} 分鐘",
  "reward.cooldown.reason":      "連續 3 次未通過品質驗證，已暫停分析功能 1 小時",

  // === Article Deadline ===
  "article.deadline.remaining":   "可分析剩餘時間: {hours} 小時",
  "article.deadline.expired":     "已截止分析",
  "article.deadline.warning":     "即將截止 (剩餘 {hours} 小時)",

  // === Login & Auth ===
  "login.prompt":                "請先登入以參與分析",
  "login.google_oauth":          "使用 Google 帳號登入",
  "login.anonymous_browse":      "先瀏覽看看",
  "login.success":               "登入成功",
  "login.failed":                "登入失敗，請稍後再試",
  "login.logout":                "登出",
  "login.logout_confirm":        "確定要登出嗎？",

  // === Onboarding ===
  "onboarding.step1.title":      "歡迎使用新聞立場分析",
  "onboarding.step1.desc":       "透過公民算力，分析台灣新聞媒體的報導立場",
  "onboarding.step2.title":      "認識立場光譜",
  "onboarding.step2.desc":       "光譜左側代表泛綠立場，右側代表泛藍立場，中間為中立",
  "onboarding.step3.title":      "AI 本地分析",
  "onboarding.step3.desc":       "下載 AI 模型後，分析完全在您的裝置上進行，資料不會外洩",
  "onboarding.step4.title":      "開始使用",
  "onboarding.step4.desc":       "瀏覽今日新聞，或立即開始您的第一次分析",
  "onboarding.button.next":      "下一步",
  "onboarding.button.skip":      "略過",
  "onboarding.button.start":     "開始使用",

  // === Privacy Consent ===
  "privacy.consent.title":       "隱私政策同意",
  "privacy.consent.checkbox":    "我已閱讀並同意隱私政策",
  "privacy.consent.link":        "查看完整隱私政策",
  "privacy.consent.required":    "需要同意隱私政策才能繼續",
  "privacy.consent.button":      "同意並繼續",

  // === Offline/Sync (PWA) ===
  "pwa.sync.saved_offline":        "已保存，連線後自動提交",
  "pwa.sync.failed_permanent":     "同步失敗次數過多，此筆資料需手動重新提交",
  "pwa.sync.retry_button":         "重新提交",
  "pwa.sync.discard_button":       "捨棄",

  // === Inference UX ===
  "model.inference.preparing":     "正在組裝提示詞...",
  "model.inference.running":       "AI 分析中...",
  "model.inference.generating":    "產生結果...",
  "model.inference.slow_hint":     "分析較複雜的文章需要較長時間",
  "model.inference.timeout_offer": "分析時間較長，是否切換至伺服器模式？",
  "model.inference.switch_server": "切換至伺服器模式",

  // ... (其他 key 參見各章節定義)
};

/**
 * Translation function with interpolation support
 * @param {string} key - i18n key (e.g. "bias.label.center")
 * @param {Object} params - interpolation params (e.g. { count: 3 })
 * @returns {string} translated string
 */
export function t(key, params = {}) {
  let msg = messages[key];
  if (!msg) {
    console.warn(`Missing i18n key: ${key}`);
    return key; // Fallback: return the key itself
  }
  // Interpolation: replace {param} with value
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return msg;
}

export default messages;
```

---

## 15. 品質檢查清單

前端在地化 PR 提交前必須確認:

- [ ] 所有使用者可見文字都透過 `t()` 函式取得,無硬編碼
- [ ] 所有 Enum 顯示標籤都有對應的 i18n key
- [ ] 所有 `aria-label` 使用繁體中文
- [ ] 日期格式使用 `Intl.DateTimeFormat` + `Asia/Taipei`
- [ ] 數字使用千分位分隔 (`Intl.NumberFormat('zh-TW')`)
- [ ] 錯誤訊息不洩漏內部細節
- [ ] 使用台灣慣用語,非中國大陸用語
- [ ] 字型載入使用 `font-display: swap`
- [ ] 所有互動元件都有鍵盤可及性
- [ ] 色彩對比度符合 WCAG 2.1 AA (>= 4.5:1)
- [ ] LINE Bot 摘要不超過 200 字
- [ ] 民國年轉換邏輯正確 (西元年 - 1911)
- [ ] 品質門 4 種失敗碼都有對應的使用者友善訊息
- [ ] 冷卻期有倒數計時和原因提示
- [ ] 72 小時分析截止有明確標記

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 |
| v1.0 | 2026-03-06 | 完整在地化規格: i18n 策略, 字串對照表 (bias/controversy/category/source/error/nav/model/reward/pwa), 台灣術語規範, 日期時間格式化 (含民國年), 數字格式化, 字型規範, 無障礙文字 (a11y), LINE Bot 與瀏覽器插件在地化, Common Mistakes 9 則 | 階段 4 前端開發啟動,建立完整 SSOT |
| v1.1 | 2026-03-07 | Model 4B, quality gate keys, cooldown/deadline/login/onboarding/privacy/sync i18n keys, inference UX strings | Decision #004 + M01 UX review + cross-team comm 1833 |

---

**重要提醒**:
修改此文件前,必須:
1. 確認 `shared/enums.js` 中的 Enum 定義是否有變更
2. 確認 `shared/config.js` LOCALIZATION 區塊是否一致
3. 通知 T03 (Prompt 中文用語一致性) 和 T06 (錯誤訊息合規)
4. 更新 MASTER_ROADMAP.md 決策紀錄

---

**文件維護者**: T04 (Frontend Experience Team)
**最後更新**: 2026-03-07
**下次審查**: 階段 4 結束時
