# 事件回應手冊 (Incident Response Runbook)

## 導航
- **上游文件**: CLAUDE.md, MONITORING_DASHBOARD.md, CI_CD_PIPELINE.md, shared/config.js
- **下游文件**: PERFORMANCE_BENCHMARKS.md
- **維護者**: T07 (Deployment & Monitoring Team)
- **類型**: 操作手冊 (Operational Runbook)
- **最後更新**: 2026-03-07

---

## 1. 事件嚴重度分級 (Severity Matrix)

### P0 — 緊急 (Critical)

| 項目 | 說明 |
|------|------|
| **回應時限** | 5 分鐘內 |
| **通知對象** | 全團隊 (M01 + T01-T07) |
| **升級路徑** | T07 → M01 → 專案負責人 (5 分鐘內無法解決即升級) |
| **通知方式** | 即時 webhook + email |
| **觸發告警** | `system_unavailable` — `/api/v1/health` 回傳非 200 |

**典型場景**:
- Cloudflare Workers 全面不可用,所有 API 請求失敗
- DNS 設定異常導致域名無法解析
- Cloudflare 平台性故障 (需確認 [Cloudflare Status](https://www.cloudflarestatus.com/))

---

### P1 — 高嚴重度 (High)

| 項目 | 說明 |
|------|------|
| **回應時限** | 15 分鐘內 |
| **通知對象** | T07 + T01 (系統架構) |
| **升級路徑** | T07 → T01 → M01 (15 分鐘無法解決即升級) |
| **通知方式** | 即時 webhook |

**觸發告警**:

| 告警名稱 | 條件 | config.js 常數 |
|----------|------|----------------|
| `kv_latency_high` | KV 平均延遲 > 100ms 持續 5 分鐘 | `MONITORING.ALERT_KV_LATENCY_MS` |
| `cdn_hit_rate_low` | CDN 命中率 < 60% 持續 1 小時 | `MONITORING.ALERT_CDN_HIT_RATE_THRESHOLD` |
| `crawler_failure_high` | 爬蟲失敗率 > 10% (單次執行) | `MONITORING.ALERT_CRAWLER_FAILURE_THRESHOLD` |
| `d1_reads_near_limit` | D1 讀取 > 4M/5M (80%) | `CLOUDFLARE.D1_DAILY_READ_LIMIT` * 0.80 |
| `workers_ai_near_limit` | Workers AI > 8K/10K neurons (80%) | `CLOUDFLARE.WORKERS_AI_DAILY_LIMIT` * 0.80 |

**典型場景**:
- 部署新版本後 KV 延遲飆高 (可能是查詢邏輯變更)
- 爬蟲大量逾時 (目標網站結構變更或反爬蟲措施)
- D1 讀取激增 (缺少 KV 快取層, 或快取 TTL 配置異常)

---

### P2 — 中嚴重度 (Medium)

| 項目 | 說明 |
|------|------|
| **回應時限** | 1 小時內 |
| **通知對象** | T07 |
| **升級路徑** | T07 → T01 (1 小時無法解決) → M01 |
| **通知方式** | 每小時摘要 |

**觸發告警**:

| 告警名稱 | 條件 | config.js 常數 |
|----------|------|----------------|
| `analysis_pass_rate_low` | 分析通過率 < 60% 持續 24 小時 | `MONITORING.ALERT_ANALYSIS_FAILURE_THRESHOLD` |
| `kv_writes_near_limit` | KV 寫入 > 800/1000 (80%) | `CLOUDFLARE.KV_DAILY_WRITE_LIMIT` * 0.80 |
| `vectorize_near_limit` | Vectorize 查詢維度 > 24M/30M (80%) | `CLOUDFLARE.VECTORIZE_MONTHLY_QUERY_DIM_LIMIT` * 0.80 |

**典型場景**:
- Prompt 調整導致品質下降,分析通過率低於閾值
- KV 寫入預算被某團隊超額消耗 (檢查 `KV_WRITE_BUDGET` 分配)
- 知識庫查詢量異常成長 (檢查是否有重複嵌入呼叫)

---

### P3 — 低嚴重度 (Low)

| 項目 | 說明 |
|------|------|
| **回應時限** | 下一個工作日 |
| **通知對象** | T07 |
| **升級路徑** | 於每日摘要報告中向 M01 說明 |
| **通知方式** | 每日摘要 |

**觸發告警**:

| 告警名稱 | 條件 | config.js 常數 |
|----------|------|----------------|
| `r2_storage_near_limit` | R2 儲存 > 8GB/10GB (80%) | `CLOUDFLARE.R2_MAX_STORAGE_GB` * 0.80 |
| `workers_requests_high` | Workers 請求 > 80K/100K (80%) | `CLOUDFLARE.WORKERS_DAILY_REQUEST_LIMIT` * 0.80 |

**典型場景**:
- R2 文章全文累積接近 10GB 上限 (規劃清理舊文章或升級方案)
- 某日流量異常增長 (檢查是否有爬蟲誤觸或 DDoS)

---

## 2. 回滾手冊 (Rollback Runbook)

### 2.1 Workers 回滾

**方法 A: Wrangler 內建回滾 (推薦)**

```bash
# 查看最近部署紀錄
wrangler deployments list

# 回滾到上一個版本
wrangler rollback

# 回滾到指定版本
wrangler rollback --version-id <deployment-id>
```

**方法 B: Git Revert + 重新部署**

```bash
# 還原最近一次提交
git revert HEAD --no-edit
git push origin main
# CI/CD 自動觸發重新部署 (deploy.yml)
```

**驗證步驟**:

```bash
# 等待 10 秒讓部署生效
sleep 10

# 檢查 health endpoint
curl -f https://api.powerreader.dev/health

# 檢查深度健康 (需 Service Token)
curl -H "Authorization: Bearer $SERVICE_TOKEN" \
     https://api.powerreader.dev/api/v1/health/ready
```

---

### 2.2 Pages 回滾

**方法 A: Wrangler CLI**

```bash
# 列出所有部署
wrangler pages deployment list --project-name=powerreader

# 回滾到指定部署
wrangler pages deployment rollback --project-name=powerreader \
  --deployment-id=<previous-deployment-id>
```

**方法 B: Cloudflare Dashboard**

1. 登入 Cloudflare Dashboard → Pages → powerreader
2. 選擇「Deployments」分頁
3. 找到上一次成功部署,點擊「Rollback to this deploy」

**方法 C: 重新部署前一個提交**

```bash
git log --oneline -5          # 找到上一個穩定提交
git checkout <stable-commit>
npm ci && npm run build
wrangler pages deploy dist --project-name=powerreader
git checkout main             # 回到 main 分支
```

---

### 2.3 D1 資料庫回滾

D1 無自動回滾機制,需手動操作。

**回滾 Schema 變更**:

```bash
# 連線到 D1 資料庫
wrangler d1 execute powerreader-db --command "SELECT sql FROM sqlite_master WHERE type='table';"

# 執行反向遷移 SQL (需事先準備)
wrangler d1 execute powerreader-db --file=migrations/rollback_<version>.sql
```

**資料修復**:

```bash
# 匯出目前資料作為備份
wrangler d1 export powerreader-db --output=backup_$(date +%Y%m%d_%H%M%S).sql

# 執行修復 SQL
wrangler d1 execute powerreader-db --command "<修復用 SQL>"
```

> **注意**: D1 遷移必須在開發階段準備好對應的 rollback SQL,每次 migration 都要附帶逆向腳本。

---

### 2.4 KV 設定回滾

```bash
# 列出目前的 KV 鍵值 (config 相關)
wrangler kv key list --namespace-id=<KV_NAMESPACE_ID> --prefix="config:"

# 讀取目前的設定值
wrangler kv key get --namespace-id=<KV_NAMESPACE_ID> "config:<key_name>"

# 寫入舊的設定值
wrangler kv key put --namespace-id=<KV_NAMESPACE_ID> "config:<key_name>" "<old_value>"
```

> **注意**: KV 寫入計入每日 1000 次額度 (`CLOUDFLARE.KV_DAILY_WRITE_LIMIT`)。回滾時注意不要消耗過多寫入配額。

---

### 2.5 緊急停止開關 (Kill Switch)

當系統出現嚴重且無法快速修復的問題時,可停用 API 路由。

**步驟 1: 設定維護模式旗標**

```bash
wrangler kv key put --namespace-id=<KV_NAMESPACE_ID> \
  "config:maintenance_mode" "true"
```

**步驟 2: Workers 檢查維護旗標 (程式碼邏輯)**

```javascript
// src/workers/middleware/maintenance.js
const maintenanceMode = await env.NEWS_KV.get('config:maintenance_mode');
if (maintenanceMode === 'true') {
  return new Response(
    JSON.stringify({ success: false, error: '系統維護中,請稍後再試' }),
    { status: 503, headers: { 'Retry-After': '300' } }
  );
}
```

**步驟 3: 恢復服務**

```bash
wrangler kv key put --namespace-id=<KV_NAMESPACE_ID> \
  "config:maintenance_mode" "false"
```

---

## 3. 診斷程序 (Diagnostic Procedures)

每個告警的診斷流程依序: 首先檢查 → 其次檢查 → 常見原因 → 修復 → 升級條件。

### 3.1 P0 告警

**system_unavailable**: 首先檢查 [Cloudflare Status](https://www.cloudflarestatus.com/);其次 `curl -v https://api.powerreader.dev/health` 確認回應。常見原因: 部署失敗、wrangler.toml 錯誤、平台故障。修復: 部署問題 → Workers 回滾 (2.1節); 平台故障 → Kill Switch + 等待。升級: 5 分鐘無法恢復 → M01 + 專案負責人。

### 3.2 P1 告警

**kv_latency_high**: 檢查 `/api/v1/metrics` 的 `kv_read_latency_ms.p95/p99`;確認是否剛部署新版。常見原因: KV 鍵名變更致快取失效、單次請求多次讀取、區域性延遲。修復: 確認 TTL (`CLOUDFLARE.KV_METADATA_TTL`=30s)、檢查迴圈讀取、部署導致則回滾。升級: 持續 >15 分鐘 → T01。

**cdn_hit_rate_low**: 檢查 Cloudflare Dashboard Caching Analytics;確認 Cache-Control header 和 TTL 設定。常見原因: header 錯誤、TTL 過短、路由變更。修復: 確認靜態 TTL=864000 (`CDN_STATIC_TTL`)、文章 TTL=3600 (`CDN_ARTICLE_TTL`);必要時清除快取重建。升級: 持續 2h 且 <50% → T01。

**crawler_failure_high**: 檢查 GitHub Actions crawler-cron 的 crawl report;確認目標網站結構或反爬蟲。常見原因: 結構變更、IP 封鎖、逾時、rate limit 過低。修復: 確認 `CRAWLER.RATE_LIMIT_DELAY_MS` >=2000ms、`MAX_RETRIES`=3;結構變更 → T02 更新解析器。升級: 連續 2 次 >20% → T02 + T06。

**d1_reads_near_limit**: 檢查 `d1_reads_today` 使用百分比;確認是否缺少 KV 快取。常見原因: 熱門查詢無快取、metrics 即時聚合、批次大量讀取。修復: 高頻查詢加 KV 快取 (TTL 5min);metrics 走 Cron 聚合;極端情況用 Kill Switch。升級: >90% (4.5M) → T01。

**workers_ai_near_limit**: 檢查 `workers_ai_neurons_today` (每日預估 960 neurons = 600篇 * 1.6);遠超則異常。常見原因: 重複嵌入 (去重失敗)、冪等性未檢查、前端大量查詢。修復: 確認 content_hash 去重;限制查詢頻率 (`API_RATE_LIMIT_PER_MINUTE`=60);極端暫停嵌入。升級: >90% (9K) → T01 + T03。

### 3.3 P2 告警

**analysis_pass_rate_low**: 檢查失敗類型分佈 (format/range/consistency/duplicate);確認 Prompt 版本或模型是否變更。常見原因: Prompt 調整致格式不符、來源結構變更、驗證規則過嚴。修復: 確認 `ANALYSIS.TARGET_PASS_RATE_MIN`=0.60;與 T03 核對 Prompt;抽樣檢查。升級: 持續 48h → T03。

**kv_writes_near_limit**: 檢查各團隊 KV 寫入 vs 預算 (`KV_WRITE_BUDGET`: T02=400, T03=300, T05=150, T07=50, T01=100)。常見原因: 團隊超額、快取頻繁重寫、監控誤寫 KV (應寫 D1)。修復: 確認 metrics 存 D1;通知超額團隊。升級: >950/1000 → T01。

**vectorize_near_limit**: 檢查月度累計查詢維度 vs 30M;每次查詢維度 = 1024 (`VECTORIZE_DIMENSIONS`) * 5 (`VECTORIZE_TOP_K`)。常見原因: 前端未節流、查詢頻率過高、topK 過大。修復: 前端加節流;評估降低 topK;加查詢快取。升級: >90% → T01。

### 3.4 P3 告警

**r2_storage_near_limit**: 檢查 R2 用量 (文章 + 模型 ~3.4GB);確認清理策略。常見原因: 舊文章未清理、舊模型版本未刪、重複文章。修復: 執行清理 Cron;刪除舊模型;確認去重。升級: >9GB → 規劃升級。

**workers_requests_high**: 檢查 Workers Analytics 請求來源;確認是否有異常 IP。常見原因: 自然成長、外部爬蟲、DDoS、前端輪詢過頻。修復: 確認 Rate Limiting (`API_RATE_LIMIT_PER_MINUTE`=60);檢查 Dashboard 更新頻率 (3600s);異常來源加黑名單。升級: >95K → T01 + T06。

---

## 4. 事後檢討範本 (Post-Incident Review Template)

每次 P0/P1 事件解決後,必須在 48 小時內完成事後檢討文件。P2 事件建議完成,P3 事件選擇性完成。

---

```markdown
# 事後檢討報告

## 基本資訊

| 項目 | 內容 |
|------|------|
| 事件編號 | INC-YYYYMMDD-NNN |
| 事件標題 | (簡述事件) |
| 嚴重度 | P0 / P1 / P2 / P3 |
| 觸發告警 | (alert rule name) |
| 發生時間 | YYYY-MM-DD HH:MM (UTC+8) |
| 偵測時間 | YYYY-MM-DD HH:MM (UTC+8) |
| 恢復時間 | YYYY-MM-DD HH:MM (UTC+8) |
| 影響時長 | X 分鐘 / 小時 |
| 值班人員 | T07 + (其他參與團隊) |

## 影響範圍

- **受影響服務**: (例: API 端點、前端頁面、爬蟲排程)
- **受影響使用者**: (估計人數或比例)
- **資料影響**: (是否有資料遺失或損壞)

## 事件時間線

| 時間 (UTC+8) | 事件 | 動作 |
|--------------|------|------|
| HH:MM | 告警觸發 | 自動通知 T07 |
| HH:MM | 值班人員確認 | 開始診斷 |
| HH:MM | 根因確認 | (描述) |
| HH:MM | 修復動作 | (描述) |
| HH:MM | 服務恢復 | 確認 health endpoint 正常 |
| HH:MM | 告警解除 | 系統自動標記 resolved |

## 根因分析

### 直接原因
(描述觸發事件的直接技術原因)

### 根本原因
(描述導致問題存在的根本原因,例如缺少測試、設計缺陷等)

## 修復措施

### 即時修復 (已完成)
- [ ] (描述已執行的修復動作)

### 長期改善 (待追蹤)
- [ ] (描述預防此類事件再次發生的長期措施)
- [ ] 預計完成日期: YYYY-MM-DD
- [ ] 負責團隊: Txx

## 經驗教訓

### 做得好的地方
- (描述事件處理中有效的部分)

### 需要改善的地方
- (描述可以做得更好的部分)

### 需要新增到 CLAUDE.md Common Mistakes 的項目
- (若適用,描述應回寫到文件的踩雷經驗)

## 審閱紀錄

| 審閱者 | 日期 | 狀態 |
|--------|------|------|
| T07 | YYYY-MM-DD | 撰寫完成 |
| M01 | YYYY-MM-DD | 審閱通過 |
```

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v1.0 | 2026-03-07 | 初版: 嚴重度分級、回滾手冊、診斷程序、事後檢討範本 | 建立標準化事件回應流程 |

---

**文件維護者**: T07 (Deployment & Monitoring Team)
**最後更新**: 2026-03-07
**狀態**: v1.0 完成
