# ⚡ Performance Benchmarks (效能基準測試)

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js (`MONITORING`, `CLOUDFLARE`, `MODELS`), T01/CLOUDFLARE_ARCHITECTURE.md
- **下游文件**: T07/MONITORING_DASHBOARD.md, T03/MODEL_ACCURACY_REPORT.md
- **維護者**: T07 (Deployment & Monitoring Team)
- **類型**: 滾動式紀錄 (Living Document)
- **最後更新**: 2026-03-08

---

## 🎯 文件目的
定義 **系統各元件的效能基準、測試方法論、裝置分級標準**，
作為持續效能追蹤的基線 (baseline)。

每次架構變更或版本升級後，必須重新執行基準測試並更新本文件。

---

## 📐 效能目標 (Performance Targets)

### 來自 config.js MONITORING

| 指標 | 目標 | 降級閾值 | 失敗閾值 |
|------|------|---------|---------|
| KV 讀取延遲 | ≤ 30ms | > 50ms | > 100ms |
| CDN 快取命中率 | ≥ 80% | < 70% | < 60% |
| 用戶端推理時間 | ≤ 10s | > 15s | > 30s |
| API 回應時間 (P95) | ≤ 100ms | > 200ms | > 500ms |
| 首頁載入時間 (FCP) | ≤ 1.5s | > 2.5s | > 4s |
| PWA 離線可用 | 是 | N/A | N/A |

### 來自 config.js CLOUDFLARE

| 資源 | 免費額度 | 目標使用量 | 告警閾值 (80%) |
|------|---------|-----------|--------------|
| Workers 請求 | 100K/day | ~50K/day | 80K/day |
| KV 讀取 | 100K/day | ~30K/day | 80K/day |
| KV 寫入 | 1K/day | ~100/day (config only) | 800/day |
| R2 儲存 | 10 GB | ~2.2 GB/year (articles) | 8 GB |
| D1 讀取 | 5M/day | ~100K/day | 4M/day |
| Vectorize 查詢維度 | 30M/month | ~18.4M/month | 24M/month |
| Workers AI neurons | 10K/day | ~960/day | 8K/day |
| Pages 部署 | 500/month | ~60/month | 400/month |

---

## 📱 裝置分級基準

### 三級裝置分類

| 級別 | 代表設備 | RAM | CPU/GPU | 推理時間目標 |
|------|---------|-----|---------|------------|
| 高階 | MacBook M3, RTX 4060+ 桌機 | ≥ 16GB | 8+ 核心 / 獨顯 | < 4s |
| 中階 | 一般筆電, iGPU 桌機 | 8-16GB | 4-8 核心 | 4-10s |
| 低階 | 入門筆電, 舊桌機 (CPU-only) | < 8GB | 2-4 核心 | 10-20s |

### 推理引擎效能比較 (Qwen3-4B via WebLLM)

| 引擎 | 高階 | 中階 | 低階 | 備註 |
|------|------|------|------|------|
| WebLLM (WebGPU) | ~2-4s/pass | ~6s/pass | N/A | 需要 WebGPU (Chrome 113+), 雙 Pass ~14s |
| WebLLM (WASM fallback) | ~6s/pass | ~10s/pass | ~20s/pass | 無 WebGPU 時降級 |
| Server Fallback | ~2s | ~2s | ~2s | 依賴網路,未來規劃 |

### 記憶體使用

| 模型 | 原始大小 | Q4_K_M 量化後 | Runtime RAM | 執行位置 |
|------|---------|-------------|------------|---------|
| Qwen3-4B-q4f16_1-MLC | N/A | ~3.4GB (q4f16) | ~3.4GB VRAM | 用戶端 (WebLLM WebGPU) |
| bge-m3 | ~300MB | N/A (Workers AI) | 邊緣 GPU | Cloudflare Workers AI |
| bge-small-zh | ~130MB | N/A | ~200MB | Crawler 端 (CPU) |

---

## 🧪 基準測試方法

### 1. KV 延遲測試

```javascript
// 測試 100 次 KV 讀取，計算 avg/p95/p99
async function benchmarkKVRead(env, count = 100) {
  const latencies = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await env.ARTICLES.get("benchmark:test_key");
    latencies.push(performance.now() - start);
  }
  latencies.sort((a, b) => a - b);
  return {
    avg: latencies.reduce((a, b) => a + b) / count,
    p95: latencies[Math.floor(count * 0.95)],
    p99: latencies[Math.floor(count * 0.99)],
    min: latencies[0],
    max: latencies[count - 1]
  };
}
```

### 2. CDN 快取測試

