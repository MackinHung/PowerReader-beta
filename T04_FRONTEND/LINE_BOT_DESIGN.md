# 💬 LINE Bot Design Specification

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js, shared/enums.js, T01/API_ROUTES.md
- **下游文件**: T04/PWA_SPEC.md, T06/PRIVACY_POLICY.md
- **維護者**: T04 (Frontend Experience Team)
- **類型**: 技術規格
- **最後更新**: 2026-03-07

---

## 🎯 文件目的
定義 **LINE Bot 整合架構**，包含 Messaging API、Rich Menu、Flex Message 範本。

**台灣市場**: LINE 用戶 2200 萬，LINE TODAY 覆蓋 1800 萬。

---

## 📐 架構

```
LINE Platform
  │
  ├── Webhook → POST /api/v1/line/webhook
  │              ├── Step 1: ⚠️ 驗證 X-Line-Signature (HMAC-SHA256) — 失敗即 return 403
  │              ├── Step 2: Hash LINE User ID (SHA-256) — 原始 ID 永不記錄
  │              ├── Step 3: 解析 Event (Message/Postback/Follow)
  │              ├── Step 4: 業務邏輯處理
  │              └── Step 5: Reply/Push Message
  │
  ├── Rich Menu → 快速操作選單 (6 格)
  └── LIFF → 開啟 PWA 詳細分析頁面
```

---

## 🎨 Rich Menu 設計

```
┌──────────────┬──────────────┬──────────────┐
│  📊 今日分析   │  🔍 搜尋新聞  │  👤 我的帳號   │
├──────────────┼──────────────┼──────────────┤
│  📰 媒體比較   │  🗳️ 參與投票   │  ⚙️ 設定       │
└──────────────┴──────────────┴──────────────┘
```

---

## 📨 Flex Message 範本

### 1. 每日摘要 (Daily Digest)
```javascript
{
  type: "flex",
  altText: "📊 今日新聞立場分析摘要",
  contents: {
    type: "carousel",
    contents: articles.slice(0, 10).map(article => ({
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "📊 今日立場分析", weight: "bold", size: "lg" },
          { type: "text", text: formatDate(new Date()), size: "sm", color: "#888" }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: article.title.slice(0, 200), wrap: true },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: `來源: ${article.source}`, size: "sm", color: "#888" },
              { type: "text", text: `偏向: ${article.bias_score}`, size: "sm",
                color: THEME_COLORS[article.bias_category] || "#888", align: "end" }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "horizontal",
        contents: [
          { type: "button", action: { type: "uri", label: "詳細", uri: liffUrl } },
          { type: "button", action: { type: "uri", label: "原文", uri: article.url } }
        ]
      }
    }))
  }
}
```

**限制** (from `config.js FRONTEND`):
- Flex Message: ≤ 10KB (`LINE_BOT_FLEX_MESSAGE_MAX_SIZE`)
- 摘要文字: ≤ 200 字 (`LINE_BOT_SUMMARY_MAX_CHARS`)
- Carousel: 最多 10 bubbles

### 2. 偏向比較卡片
利用 `similarity_cluster` 將同事件不同媒體報導並列顯示。

### 3. 錯誤回應
```javascript
// ✅ 使用 getUserErrorMessage()，不洩漏內部資訊
{
  type: "flex", altText: "系統通知",
  contents: {
    type: "bubble",
    body: {
      type: "box", layout: "vertical",
      contents: [
        { type: "text", text: "系統通知", weight: "bold" },
        { type: "text", text: getUserErrorMessage(errorType), wrap: true },
        { type: "text", text: "請稍後再試", size: "sm", color: "#888" }
      ]
    }
  }
}
```

---

## 🔐 Webhook Signature Validation (MANDATORY)

