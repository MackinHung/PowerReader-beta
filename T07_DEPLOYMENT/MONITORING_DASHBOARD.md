# 📊 Monitoring Dashboard (監控儀表板)

## 📍 導航
- **上游文件**: CLAUDE.md, shared/config.js (`MONITORING`), T01/CLOUDFLARE_ARCHITECTURE.md
- **下游文件**: T07/PERFORMANCE_BENCHMARKS.md, T07/CI_CD_PIPELINE.md
- **維護者**: T07 (Deployment & Monitoring Team)
- **類型**: 參考文檔
- **最後更新**: 2026-03-07

---

## 🎯 文件目的
定義 **監控儀表板的指標、告警規則、視覺化佈局**，涵蓋系統健康、
爬蟲成功率、AI 推理品質、KV 延遲、CDN 快取命中率、D1/Vectorize/Workers AI 資源用量。

---

## 📐 監控指標總覽

### 核心 KPI (from `config.js MONITORING`)

| 指標 | 目標值 | 告警閾值 | 來源 |
|------|--------|---------|------|
| KV 讀取延遲 | ≤ 30ms | > 100ms | `TARGET_KV_LATENCY_MS` |
| CDN 快取命中率 | ≥ 80% | < 60% | `TARGET_CDN_CACHE_HIT_RATE` |
| 模型推理時間 | ≤ 10s | > 30s | `TARGET_MODEL_INFERENCE_SEC` (Qwen3.5-4B, ~6-10s) |
| 爬蟲失敗率 | < 10% | > 10% | `ALERT_CRAWLER_FAILURE_THRESHOLD` |
| 分析通過率 | 60-70% | < 60% | `ALERT_ANALYSIS_FAILURE_THRESHOLD` |

### 次要指標

| 指標 | 說明 | 免費額度 | 更新頻率 |
|------|------|---------|---------|
| Workers 請求數 | 每日 API 請求總量 | 100K/天 | 即時 |
| D1 讀取次數 | 每日 D1 查詢量 | 5M 讀/天 | 即時 |
| Vectorize 查詢維度 | 每月向量查詢維度總量 | 30M/月 | 即時 |
| Workers AI Neurons | 每日 AI 推理用量 | 10K/天 | 即時 |
| KV 寫入使用量 | 已使用 / 1000 (config/cache only) | 1000 寫/天 | 即時 |
| R2 儲存量 | 文章全文 + 模型檔案 | 10GB | 每小時 |
| 活躍使用者 | 當日進行分析的使用者數 | - | 每小時 |

---

## 📡 指標收集架構

```
┌──────────────────────────────────────────────────┐
│                Cloudflare Workers                 │
│  每次請求記錄:                                      │
│  - kv_read_latency_ms                            │
│  - d1_query_latency_ms                           │
│  - vectorize_query_latency_ms                    │
│  - cdn_cache_hit (true/false)                    │
│  - response_time_ms                              │
│  - error_type (if any)                           │
└──────────┬───────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│            D1: metrics table (主要儲存)            │
│  聚合指標寫入 D1 (避免消耗 KV 寫入額度)              │
│  date, metric_name, value                        │
│  保留 30 天 (Cron 清理)                            │
│                                                  │
│  KV: 僅用於 config/cache (非 metrics)              │
└──────────┬───────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│     GET /api/v1/metrics (Service Token)          │
│     → D1 聚合查詢 → JSON 回應                      │
│     → 更新頻率: 1 小時 (DASHBOARD_REFRESH_INTERVAL)  │
└──────────────────────────────────────────────────┘
```

### Metrics API

`GET /api/v1/metrics` (需 Service Token)

```javascript
{
  "success": true,
  "data": {
    "period": "2026-03-07",
    "kv_read_latency_ms": { "avg": 18, "p95": 42, "p99": 85 },
    "cdn_cache_hit_rate": 0.83,
    "crawler_success_rate": 0.94,
    "analysis_pass_rate": 0.65,
    "workers_requests_today": 32450,
    "kv_writes_today": 487,
    "kv_writes_limit": 1000,
    "d1_reads_today": 124500,
    "d1_reads_limit": 5000000,
    "vectorize_queries_today": 8200,
    "vectorize_queries_limit": 1000000,     // 30M dimensions/month ≈ 1M queries/day
    "workers_ai_neurons_today": 3500,
    "workers_ai_neurons_limit": 10000,
    "r2_storage_gb": 4.1,
    "active_users_today": 45,
    "model_inference_avg_sec": 7.8          // Qwen3.5-4B typical range: 6-10s
  }
}
```