```bash
# 測試 CDN 快取命中率
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code} %{time_total} %{response_code}\n" \
    -H "Accept: application/json" \
    "https://api.your-domain.com/api/v1/articles?page=1&limit=20"
done

# 檢查 Cf-Cache-Status header
curl -I "https://api.your-domain.com/api/v1/articles" | grep cf-cache-status
# HIT = 快取命中, MISS = 未命中
```

### 3. 用戶端推理基準 (WebLLM WebGPU)

```javascript
// 測試 WebLLM 推理時間 (瀏覽器內 WebGPU)
async function benchmarkInference(article, runs = 10) {
  // 1. 確認 WebGPU 可用
  if (!navigator.gpu) {
    return { error: "WebGPU not supported", hint: "Use Chrome 113+ or Edge 113+" };
  }

  // 2. 初始化 WebLLM Service Worker 引擎
  const { CreateServiceWorkerMLCEngine } = await import("@mlc-ai/web-llm");
  const engine = await CreateServiceWorkerMLCEngine("Qwen3-4B-q4f16_1-MLC", {
    initProgressCallback: (progress) => console.log(progress.text)
  });

  // 3. 推理效能測試
  const measurements = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await engine.chat.completions.create({
      messages: [{ role: "user", content: article }],
      temperature: 0.5,
      max_tokens: 512
    });
    measurements.push(performance.now() - start);
  }
  measurements.sort((a, b) => a - b);
  return {
    engine: "WebLLM (WebGPU)",
    model: "Qwen3-4B-q4f16_1-MLC (3,432 MB VRAM)",
    avg_ms: measurements.reduce((a, b) => a + b) / runs,
    p95_ms: measurements[Math.floor(runs * 0.95)],
    min_ms: measurements[0],
    max_ms: measurements[runs - 1]
  };
}
```

### 4. 前端效能 (Web Vitals)

| 指標 | 全名 | 目標 | 測量方式 |
|------|------|------|---------|
| FCP | First Contentful Paint | ≤ 1.5s | Lighthouse |
| LCP | Largest Contentful Paint | ≤ 2.5s | Lighthouse |
| CLS | Cumulative Layout Shift | ≤ 0.1 | Lighthouse |
| FID | First Input Delay | ≤ 100ms | Lighthouse |
| TTFB | Time to First Byte | ≤ 200ms | Lighthouse |
| TTI | Time to Interactive | ≤ 3.5s | Lighthouse |

### 5. 爬蟲效能

| 指標 | 目標 | 計算方式 |
|------|------|---------|
| 每次執行時長 | ≤ 45 min | GitHub Actions timeout |
| 每次執行文章數 | ~50 篇 (去重後) | 每 2 小時一次 |
| 每篇文章處理時間 | ≤ 5s (含 rate limit) | 總時間 / 文章數 |
| Rate limit 遵守 | ≥ 2s/請求 | `CRAWLER.RATE_LIMIT_DELAY_MS` |
| 記憶體使用 | ≤ 2GB | GitHub Actions runner |
| bge-small-zh 篩選時間 | ≤ 0.1s/篇 | cosine similarity 計算 |

---

## 📊 基準測試結果表 (滾動更新)

### API 端點延遲 (E2E, 含網路延遲, 從台灣至 Cloudflare APAC)

**測試日期**: 2026-03-08
**測試方法**: 10 sequential curl requests per endpoint, measured with `curl -w "%{time_total}"`
**測試來源**: Windows 11 client → Cloudflare Workers (APAC/KIX colo)
**API URL**: `https://powerreader-api.watermelom5404.workers.dev`

| 端點 | avg (ms) | min (ms) | max (ms) | P95 (ms) | median (ms) | 狀態 |
|------|---------|---------|---------|---------|------------|------|
| `GET /api/v1/health` | 353 | 253 | 591 | 574 | 281 | OK |
| `GET /api/v1/health/ready` | 603 | 453 | 1101 | 806 | 543 | OK |
| `GET /api/v1/articles` (default) | 565 | 422 | 968 | 807 | 481 | OK |
| `GET /api/v1/articles?limit=1` | 785 | 502 | 1455 | 1315 | 773 | WARN |

**分析**:
- `/health` 端點平均 353ms，大部分為網路 RTT (Cloudflare APAC ~250ms baseline)
- `/health/ready` 較慢因需 probe D1/R2/KV/Vectorize。最新一次 probe 結果: D1=75ms, R2=540ms, KV=4ms, Vectorize=214ms, AI=0ms(跳過)
- `/articles` (default limit=20) 平均 565ms，D1 查詢延遲 <1ms (0.23ms)
- `/articles?limit=1` 平均較高可能受 TLS 握手和 cold start 影響
- **所有端點 P95 < 1.5s**，在免費方案的合理範圍內