```javascript
// ⚠️ CRITICAL: This MUST be Step 1 — reject BEFORE any payload processing
import crypto from 'node:crypto';

function validateSignature(body, signature, channelSecret) {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// Webhook handler
export async function handleWebhook(request, env) {
  const signature = request.headers.get('X-Line-Signature');
  const body = await request.text();

  // Step 1: Validate signature — MUST be first!
  if (!signature || !validateSignature(body, signature, env.LINE_CHANNEL_SECRET)) {
    console.error('Invalid webhook signature — request rejected');
    return new Response('Forbidden', { status: 403 });
  }

  // Step 2: Parse and hash user ID immediately
  const events = JSON.parse(body).events;
  for (const event of events) {
    // Hash LINE User ID IMMEDIATELY — raw ID never stored or logged
    const userHash = await hashUserId(event.source.userId);
    // event.source.userId is NEVER used after this point
    await processEvent(event, userHash, env);
  }

  return new Response('OK', { status: 200 });
}

// SHA-256 hash — raw LINE User ID never persists
async function hashUserId(rawUserId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawUserId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

## 🔄 互動流程

### Follow Event (加好友)
```
1. Receive LINE User ID → SHA-256 hash IMMEDIATELY (raw ID discarded)
2. User hash → D1 建立匿名帳號
3. 歡迎訊息 + Rich Menu 啟用
4. 引導至 LIFF 完成 Google OAuth (選填)
⚠️ Raw LINE User ID is NEVER logged, even in error handlers
```

### 關鍵字搜尋
```
使用者: "搜尋 核電"
→ 解析 → GET /api/v1/articles?keyword=核電
→ Flex Carousel (最多 10 bubbles) → Reply
```

### Quick Reply 按鈕
```javascript
{
  type: "text", text: "請選擇篩選方式",
  quickReply: {
    items: [
      { type: "action", action: { type: "postback", label: "依媒體", data: "filter=source" } },
      { type: "action", action: { type: "postback", label: "依分類", data: "filter=category" } },
      { type: "action", action: { type: "postback", label: "今日", data: "filter=today" } }
    ]
  }
}
```

---

## 📤 Push vs Reply 策略

| 類型 | 用途 | 頻率 | 成本 |
|------|------|------|------|
| Reply | 回應使用者訊息 | 即時 | 免費 |
| Push | 每日摘要推播 | 1次/天 | 免費 (≤500/月) |
| Push | 投票結果通知 | 不定期 | 免費 |
| Push | 系統更新通知 | 極少 | 免費 |

**原則**: 預設用 Reply，只在使用者訂閱的內容更新時用 Push。

---

## 🔒 安全要求

| 項目 | 要求 |
|------|------|
| Webhook 驗證 | HMAC-SHA256 (X-Line-Signature) |
| User ID | SHA-256 hash，不儲存原始 LINE User ID |
| 訊息內容 | 不記錄使用者傳送的訊息 |
| 錯誤訊息 | `getUserErrorMessage()` (不洩漏內部細節) |
| ID Hashing | SHA-256 hash immediately upon receipt, raw ID NEVER logged or stored — even in error paths |
| Secrets | Channel Secret 存 GitHub Secrets / CF Workers Secrets |

---

## ⚠️ Common Mistakes

### Mistake 1: Flex Message 超過大小限制
```javascript
// ❌ 不限制 bubbles 數量
articles.map(a => createBubble(a)) // 可能 > 10KB!

// ✅ 最多 10 bubbles，摘要 ≤ 200 字
articles.slice(0, 10).map(a => createBubble(a));
```

### Mistake 2: 洩漏 Stack Trace
```javascript
// ❌ replyMessage(token, { text: err.stack });
// ✅ replyMessage(token, createErrorFlexMessage());
```

### Mistake 3: Push Message 濫用
```
❌ 每篇新文章都 push → 使用者封鎖
✅ 每日一次摘要 (可設定時段)
```

### Mistake 4: 未驗證 Webhook Signature
```javascript
// ❌ 直接處理 webhook body
// ✅ 先驗證 X-Line-Signature，無效則 return 403
```

### Mistake 5: Logging raw LINE User ID in error handlers
```javascript
// ❌ Dangerous: raw ID in error log
catch (err) { console.error(`Failed for user ${event.source.userId}:`, err); }

// ✅ Correct: hash first, then log hash only
const userHash = await hashUserId(event.source.userId);
catch (err) { console.error(`Failed for user ${userHash.slice(0, 8)}:`, err); }
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 影響團隊 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | - |
| v1.0 | 2026-03-06 | 完整 LINE Bot 設計 | T01, T06 |
| v1.1 | 2026-03-07 | Webhook signature validation mandatory Step 1, LINE User ID hash-first flow, error log audit | T06 security audit finding — CRITICAL |

---

**文件維護者**: T04 (Frontend Experience Team)
**最後更新**: 2026-03-07
**狀態**: ✅ 完成
