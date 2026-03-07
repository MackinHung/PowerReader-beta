# 🚨 Error Handling (錯誤處理規範)

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js (`SECURITY`, `FRONTEND`), shared/enums.js (`ERROR_TYPES`, `getUserErrorMessage()`)
- **下游文件**: T01/API_ROUTES.md, T04/PWA_SPEC.md, T04/LINE_BOT_DESIGN.md
- **維護者**: T06 (Compliance & Security Team)
- **類型**: SINGLE SOURCE OF TRUTH (SSOT)
- **最後更新**: 2026-03-07

---

## 🎯 文件目的
定義 **全系統統一的錯誤處理規範**，涵蓋錯誤分類、回應格式、
使用者面向訊息、日誌策略、各團隊責任。

**核心原則**: 永遠不洩漏內部資訊給使用者 (OceanRAG 教訓 #2)。

**修改此文件時必須通知**: T01, T02, T03, T04, T05, T07

---

## 📐 錯誤分類

依 `shared/enums.js ERROR_TYPES` 定義:

### 客戶端錯誤 (安全訊息可顯示)

| 錯誤類型 | HTTP | 使用者訊息 |
|---------|------|-----------|
| `validation_error` | 400 | 輸入資料格式錯誤，請檢查後重試 |
| `not_found` | 404 | 找不到請求的資源 |
| `rate_limit_exceeded` | 429 | 請求過於頻繁，請稍後再試 |
| `unauthorized` | 401/403 | 未授權，請先登入 |

### 品質門錯誤 (安全訊息可顯示，v1.1 新增)

| 錯誤類型 | HTTP | 使用者訊息 | 安全審查 |
|---------|------|-----------|---------|
| `failed_format` | 422 | 分析結果格式異常，請重新分析 | ✅ 不暴露 JSON schema 細節 |
| `failed_range` | 422 | 分析結果包含無效數值，請重新分析 | ✅ 不暴露有效分數範圍 |
| `failed_consistency` | 422 | 您的分析與過往紀錄差異較大，請重新審視後再提交 | ✅ 不暴露比較閾值/演算法 |
| `failed_duplicate` | 409 | 此文章已完成分析，或已達分析次數上限 | ✅ 不暴露次數限制數字 |

**來源**: T03 QUALITY_GATES.md 品質驗證失敗碼
**i18n key**: `quality.failed_format`, `quality.failed_range`, `quality.failed_consistency`, `quality.failed_duplicate` (T04 UI_LOCALIZATION.md)
**跨團隊請求**: 品質門回饋錯誤類型 (M01→T03/T04/T06, 2026-03-06, 已完成歸檔)

### 伺服器錯誤 (僅記錄日誌，顯示通用訊息)

| 錯誤類型 | HTTP | 使用者看到 |
|---------|------|-----------|
| `internal_error` | 500 | 系統錯誤，請稍後再試 |
| `database_error` | 500 | 系統錯誤，請稍後再試 |
| `api_error` | 502 | 系統錯誤，請稍後再試 |
| `model_error` | 503 | 系統錯誤，請稍後再試 |

通用訊息來源: `FRONTEND.ERROR_MESSAGE_GENERIC` (config.js)

### Cloudflare 基礎設施錯誤 (v1.3 新增)

以下為 Cloudflare 環境特有的錯誤場景,所有錯誤對使用者均顯示通用訊息「系統錯誤，請稍後再試」。

#### Workers 執行限制

| 錯誤場景 | 觸發條件 | 內部日誌 | 恢復策略 |
|---------|---------|---------|---------|
| CPU 時間超限 | 單次請求超過 10ms CPU (免費) / 50ms (付費) | `workers_cpu_exceeded` | 拆分運算、優化邏輯,不可自動重試 |
| Subrequest 超限 | 單次請求超過 50 個 subrequest (fetch/KV/D1 等) | `workers_subrequest_exceeded` | 批量合併請求,減少 subrequest 數量 |
| 記憶體超限 | Worker 超過 128MB 記憶體 | `workers_memory_exceeded` | 減少單次處理資料量,分批處理 |

#### Workers AI 錯誤 (bge-m3 嵌入)

| 錯誤場景 | 觸發條件 | 內部日誌 | 恢復策略 |
|---------|---------|---------|---------|
| Neuron 配額耗盡 | 每日免費 10K neurons 用完 | `workers_ai_quota_exceeded` | 記錄告警,等待隔日重置;不可降級至其他模型 (向量空間不相容) |
| 嵌入推理失敗 | Workers AI 服務暫時不可用 | `workers_ai_inference_failed` | 指數退避重試 (最多 2 次),失敗則暫存文章待後續嵌入 |
| 輸入超長 | 嵌入文本超過模型 token 上限 | `workers_ai_input_too_long` | 截斷文本至允許長度後重試 |

#### Vectorize 錯誤 (知識庫向量搜索)

| 錯誤場景 | 觸發條件 | 內部日誌 | 恢復策略 |
|---------|---------|---------|---------|
| 維度不匹配 | 查詢向量維度 ≠ 索引維度 (預期 1024d) | `vectorize_dimension_mismatch` | **CRITICAL** — 表示嵌入模型不一致,立即告警,禁止降級 |
| 索引不存在 | 引用不存在的 Vectorize 索引名稱 | `vectorize_index_not_found` | 記錄錯誤,通知 T07 檢查部署是否遺漏索引建立 |
| 查詢配額超限 | 超過月度 30M 查詢維度免費額度 | `vectorize_quota_exceeded` | 記錄告警,降級為不注入知識的基礎分析模式 |

#### R2 儲存錯誤

| 錯誤場景 | 觸發條件 | 內部日誌 | 恢復策略 |
|---------|---------|---------|---------|
| 寫入失敗 | R2 bucket 不可用或權限錯誤 | `r2_write_failed` | 重試 2 次 (500ms 間隔),失敗則暫存至 KV 並記錄待補寫 |
| 讀取失敗 | 文章 key 不存在或 R2 暫時不可用 | `r2_read_failed` | 重試 1 次,失敗則回傳「文章暫時無法載入」|
| 儲存空間超限 | 超過免費 10GB 額度 | `r2_storage_exceeded` | 記錄告警,通知 T07 執行清理或升級方案 |

---

## 📨 統一 API 回應格式

### 成功

```javascript
{ "success": true, "data": { ... }, "error": null }
```

### 失敗

```javascript
{
  "success": false,
  "data": null,
  "error": {
    "type": "validation_error",                    // ERROR_TYPES enum
    "message": "輸入資料格式錯誤，請檢查後重試",     // getUserErrorMessage()
    "request_id": "req_abc123def456"               // 唯一追蹤 ID
  }
}
```

### 429 Rate Limit 特殊回應

```javascript
{
  "success": false,
  "data": null,
  "error": {
    "type": "rate_limit_exceeded",
    "message": "請求過於頻繁，請稍後再試",
    "request_id": "req_abc123",
    "retry_after": 60  // 秒
  }
}
```

---

## 📝 日誌規範

### 記錄層級

| 層級 | 用途 | 範例 |
|------|------|------|
| `ERROR` | 需立即關注 | KV 寫入失敗、未預期異常 |
| `WARN` | 需注意但不緊急 | Rate limit 觸發、品質驗證失敗 |
| `INFO` | 正常流程記錄 | API 請求、投票紀錄 |
| `DEBUG` | 開發除錯 (正式環境關閉) | 完整請求/回應 |

### 日誌格式

```javascript
{
  "timestamp": "2026-03-06T14:30:00+08:00",
  "level": "ERROR",
  "request_id": "req_abc123",
  "error_type": "database_error",
  "message": "KV write failed: namespace ARTICLES",
  "stack": "Error: ...",  // 僅記錄於日誌，不回傳使用者!
  "context": {
    "endpoint": "POST /api/v1/articles",
    "user_hash": "sha256...",
    "kv_namespace": "ARTICLES"
  }
}
```

### 禁止記錄的資訊

| 項目 | 原因 |
|------|------|
| 使用者 Email / Google UID | 隱私保護 |
| JWT Token / API Key | 安全風險 |
| 使用者 IP | 除非法規要求 |
| 完整文章內容 | 著作權考量 |

---

## 📱 前端錯誤處理

### PWA 模式

```javascript
async function fetchArticles(params) {
  try {
    const response = await fetch(`/api/v1/articles?${new URLSearchParams(params)}`);
    const data = await response.json();
    if (!data.success) {
      showUserError(data.error.message);  // ✅ 安全訊息
      return null;
    }
    return data.data;
  } catch (networkError) {
    showUserError("網路連線異常，請檢查後重試");
    console.error("[fetchArticles]", networkError);  // 僅 console
    return null;
  }
}
```

### LINE Bot 模式

```javascript
function createErrorFlexMessage(errorType) {
  return {
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
  };
}
```

### 用戶端模型推理

```javascript
const MODEL_ERROR_MESSAGES = {
  "model_not_loaded":   "模型尚未載入，請先下載模型",
  "inference_timeout":  "分析超時，請稍後重試",
  "memory_exceeded":    "裝置記憶體不足，請關閉其他應用程式後重試",
  "wasm_not_supported": "您的瀏覽器不支援 WebAssembly，建議使用 Chrome 或 Firefox"
};
```

---

## 🔄 錯誤恢復策略

### 自動重試

| 錯誤類型 | 重試? | 次數 | 間隔 |
|---------|-------|------|------|
| 網路超時 | ✅ | 3 次 | 指數退避 1s, 2s, 4s |
| KV 讀取失敗 | ✅ | 2 次 | 500ms |
| KV 寫入失敗 | ✅ | 2 次 | 1s |
| 429 Rate Limit | ✅ | 1 次 | `retry_after` 秒後 |
| 400 驗證錯誤 | ❌ | - | 需使用者修正 |
| 401 認證錯誤 | ❌ | - | 需重新登入 |
| 500 伺服器錯誤 | ❌ | - | 記錄後回報 |

### 降級策略 (Graceful Degradation)

| 場景 | 降級方式 |
|------|---------|
| CDN 過期 + Workers 不可用 | 顯示 stale cache + 「資料可能不是最新」 |
| KV 讀取失敗 | PWA 使用 IndexedDB 本地快取 |
| 模型載入失敗 | 提示使用者稍後重試，不阻斷瀏覽功能 |
| LINE Bot webhook 失敗 | 回傳純文字訊息 (非 Flex) |
| 投票系統不可用 | 暫停投票，新聞分析照常 |
| Workers AI 配額耗盡 | 暫停知識庫嵌入,文章仍可瀏覽但不注入 RAG 知識 |
| Vectorize 查詢失敗 | 降級為不注入知識的基礎分析模式 |
| R2 讀取失敗 | 顯示文章摘要 (D1 索引資料) + 「全文暫時無法載入」 |

---

## 📊 各團隊責任

| 團隊 | 錯誤處理責任 |
|------|------------|
| T01 | 統一回應格式、request_id 生成 |
| T02 | 爬蟲重試、失敗率監控、Rate limit 持久化 |
| T03 | 推理超時處理、驗證失敗分類 |
| T04 | 使用者友善提示、離線降級 |
| T05 | 冷卻機制錯誤、並發寫入衝突 |
| T06 | 確保所有錯誤訊息不洩漏資訊 (本文件) |
| T07 | 錯誤率告警、日誌聚合 |

---

## ⚠️ Common Mistakes

### Mistake 1: 洩漏 Stack Trace
```javascript
// ❌ 完整錯誤回傳使用者
return Response.json({ error: { message: error.stack } });

// ✅ 安全訊息 + 日誌記錄
console.error(error.stack);
return Response.json({
  success: false,
  error: {
    type: ERROR_TYPES.INTERNAL_ERROR,
    message: getUserErrorMessage(ERROR_TYPES.INTERNAL_ERROR),
    request_id: requestId
  }
}, { status: 500 });
```

### Mistake 2: 忽略 async 錯誤
```javascript
// ❌ Promise rejection 被靜默忽略
someAsyncOperation();

// ✅ 一律 try-catch
try {
  await someAsyncOperation();
} catch (err) {
  console.error("[operationName]", err);
}
```

### Mistake 3: 錯誤 HTTP 狀態碼
```javascript
// ❌ 所有錯誤都回 200
return Response.json({ error: "not found" }, { status: 200 });

// ✅ 正確狀態碼
return Response.json({
  success: false,
  error: { type: "not_found", message: "找不到請求的資源" }
}, { status: 404 });
```

### Mistake 4: 日誌記錄敏感資訊
```javascript
// ❌ 記錄使用者 email
console.error(`User ${user.email} failed auth`);

// ✅ 只記錄匿名 hash
console.error(`User ${user.user_hash} failed auth`);
```

### Mistake 5: 未設定 request_id
```javascript
// ❌ 無法追蹤特定錯誤
return { error: "something went wrong" };

// ✅ 每個請求生成唯一 ID
const requestId = `req_${crypto.randomUUID().slice(0,12)}`;
```

### Mistake 6: 前端直接顯示 API 原始錯誤
```javascript
// ❌ 假設 API 永遠回傳正確訊息
alert(apiResponse.error.message);

// ✅ 透過 getUserErrorMessage() 對照
const safeMsg = getUserErrorMessage(apiResponse.error.type);
showNotification(safeMsg);
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 影響團隊 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | - |
| v1.0 | 2026-03-06 | 完整錯誤處理規範 | 所有團隊 |
| v1.1 | 2026-03-07 | 新增品質門專屬錯誤類型 (failed_format/range/consistency/duplicate) | T03, T04 |
| v1.3 | 2026-03-07 | 對齊 v1.3 架構: Workers 執行限制、Workers AI 嵌入錯誤、Vectorize 向量搜索錯誤、R2 儲存錯誤、降級策略擴充 | 所有團隊 |

---

**文件維護者**: T06 (Compliance & Security Team)
**最後更新**: 2026-03-07
**狀態**: v1.3 完成