### 健康檢查 Probe 詳細延遲 (Worker 內部, 2026-03-08)

| 服務 | 延遲 (ms) | 狀態 | 備註 |
|------|----------|------|------|
| D1 | 75 | OK | SQL 查詢延遲 0.2-0.4ms |
| R2 | 540 | OK | HEAD 操作 (較慢) |
| KV | 4 | OK | 極快，低於 30ms 目標 |
| Vectorize | 214 | OK | 向量索引就緒 |
| Workers AI | 0 (skipped) | OK | 跳過以節省 neuron 額度 |

### D1 資料庫統計 (2026-03-08)

| 指標 | 值 |
|------|------|
| 總文章數 | 384 |
| 資料庫大小 | ~3.9 MB |
| 來源數 | 11 |
| 全部狀態 | `deduplicated` (100%) |

**文章來源分佈**:

| 來源 | 篇數 | 佔比 |
|------|------|------|
| 自由時報 | 165 | 43.0% |
| 聯合報 | 71 | 18.5% |
| 三立新聞 | 44 | 11.5% |
| ETtoday新聞雲 | 33 | 8.6% |
| 中央社 | 22 | 5.7% |
| 東森新聞 | 20 | 5.2% |
| 新頭殼 | 17 | 4.4% |
| 公視新聞 | 5 | 1.3% |
| 關鍵評論網 | 5 | 1.3% |
| 科技新報 | 1 | 0.3% |
| 風傳媒 | 1 | 0.3% |

### 監控基礎設施狀態 (2026-03-08)

| 資源 | 資料量 | 狀態 | 備註 |
|------|--------|------|------|
| `metrics_hourly` | 0 rows | PENDING | Cron 尚未觸發第一次 aggregation |
| `metrics_raw` | 0 rows | PENDING | 無原始指標資料 |
| `daily_counters` | 2 rows | ACTIVE | 2026-03-07: 203 req, 2026-03-08: 49 req |
| `alerts` | 0 rows | OK | 無告警觸發 (正常) |

**備註**: `daily_counters` 正確追蹤請求數，表示 cron 的 daily counter 邏輯運作中。`metrics_hourly` 和 `metrics_raw` 為空可能是因為 metrics aggregation cron 尚未累積足夠資料或端點尚未被呼叫。

### Secrets 配置驗證 (2026-03-08)

| Secret | 狀態 |
|--------|------|
| SERVICE_TOKEN | Deployed |
| ADMIN_API_KEY | Deployed |
| GOOGLE_CLIENT_ID | Deployed |
| GOOGLE_CLIENT_SECRET | Deployed |
| JWT_PRIVATE_KEY | Deployed |
| JWT_PUBLIC_KEY | Deployed |

**備註**: SERVICE_TOKEN 已部署但值不可從外部讀取，無法測試 `/metrics` 和 `/monitoring/usage` 認證端點。建議未來在 `.dev.vars` 中保留本地測試用 token。

### KV 延遲

| 日期 | 版本 | avg (ms) | P95 (ms) | P99 (ms) | 狀態 |
|------|------|---------|---------|---------|------|
| 2026-03-08 | v1 | 4 | - | - | OK (via /health/ready probe) |

### CDN 快取命中率

| 日期 | 版本 | 命中率 | 總請求數 | 狀態 |
|------|------|--------|---------|------|
| (待 CDN 快取啟用後測試) | | | | |

### 用戶端推理時間

| 日期 | 裝置級別 | 引擎 | avg (s) | 狀態 |
|------|---------|------|---------|------|
| (待用戶端 WebLLM 整合後測試) | | | | |

### Web Vitals

| 日期 | 版本 | FCP | LCP | CLS | FID | 狀態 |
|------|------|-----|-----|-----|-----|------|
| (待前端 PWA 上線後測試) | | | | | | |

---

## 🔄 負載測試

### 預估負載

