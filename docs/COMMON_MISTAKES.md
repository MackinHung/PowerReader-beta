# OceanRAG 十大致命錯誤 (所有團隊必讀)

> 從 OceanRAG 專案學到的教訓，PowerReader 所有團隊必須閱讀並避免重蹈覆轍。
> **上游文件**: CLAUDE.md | **維護者**: M01

---

## 1. 模型不一致災難

```javascript
// ❌ 災難案例
// Crawler 使用: bge-small-zh-v1.5 (512d)
// PowerReader 使用: bge-m3 (1024d)  // 不同維度!
// 混用這兩個模型的向量做 cosine similarity → 結果無意義

// ✅ 正確做法
// 在 shared/config.js 統一定義
export const MODELS = {
  QWEN: "qwen3.5:4b",
  EMBEDDING: "@cf/baai/bge-m3",
  FILTER: "bge-small-zh-v1.5"
};
// 篩選和嵌入分別使用各自的模型,不可混用!
```

**教訓**: 模型不一致會導致向量空間不相容,但系統不會報錯,極難察覺!

---

## 2. 洩漏內部錯誤給客戶端

```javascript
// ❌ 錯誤: LINE Bot 暴露 traceback
yield `data: ${JSON.dumps({error: err.stack})}\n\n`;

// ✅ 正確: 通用訊息 + 伺服器日誌
yield `data: ${JSON.dumps({error: '系統錯誤,請稍後再試'})}\n\n`;
console.error(`Full error: ${err.stack}`);
```

**教訓**: 不洩漏內部資訊給用戶 (安全性 + 用戶體驗)

---

## 3. Rate Limit 只存記憶體

```javascript
// ❌ 錯誤: in-memory dict (重啟歸零)
const rateLimitCounter = {};

// ✅ 正確: 持久化到 KV
await env.KV.put(`ratelimit:${source}:${date}`, count, {
  expirationTtl: 86400  // 24 小時過期
});
```

**教訓**: 爬蟲 Rate Limit 必須持久化,否則攻擊者只需等待重啟即可重設

---

## 4. Enum 欄位無 DB 約束

```javascript
// ❌ 錯誤: 只在應用層驗證
if (!['自由時報', '聯合報'].includes(source)) throw Error();

// ✅ 正確: 單一真理來源 + 所有層級驗證
// shared/enums.js
export const NEWS_SOURCES = {
  LIBERTY_TIMES: "自由時報",
  UNITED_DAILY: "聯合報",
  CHINA_TIMES: "中國時報"
};

// KV Schema 也要驗證
if (!Object.values(NEWS_SOURCES).includes(article.source)) {
  throw new Error("Invalid news source");
}
```

**教訓**: Enum 必須集中管理,所有層級都驗證

---

## 5. 忘記轉義使用者輸入 (XSS)

```javascript
// ❌ 錯誤: 直接插入使用者內容
element.innerHTML = userComment;

// ✅ 正確: 統一轉義函式
import { escapeHtml } from './utils/sanitize.js';
element.innerHTML = escapeHtml(userComment);
```

**教訓**: 所有使用者輸入都必須轉義 (LINE Bot 訊息、評論、文章標題等)

---

## 6. 測試檔案與生產碼混放

```
❌ 錯誤結構:
src/
  ├─ crawler.js
  └─ test_crawler.js  // 混放!

✅ 正確結構:
src/crawler.js
tests/test_crawler.js  // 分離!
```

**教訓**: 測試檔案必須分離,避免安全風險

---

## 7. httpx/fetch Timeout 未分層設定

```javascript
// ❌ 錯誤: 單一 timeout (connect 超時過長)
fetch(url, { timeout: 60000 });

// ✅ 正確: 分層設定
fetch(url, {
  signal: AbortSignal.timeout(5000)  // connect timeout
  // read timeout 由 Workers 自動處理
});
```

---

## 8. 動態欄位無白名單 (SQL Injection 風險)

```javascript
// ❌ 極度危險: 直接使用使用者輸入
const sortBy = request.query.sort_by;
const query = `SELECT * FROM articles ORDER BY ${sortBy}`;

// ✅ 正確: 白名單驗證
const ALLOWED_SORT_FIELDS = ['published_at', 'bias_score', 'controversy'];
if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
  throw new Error("Invalid sort field");
}
```

---

## 9. Session 只驗證 JWT (IDOR 漏洞)

```javascript
// ❌ 錯誤: 只驗證 JWT
const userId = jwt.decode(token).sub;

// ✅ 正確: 交叉驗證 Session
const session = await getSession(sessionId);
if (session.user_id !== jwt.decode(token).sub) {
  throw new Error("Session mismatch");
}
```

---

## 10. 未過濾垃圾 Chunk

```javascript
// ❌ 錯誤: 所有段落都索引
const chunks = text.split('\n\n');

// ✅ 正確: MIN_CHUNK_CHARS 過濾
const MIN_CHUNK_CHARS = 5;
const chunks = text.split('\n\n').filter(c => c.trim().length >= MIN_CHUNK_CHARS);
```

**教訓**: 過濾垃圾內容 (單一標點符號、空白行等)
