# CI/CD Pipeline

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js, shared/enums.js
- **下游文件**: MONITORING_DASHBOARD.md, PERFORMANCE_BENCHMARKS.md
- **維護者**: T07 Deployment
- **類型**: 參考文檔 (SSOT for CI/CD)
- **最後更新**: 2026-03-07

---

## 文件目的

定義 PowerReader 系統的完整 CI/CD 流程,涵蓋 GitHub Actions 自動化工作流、Cloudflare Pages/Workers 部署、分支策略、密鑰管理、預部署檢查、回滾策略,以及 R2 模型上傳管線。

---

## 1. GitHub Actions Workflows

### 1.1 Crawler Cron Workflow

依據 `shared/config.js` 中 `CRAWLER.CRON_SCHEDULE: "0 */2 * * *"`,每 2 小時自動觸發爬蟲。每次約抓取 50 篇,每日上限約 600 篇。

```yaml
# .github/workflows/crawler-cron.yml
name: News Crawler (Scheduled)

on:
  schedule:
    - cron: "0 */2 * * *"   # 每 2 小時執行 (config.js CRAWLER.CRON_SCHEDULE)
  workflow_dispatch:          # 允許手動觸發

env:
  MAX_ARTICLES_PER_RUN: 50    # config.js CRAWLER.MAX_ARTICLES_PER_RUN (~600/day)
  RATE_LIMIT_DELAY_MS: 2000   # config.js CRAWLER.RATE_LIMIT_DELAY_MS
  MAX_RETRIES: 3              # config.js CRAWLER.MAX_RETRIES
  RETRY_DELAY_MS: 5000        # config.js CRAWLER.RETRY_DELAY_MS

jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 45        # 爬蟲最長執行 45 分鐘
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Validate config consistency
        run: |
          node -e "
            const { CRAWLER } = require('./shared/config.js');
            if (CRAWLER.RATE_LIMIT_DELAY_MS < 2000) {
              throw new Error('Rate limit too aggressive! Must be >= 2000ms');
            }
            console.log('Config validation passed');
          "

      - name: Run crawler
        env:
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          KV_NAMESPACE_ID: ${{ secrets.KV_NAMESPACE_ID }}
        run: node src/crawler/run.js

      - name: Upload crawl report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: crawl-report-${{ github.run_id }}
          path: reports/crawl-*.json
          retention-days: 30

      - name: Alert on high failure rate
        if: failure()
        run: |
          echo "::error::Crawler failed! Check logs for details."
          # 通知機制 (webhook / email)
```

### 1.2 Embedding & Tokenization