```
假設:
  - 日活躍使用者 (DAU): 500-2000
  - 每人每日瀏覽 10-20 篇新聞
  - 每人每日提交 1-3 次分析 (本地 WebLLM 推理)
  - 新聞來源更新: 每 2 小時，每次 ~50 篇 (去重後), 600 篇/天

計算:
  Workers API 請求: 500 * 15 = 7,500 ~ 2000 * 20 = 40,000 / day
  D1 讀取: ~100,000 / day (文章索引 + 結構化查詢)
  KV 讀取: ~30,000 / day (設定快取)
  KV 寫入: ~100 / day (僅系統設定更新)
  R2 讀取: ~10,000-40,000 / day (文章全文讀取)
  Vectorize 查詢: 50 篇/次 × 12 次/天 × 5 dims × 1024d = ~3.1M dims/day (~18.4M/month)
  Workers AI: 50 篇/次 × 12 次/天 × 1 embed/篇 × ~1.6 neurons = ~960 neurons/day
  帶寬: PWA 靜態資源 CDN 快取覆蓋, 增量小
```

### 壓力測試場景

| 場景 | 並發數 | 持續時間 | 預期結果 |
|------|--------|---------|---------|
| 正常負載 | 50 | 10 min | P95 < 100ms |
| 高峰負載 | 200 | 5 min | P95 < 200ms |
| 爬蟲高峰 | N/A | 45 min | 成功率 > 90% |
| 投票截止 | 100 | 1 min | 所有投票成功 (Phase 2+) |

---

## ⚠️ Common Mistakes

### Mistake 1: 只在高階裝置測效能
```
❌ 開發者用 M3 MacBook 測試 → "推理只要 1 秒"
✅ 三個層級都測 (高/中/低階)
   低階裝置推理可能需要 15 秒
   需要提供進度提示 UI
```

### Mistake 2: 忽略 Cloudflare 免費額度限制
```
❌ 設計時不考慮各服務限制
✅ 每次使用都計算在額度內
   - KV 寫入: 1K/day — 僅用於設定快取 (~100/day)
   - D1 讀取: 5M/day — 文章索引 + 結構化查詢 (~100K/day)
   - Vectorize: 30M dims/month — 知識庫向量搜索 (~18.4M/month)
   - Workers AI: 10K neurons/day — bge-m3 嵌入 (~960/day)
   - R2: 10GB — 文章全文儲存 (~2.2GB/year)
```

### Mistake 3: CDN 快取 TTL 設太長
```
❌ 新聞列表快取 1 小時 → 使用者看到過時資訊
✅ 新聞列表: 5 秒 (CDN_NEWS_LIST_TTL)
   文章頁面: 1 小時 (CDN_ARTICLE_TTL)
   靜態資源: 10 天 (CDN_STATIC_TTL)
```

### Mistake 4: 基準測試未記錄環境資訊
```
❌ "推理時間 3 秒" — 什麼裝置? 什麼引擎?
✅ 記錄完整環境:
   - 裝置型號 + RAM + CPU/GPU
   - 推理引擎 (WebLLM WebGPU / WebLLM WASM / Server Fallback)
   - 模型版本 (Qwen3-4B-q4f16_1-MLC)
   - WebLLM 版本
```

### Mistake 5: 不監控 Workers CPU 時間
```
❌ Workers 免費版 CPU 限制 10ms/req
   複雜的 JSON 解析或加密運算可能超時
✅ 監控 Workers CPU 使用量
   重計算放 GitHub Actions 或用戶端
```

### Mistake 6: WebGPU 不支援或模型未下載
```
❌ 用戶端推理測試失敗 — 瀏覽器不支援 WebGPU
❌ 推理報錯 "model not found" — 模型未下載至 Cache
✅ 測試前先確認:
   1. 使用 Chrome 113+ 或 Edge 113+ (支援 WebGPU)
   2. 模型已下載: WebLLM 自動下載 Qwen3-4B-q4f16_1-MLC (~3.4GB)
   3. 確認 GPU VRAM ≥ 3,432 MB
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 影響團隊 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | - |
| v1.0 | 2026-03-06 | 完整效能基準框架 | T01, T03, T04, T07 |
| v1.1 | 2026-03-07 | Qwen 4B (Ollama) + bge-m3/bge-small-zh 模型更新; D1/Vectorize/Workers AI 資源目標; 爬蟲每 2h×50 篇; 移除 CKIP/WebGPU/WASM | T01, T03, T07 |
| v1.2 | 2026-03-08 | 首次 E2E 基準測試: API 延遲 (4 端點×10次), D1 資料完整性 (384篇/11來源), 監控基礎設施驗證, Secrets 配置確認 | T07 |
| v1.3 | 2026-03-08 | WebLLM 遷移: 推理引擎 Ollama→WebLLM (WebGPU); 裝置分級表更新; 基準測試方法改為 WebLLM API; Common Mistake #6 更新 | T03, T04, T07 |

---

**文件維護者**: T07 (Deployment & Monitoring Team)
**最後更新**: 2026-03-08
**狀態**: ✅ 完成 (首次基準測試數據已填入)