---

## 🖥️ 儀表板佈局

### 頂部: 系統狀態列

```
┌───────────────────────────────────────────────────────────┐
│  🟢 系統正常  |  更新: 2026/03/06 14:30  |  重新整理 ⟳    │
└───────────────────────────────────────────────────────────┘
```

狀態判定:
- 🟢 正常: 所有 KPI 在目標範圍內
- 🟡 警告: 任一 KPI 接近閾值 (80% of threshold)
- 🔴 異常: 任一 KPI 超過閾值

### 第一行: 5 個核心 KPI 卡片

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ KV 延遲  │ CDN 命中 │ 推理時間 │ 爬蟲成功 │ 分析通過 │
│  18ms   │  83%    │  7.8s   │  94%    │  65%    │
│ 目標≤30  │ 目標≥80 │ 目標≤10 │ 目標≥90 │ 目標≥60 │
│   🟢    │   🟢   │   🟢   │   🟢   │   🟢   │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

### 第二行: 趨勢圖 (2 欄)

```
┌────────────────────────┬────────────────────────┐
│  KV 延遲趨勢 (24h)      │  CDN 命中率趨勢 (24h)   │
│  折線圖                  │  折線圖                 │
│  X: 時間 (每小時)         │  X: 時間 (每小時)       │
│  Y: ms                  │  Y: %                  │
│  紅線: 30ms 目標          │  紅線: 80% 目標         │
└────────────────────────┴────────────────────────┘
```

### 第三行: 資源使用量

```
┌──────────────────────────┬──────────────────────────┐
│  D1 讀取 (5M/天)           │  Vectorize 查詢 (30M/月)  │
│  █░░░░░░░░░ 124K/5M       │  █░░░░░░░░░░ 8.2K/1M     │
│  進度條 + 百分比             │  進度條 + 百分比           │
├──────────────────────────┼──────────────────────────┤
│  Workers AI (10K/天)       │  KV 寫入 (config/cache)   │
│  ████░░░░░░ 3.5K/10K      │  ████████░░ 487/1000     │
│  進度條 + 百分比             │  ⚠️ > 80% 時變黃          │
├──────────────────────────┼──────────────────────────┤
│  R2 儲存 (10GB)            │                          │
│  █████░░░░░ 4.1/10 GB     │                          │
│  進度條 + 百分比             │                          │
└──────────────────────────┴──────────────────────────┘
```

### 第四行: 爬蟲與分析

```
┌────────────────────────┬────────────────────────┐
│  今日爬蟲報告              │  分析品質分佈            │
│  成功: 47 / 50           │  passed: 65%           │
│  失敗: 3 (6%)            │  failed_format: 5%     │
│  來源分佈: 柱狀圖          │  failed_range: 10%     │
│  每日累計: ~600 篇        │  failed_consistency: 12%│
│                         │  failed_duplicate: 8%   │
└────────────────────────┴────────────────────────┘
```

> **注意**: 投票系統延後至 Phase 2+ (Decision: voting deferred),v1.0 僅有點數系統,此行不顯示投票統計。

---

## 🔔 告警規則

### 告警等級

| 等級 | 條件 | 通知方式 | 回應時限 |
|------|------|---------|---------|
| P0 Critical | Health endpoint 失敗 | 即時 (webhook + email) | 5 分鐘 |
| P1 High | 核心 KPI 超過閾值 | 即時 (webhook) | 15 分鐘 |
| P2 Medium | 次要指標異常 | 每小時摘要 | 1 小時 |
| P3 Low | 資源使用量接近上限 | 每日摘要 | 24 小時 |

### 具體告警條件