> **架構變更 (Decision #007)**: CKIP BERT 已完全移除。文本嵌入改由 Cloudflare Workers AI 在邊緣節點以 `@cf/baai/bge-m3` (1024d) 執行,無需獨立的 GitHub Actions workflow。議題篩選使用 `bge-small-zh-v1.5` (512d) 在 Crawler 端 CPU 執行。
>
> 不再需要 `ckip-bert.yml` workflow、`requirements-ckip.txt` 或任何 CKIP 相關依賴。

### 1.3 Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        default: "production"
        type: choice
        options:
          - production
          - staging

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Security scan
        run: npm audit --production

  deploy-pages:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      deployments: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install and build
        run: |
          npm ci
          npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages deploy dist --project-name=powerreader

  deploy-workers:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Validate production security
        run: |
          node -e "
            const { validateProductionSecurity } = require('./shared/config.js');
            validateProductionSecurity('production', process.env.SERVICE_TOKEN || '');
          "
        env:
          SERVICE_TOKEN: ${{ secrets.SERVICE_TOKEN }}

      - name: Deploy Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: deploy --env production

      - name: Smoke test
        run: |
          sleep 10
          curl -f https://api.powerreader.dev/health || exit 1
          echo "Smoke test passed"
```

---

## 2. Cloudflare Pages Deployment

### 部署流程

```
git push main
    |
    v
GitHub Actions triggered
    |
    v
lint + test + security scan
    |
    v
npm run build (產出 dist/)
    |
    v
wrangler pages deploy dist/
    |
    v
Cloudflare Pages CDN 全球分發
    |
    v
自動 SSL + 自訂域名生效
```

### Pages 設定

| 設定項目 | 值 | 來源 |
|---------|---|------|
| Build command | `npm run build` | package.json |
| Build output | `dist/` | wrangler.toml |
| Node.js version | 20 | .nvmrc |
| PWA 名稱 | PowerReader | config.js `FRONTEND.PWA_NAME` |
| 靜態資源 Cache | 10 天 | config.js `CLOUDFLARE.CDN_STATIC_TTL` |

### Preview Deployments

每個 PR 自動產生 Preview URL:
- 格式: `https://<commit-hash>.powerreader.pages.dev`
- 用途: 功能驗證、UI Review
- 過期: PR 合併後 7 天自動清除

---

## 3. Workers Deployment via Wrangler CLI

### 本地開發

```bash
# 安裝 Wrangler CLI
npm install -g wrangler

# 登入 Cloudflare
wrangler login

# 本地開發 (模擬 KV、R2)
wrangler dev --local

# 部署到 staging
wrangler deploy --env staging

# 部署到 production (僅由 CI/CD 執行)
wrangler deploy --env production
```

### wrangler.toml 關鍵設定

```toml
name = "powerreader-api"
main = "src/workers/index.js"
compatibility_date = "2025-03-01"

# KV Namespaces (config/cache only — Decision #008)
[[kv_namespaces]]
binding = "NEWS_KV"
id = "<production-kv-id>"

[[kv_namespaces]]
binding = "NEWS_KV"
id = "<staging-kv-id>"
preview_id = "<preview-kv-id>"

# D1 Database (structured data — Decision #008)
[[d1_databases]]
binding = "DB"
database_name = "powerreader-db"
database_id = "<production-d1-id>"

# Vectorize Index (vector search — Decision #008)
[[vectorize]]
binding = "KNOWLEDGE_INDEX"
index_name = "powerreader-knowledge"

# R2 Buckets (article full text + model files)
[[r2_buckets]]
binding = "ARTICLE_BUCKET"
bucket_name = "powerreader-articles"

[[r2_buckets]]
binding = "MODEL_BUCKET"
bucket_name = "powerreader-models"

# Workers AI (bge-m3 embedding — Decision #007)
[ai]
binding = "AI"

# Environment: Staging
[env.staging]
name = "powerreader-api-staging"
route = "staging-api.powerreader.dev/*"

# Environment: Production
[env.production]
name = "powerreader-api"
route = "api.powerreader.dev/*"
```

---

## 4. Branch Strategy

```
main (production)
 |
 +-- develop (integration)
      |
      +-- feature/T01-kv-schema
      +-- feature/T02-crawler-v2
      +-- feature/T03-prompt-tuning
      +-- feature/T04-pwa-offline
      +-- feature/T05-reward-calc
      +-- feature/T06-compliance-audit
      +-- feature/T07-monitoring
      +-- fix/crawler-timeout
      +-- hotfix/xss-vulnerability
```

### 分支規則

| 分支 | 用途 | 保護規則 | 部署目標 |
|------|------|---------|---------|
| `main` | 生產環境 | PR required + 2 approvals + CI pass | Cloudflare Production |
| `develop` | 整合測試 | PR required + 1 approval + CI pass | Cloudflare Staging |
| `feature/*` | 新功能 | 無保護 | Preview (per PR) |
| `fix/*` | 修復 | 無保護 | Preview (per PR) |
| `hotfix/*` | 緊急修復 | PR to main + 1 approval | 直接 Production |

### 合併規則

- `feature/*` -> `develop`: Squash merge
- `develop` -> `main`: Merge commit (保留歷史)
- `hotfix/*` -> `main`: Merge commit + cherry-pick 回 `develop`

---

## 5. Secret Management

### GitHub Secrets 清單

| Secret 名稱 | 用途 | 使用者 | 輪替週期 |
|-------------|------|--------|---------|
| `CF_API_TOKEN` | Cloudflare API 存取 | 所有部署 workflow | 90 天 |
| `CF_ACCOUNT_ID` | Cloudflare 帳戶 ID | 所有部署 workflow | 不輪替 |
| `KV_NAMESPACE_ID` | KV 命名空間 ID | Crawler | 不輪替 |
| `D1_DATABASE_ID` | D1 資料庫 ID | Deploy workflow | 不輪替 |
| `R2_ACCESS_KEY_ID` | R2 存取金鑰 | 模型上傳 | 90 天 |
| `R2_SECRET_ACCESS_KEY` | R2 密鑰 | 模型上傳 | 90 天 |
| `SERVICE_TOKEN` | Worker 間通訊 | Deploy workflow | 30 天 |
| `LINE_CHANNEL_SECRET` | LINE Bot 密鑰 | Frontend deploy (Phase 4) | 90 天 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot Token | Frontend deploy (Phase 4) | 90 天 |

### 安全規範

> 來自 CLAUDE.md OceanRAG 教訓: 永遠不要在 production 使用預設 token!

- 所有 secret 必須透過 GitHub Secrets 管理,禁止硬編碼於原始碼
- Production deploy 前自動執行 `validateProductionSecurity()` (shared/config.js)
- Secret 輪替時使用 GitHub CLI 更新: `gh secret set CF_API_TOKEN`
- 啟動時驗證必要 secret 是否存在,缺少則立即中止
- 禁止將 `.env` 檔案提交至版本控制 (已在 `.gitignore` 排除)

### Secrets Rotation Policy

> Added per T06 security audit finding (cross-team comm 20260307_1003)

#### Rotation Schedule

| Secret | Rotation Period | Method | Owner |
|--------|----------------|--------|-------|
| `CF_API_TOKEN` | 90 天 | Cloudflare Dashboard → API Tokens → Regenerate | T07 |
| `R2_ACCESS_KEY_ID` | 90 天 | Cloudflare Dashboard → R2 → Manage API Tokens | T07 |
| `R2_SECRET_ACCESS_KEY` | 90 天 | 同上,與 ACCESS_KEY_ID 一起輪替 | T07 |
| `SERVICE_TOKEN` | 30 天 | 自動產生新 UUID v4,更新 Workers env | T07 |
| `LINE_CHANNEL_SECRET` | 90 天 | LINE Developers Console (Phase 4) | T04 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 90 天 | LINE Developers Console (Phase 4) | T04 |

#### Rotation Procedure

```bash
# 1. 在 Cloudflare Dashboard 產生新 token
# 2. 使用 GitHub CLI 更新 secret
gh secret set CF_API_TOKEN --body "<new-token>"

# 3. 觸發 staging deploy 驗證新 token 可用
gh workflow run deploy.yml -f environment=staging

# 4. 驗證 staging 部署成功後,production 會在下次 push main 時自動使用新 token
```

#### Leak Detection

- **GitHub Secret Scanning**: 啟用 GitHub Advanced Security 的 secret scanning 功能,自動偵測意外提交的 token
- **Cloudflare API Token 監控**: 定期檢查 Cloudflare Dashboard → API Tokens → Last Used,偵測異常存取模式
- **CI Log 審查**: 禁止在 workflow `run` 步驟中 echo 任何 secret 或其衍生值 (base64, hash 等)

#### Emergency Rotation Procedure

```
⚠️ 發現或懷疑 token 洩漏時:

1. 立即撤銷 (Revoke): Cloudflare Dashboard → API Tokens → 該 token → Revoke
2. 產生新 token: 建立新 API token,權限與原 token 相同
3. 更新 GitHub Secret: gh secret set CF_API_TOKEN --body "<new-token>"
4. 通知鏈: T07 → M01 → 專案負責人 (含影響範圍評估)
5. 重新部署: 手動觸發 staging + production deploy
6. 審計: 檢查 Cloudflare Analytics 是否有異常 API 呼叫
7. 記錄: 在 T06/INCIDENT_LOG.md 記錄事件
```

#### OIDC Authentication (Future Consideration)

> **評估結論**: Cloudflare 支援 GitHub Actions OIDC provider (`cloudflare/wrangler-action@v3` 支援 `apiToken` 替代方案)。OIDC 可消除長效 token 需求,改為 per-job 短效憑證。
>
> **建議**: v1.0 先使用傳統 API Token + 90 天輪替。v2.0 評估遷移至 OIDC (需 Cloudflare 付費方案支援)。

---

## 6. Pre-deploy Checks

每次部署前必須通過以下檢查:

### 6.1 Lint

```bash
# ESLint + Prettier
npm run lint

# 檢查 config.js 與 enums.js 未被意外修改
git diff --name-only origin/main -- shared/config.js shared/enums.js
```

### 6.2 Test

```bash
# 單元測試
npm test

# 整合測試 (Workers 模擬)
npm run test:integration

# 覆蓋率要求 >= 80%
npm run test:coverage -- --threshold 80
```

### 6.3 Security Scan

```bash
# npm 依賴漏洞掃描
npm audit --production

# 檢查禁止的程式碼模式 (OceanRAG 教訓)
# - 硬編碼 API key
# - innerHTML without escapeHtml
# - in-memory rate limit (必須用 KV)
npm run security:patterns
```

### 6.4 Config Validation

```bash
# 驗證 config.js 數值合理性
node scripts/validate-config.js

# 驗證 enums.js 完整性
node scripts/validate-enums.js

# 驗證 ARTICLE_STATUS 狀態機無死循環
node scripts/validate-state-machine.js
```

### Pre-deploy 檢查流程圖

```
Push / PR
  |
  v
[Lint] --fail--> Block merge
  |pass
  v
[Test (>=80%)] --fail--> Block merge
  |pass
  v
[Security Scan] --fail--> Block merge, notify T06
  |pass
  v
[Config Validation] --fail--> Block merge
  |pass
  v
[Deploy to staging/production]
```

---

## 7. Rollback Strategy

### 自動回滾條件

部署後 5 分鐘內若偵測到以下情況,自動回滾:

| 條件 | 閾值 | 來源 |
|------|------|------|
| Health endpoint 失敗 | /health 回傳非 200 | Workers |
| 錯誤率飆升 | > 5% 請求回傳 5xx | Cloudflare Analytics |
| KV 延遲異常 | > 100ms (目標 30ms) | config.js `MONITORING.TARGET_KV_LATENCY_MS` |

### 回滾操作

```bash
# Cloudflare Pages: 回退到前一次成功部署
wrangler pages deployment list --project-name=powerreader
wrangler pages deployment rollback --project-name=powerreader --deployment-id=<previous-id>

# Cloudflare Workers: 回退到前一版
wrangler rollback

# 緊急回滾 (手動)
git revert HEAD
git push origin main
# CI/CD 將自動觸發重新部署
```

### 回滾決策矩陣

| 嚴重度 | 範例 | 動作 | 時限 |
|--------|------|------|------|
| P0 Critical | 全站無法存取 | 自動回滾 + 通知所有人 | 5 分鐘內 |
| P1 High | 核心 API 錯誤 > 5% | 手動確認後回滾 | 15 分鐘內 |
| P2 Medium | 非核心功能異常 | 評估後決定 hotfix 或回滾 | 1 小時內 |
| P3 Low | UI 顯示問題 | 下個版本修復 | 下次部署 |

---

## 8. R2 Model Upload Pipeline

管理 Qwen3.5-4B (~3.4GB) 模型檔案的上傳與版本控管。

> **架構變更 (Decision #004, #007)**: CKIP BERT 已移除,不再需要上傳。Qwen 模型從 2B 升級為 4B (3.4GB)。嵌入模型 bge-m3 由 Cloudflare Workers AI 提供,無需手動上傳。

```yaml
# .github/workflows/model-upload.yml
name: Upload Model to R2

on:
  workflow_dispatch:
    inputs:
      model_name:
        description: "Model to upload"
        required: true
        type: choice
        options:
          - qwen-3.5-4b
      model_version:
        description: "Model version (e.g., 3.5.4)"
        required: true

jobs:
  upload:
    runs-on: ubuntu-latest
    timeout-minutes: 90    # 增加: 4B 模型較大

    steps:
      - uses: actions/checkout@v4

      - name: Validate model version
        run: |
          MODEL=${{ inputs.model_name }}
          VERSION=${{ inputs.model_version }}

          if [ "$MODEL" = "qwen-3.5-4b" ]; then
            EXPECTED="3.5.4"   # config.js MODELS.QWEN_VERSION
          fi

          echo "Uploading $MODEL v$VERSION (expected: v$EXPECTED)"

      - name: Download model from HuggingFace
        run: |
          MODEL=${{ inputs.model_name }}
          if [ "$MODEL" = "qwen-3.5-4b" ]; then
            # Qwen/Qwen3.5-4B (~3.4GB)
            python scripts/download_model.py --model Qwen/Qwen3.5-4B --output ./models/qwen/
          fi

      - name: Upload to R2
        env:
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: |
          MODEL=${{ inputs.model_name }}
          VERSION=${{ inputs.model_version }}

          # 上傳模型檔案到 R2 (含版本路徑)
          wrangler r2 object put \
            "powerreader-models/${MODEL}/v${VERSION}/" \
            --file ./models/${MODEL}/ \
            --content-type application/octet-stream

          # 更新 latest 指標
          echo "${VERSION}" | wrangler r2 object put \
            "powerreader-models/${MODEL}/latest.txt" \
            --pipe

      - name: Verify upload
        run: |
          wrangler r2 object list powerreader-models/${{ inputs.model_name }}/v${{ inputs.model_version }}/
          echo "Model upload verified"
```

### R2 儲存結構

```
powerreader-models/
  qwen-3.5-4b/
    latest.txt            # 內容: "3.5.4"
    v3.5.4/
      config.json
      tokenizer.json
      model-00001.safetensors
      model-00002.safetensors
      model-00003.safetensors  # 總計 ~3.4GB

powerreader-articles/
  {article_id}.md         # 文章全文 (Markdown)
```

### 模型下載條件 (用戶端)

依據 `shared/config.js` FRONTEND 設定:

| 條件 | 值 | 來源 |
|------|---|------|
| 僅 WiFi 下載 | `true` | `FRONTEND.DOWNLOAD_WIFI_ONLY` |
| 最低電量 | 20% | `FRONTEND.DOWNLOAD_MIN_BATTERY_PCT` |
| 需要充電中 | `true` | `FRONTEND.DOWNLOAD_REQUIRE_CHARGING` |
| 模型大小 | ~3.4GB | Qwen3.5-4B (Decision #004) |

---

## Common Mistakes (Learned from OceanRAG)

### Mistake 1: Secret 洩漏到 GitHub Actions Log

- **問題**: `echo $CF_API_TOKEN` 會將 secret 印到公開日誌中
- **解法**: GitHub 自動遮蔽已註冊的 secret,但衍生值 (如 base64 編碼後的 token) 不會被遮蔽。禁止在 log 中輸出任何 secret 的衍生值
- **影響**: T06 合規審查需檢查所有 workflow 的 `run` 步驟

### Mistake 2: Wrangler 版本不一致

- **問題**: 本地 Wrangler v3.x 與 CI 環境 v2.x 行為不同
- **解法**: 在 package.json 鎖定 `wrangler` 版本,CI 統一用 `npm ci`
- **影響**: 所有團隊必須使用同一個 wrangler 版本

### Mistake 3: Cron 時區誤判

- **問題**: GitHub Actions cron 使用 UTC 時區,`0 */2 * * *` 對台灣時間 (UTC+8) 意味著 08:00, 10:00, 12:00, 14:00... (每 2 小時)
- **解法**: 明確註記時區。若需要在台灣凌晨低流量時段執行,要計算 UTC 對應時間
- **影響**: T02 爬蟲排程需要考慮新聞來源的更新頻率和台灣時區

### Mistake 4: 忘記驗證 config.js 常數

- **問題**: 有人在 workflow 中硬編碼 `MAX_RETRIES: 5` 而非引用 `CRAWLER.MAX_RETRIES` (值為 3)
- **解法**: CI 中新增 `validate-config.js` 腳本,確保 workflow env 與 config.js 一致
- **影響**: 所有團隊,違反 SSOT 原則

### Mistake 5: R2 模型上傳後未驗證完整性

- **問題**: 大檔案上傳可能中途中斷,導致模型檔案不完整
- **解法**: 上傳後比對 SHA256 雜湊值,不符則重傳
- **影響**: T04 前端下載到不完整模型會導致推理失敗

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更原因 |
|------|------|---------|---------|
| v0.1 | 2025-03-06 | 骨架版本 | 快速建立架構 |
| v1.0 | 2026-03-06 | 完整內容: workflows, 分支策略, secret 管理, 回滾, R2 管線 | 填充文檔實質內容 |
| v1.1 | 2026-03-07 | 專案更名 powerreader, cron 2h/50篇, 移除 CKIP BERT, Qwen 4B (3.4GB), wrangler.toml 加 D1/Vectorize/Workers AI, R2 bucket 更名, LINE secrets 標註 Phase 4 | Decisions #004, #007, #008, #010 |
| v1.2 | 2026-03-07 | 新增 Secrets Rotation Policy 章節: 輪替排程、Leak detection、Emergency rotation 7步驟、OIDC 評估 | T06 安全審計 (cross-team comm 20260307_1003) |

---

**文件維護者**: T07 Deployment
**最後更新**: 2026-03-07
**狀態**: v1.2 完整版
