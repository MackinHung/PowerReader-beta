# PowerReader 部署指南

## 前置條件
- Node.js 18+
- Cloudflare 帳號 (Free plan)
- `npm install -g wrangler`
- `wrangler login`

## Step 1: 建立 Cloudflare 資源

```bash
# D1 資料庫
wrangler d1 create powerreader-db

# R2 儲存桶
wrangler r2 bucket create powerreader-articles

# KV 命名空間
wrangler kv namespace create KV

# Vectorize 向量索引 (bge-m3 = 1024 維, cosine)
wrangler vectorize create powerreader-knowledge --dimensions=1024 --metric=cosine
```

## Step 2: 更新 wrangler.toml

把 Step 1 產生的 ID 填入 `wrangler.toml`:
- `<REPLACE_WITH_D1_DATABASE_ID>`
- `<REPLACE_WITH_PRODUCTION_KV_ID>`

## Step 3: 執行 D1 遷移

```bash
wrangler d1 execute powerreader-db --file=src/workers/migrations/0001_initial.sql
wrangler d1 execute powerreader-db --file=src/workers/migrations/0002_metrics.sql
wrangler d1 execute powerreader-db --file=src/workers/migrations/0003_t05_reward.sql
wrangler d1 execute powerreader-db --file=src/workers/migrations/0004_knowledge_entries.sql
```

## Step 4: 設定密鑰

```bash
# Admin API Token (自訂一個強密碼)
wrangler secret put ADMIN_API_TOKEN

# Service Token (給爬蟲用)
wrangler secret put SERVICE_TOKEN

# Google OAuth (T04 前端登入用, 可後續設定)
wrangler secret put GOOGLE_CLIENT_ID
```

## Step 5: 部署 Workers

```bash
wrangler deploy
```

## Step 6: 匯入知識庫 (1,121 筆)

```bash
# 先產生 batch JSON
python scripts/import_knowledge.py

# 打 API 匯入 (23 批 x 50 筆, 約 2 分鐘)
python scripts/import_knowledge.py --post https://powerreader-api.YOUR_SUBDOMAIN.workers.dev --token YOUR_ADMIN_TOKEN
```

## Step 7: 驗證

```bash
# 搜尋測試 — 柯文哲應該回傳 TPP 條目
curl "https://YOUR_API/api/v1/knowledge/search?q=柯文哲" -H "Authorization: Bearer TOKEN"

# 搜尋測試 — 九二共識應該回傳 3 黨立場
curl "https://YOUR_API/api/v1/knowledge/search?q=九二共識" -H "Authorization: Bearer TOKEN"

# 列表測試
curl "https://YOUR_API/api/v1/knowledge/list?type=politician&party=DPP&limit=5" -H "Authorization: Bearer TOKEN"
```

## 預估資源消耗

| 資源 | 消耗量 | 免費額度 | 佔比 |
|------|--------|---------|------|
| Workers AI neurons | 1,794 (匯入) | 10,000/天 | 18% |
| Vectorize 維度 | 1,121 × 1024 = 1.1M | 30M/月 | 3.8% |
| D1 寫入 | 1,121 rows | 5M/天 | 0.02% |
| Workers 請求 | 23 batch calls | 100K/天 | 0.02% |