| 告警 | 條件 | 等級 |
|------|------|------|
| 系統不可用 | `/api/v1/health` 回傳非 200 | P0 |
| KV 延遲異常 | avg > 100ms 持續 5 分鐘 | P1 |
| CDN 命中率低 | < 60% 持續 1 小時 | P1 |
| 爬蟲失敗率高 | > 10% 本次執行 | P1 |
| D1 讀取接近上限 | > 4M/5M (80%) | P1 |
| Workers AI 接近上限 | > 8K/10K (80%) | P1 |
| 分析通過率低 | < 60% 持續 24 小時 | P2 |
| KV 寫入接近上限 | > 800/1000 (80%) | P2 |
| Vectorize 查詢接近上限 | > 24M/30M 維度 (80%, 月度) | P2 |
| R2 儲存接近上限 | > 8GB/10GB (80%) | P3 |
| Workers 請求量高 | > 80K/100K (80%) | P3 |

### 告警抑制

- 同一告警在 1 小時內不重複發送
- P0 告警恢復後自動發送「已恢復」通知
- 維護窗口期間 (手動設定) 暫停所有告警

---

## 🏥 Health Check 端點

### `GET /api/v1/health` (基本檢查)

```javascript
// 不需認證，監控系統定期呼叫
{
  "status": "ok",
  "timestamp": "2026-03-06T14:30:00+08:00",
  "version": "1.0.0"
}
```

### `GET /api/v1/health/ready` (深度檢查)

```javascript
{
  "status": "ok",
  "checks": {
    "d1_database": { "status": "ok", "latency_ms": 8 },
    "r2_storage": { "status": "ok", "latency_ms": 22 },
    "vectorize_index": { "status": "ok", "latency_ms": 15 },
    "kv_config": { "status": "ok", "latency_ms": 12 },
    "workers_ai": { "status": "ok", "latency_ms": 45 }
  },
  "timestamp": "2026-03-07T14:30:00+08:00"
}
```

---

## ⚠️ Common Mistakes

### Mistake 1: 在 Worker 內做複雜聚合計算
```javascript
// ❌ 每次請求都遍歷所有 metrics — 超過 CPU 限制 (10ms Free)
for (const key of allMetricKeys) {
  const val = await KV.get(key);
  // 聚合計算...
}

// ✅ 預先聚合，metrics API 只讀取聚合結果
// 使用 KV 原子計數器或 Cron 定時聚合
```

### Mistake 2: 監控指標寫入消耗 KV 額度
```javascript
// ❌ 每次請求寫入一筆 metric 到 KV — 消耗免費寫入額度!
await KV.put(`metric:${Date.now()}`, data);

// ✅ 使用 D1 儲存聚合指標 (5M 讀/天, 寫入不另計)
// KV 僅用於 config/cache,不儲存 metrics
await env.DB.prepare(
  'INSERT INTO metrics (date, name, value) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET value = value + ?'
).bind(date, metricName, value, value).run();

// 或使用 Cloudflare Analytics Engine (不佔任何額度)
```

### Mistake 3: Health endpoint 需要認證
```
❌ /health 需要 JWT — 監控系統無法存取
✅ /health 不需認證 (基本檢查)
   /health/ready 建議 Service Token (深度檢查)
   /metrics 需要 Service Token (敏感指標)
```

### Mistake 4: 告警風暴
```
❌ KV 延遲波動 → 每秒發送告警 → 信箱被灌爆
✅ 告警抑制: 同一告警 1 小時內不重複
   持續性判斷: P1 需持續 5 分鐘才觸發
```

### Mistake 5: D1 讀取額度耗盡
```
❌ 每次 API 請求都做多次 D1 查詢 — 5M reads/天很快用完
✅ 常讀資料用 KV cache (TTL 5min)
   批量查詢合併為單次 JOIN
   Dashboard metrics 用 Cron 定時聚合,不即時計算
```

---

## 📜 變更紀錄

| 版本 | 日期 | 變更內容 | 影響團隊 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | - |
| v1.0 | 2026-03-06 | 完整監控儀表板規範 | T01, T07 |
| v1.1 | 2026-03-07 | 推理目標 ≤10s (Qwen 4B), +D1/Vectorize/Workers AI 指標, 移除投票, D1 metrics 儲存, health check 含 D1/R2/Vectorize/Workers AI | Decisions #004, #007, #008 |

---

**文件維護者**: T07 (Deployment & Monitoring Team)
**最後更新**: 2026-03-07
**狀態**: ✅ v1.1 完成
