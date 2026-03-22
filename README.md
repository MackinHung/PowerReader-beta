# PowerReader — 台灣新聞偏見分析系統

去中心化新聞偏見分析平台。用戶端透過 WebLLM 運行 Qwen3-4B 瀏覽器內推理，Cloudflare 全棧提供 RAG 知識注入。

## Quick Start

```bash
# Install dependencies
npm install

# Build Workers (dry-run)
npx wrangler deploy --dry-run --outdir dist

# Run tests
cd T05_REWARD_SYSTEM && npx jest

# Deploy Workers (via REST API, see DEPLOY_GUIDE.md)
# Deploy Pages
npx wrangler pages deploy T04_FRONTEND/src --project-name powerreader --branch main
```

## Directory Structure

```
├── CLAUDE.md                  # Agent cold-start file (read first)
├── MASTER_ROADMAP.md          # Decisions, progress, file index
├── DEPLOY_GUIDE.md            # Cloudflare deployment instructions
│
├── shared/                    # SSOT config, enums, response helpers
├── src/workers/               # Cloudflare Workers API backend
│   ├── handlers/              #   Route handlers (articles, auth, knowledge, etc.)
│   ├── middleware/             #   Auth + rate limiting
│   └── index.js               #   Entry point
│
├── T04_FRONTEND/src/          # Cloudflare Pages PWA frontend
│   ├── js/pages/              #   Page modules (analyze, compare, profile, etc.)
│   ├── js/model/              #   Local Qwen inference + prompt assembly
│   └── js/utils/              #   Shared utilities
│
├── T05_REWARD_SYSTEM/         # Points engine + anti-cheat
│   └── src/                   #   points-calculation, points-validation
│
├── monitoring/                # Health checks, metrics, Sentry
├── scripts/                   # Validation + data import scripts
├── tests/                     # Test files + knowledge base CSVs
│
├── M01_PROJECT_LEAD/          # Project management docs
├── T01_SYSTEM_ARCHITECTURE/   # KV Schema, API Routes, architecture docs
├── T02_DATA_ACQUISITION/      # Crawler specs, news sources, dedup logic
├── T03_AI_INFERENCE/          # Prompt versions, quality gates, model reports
├── T06_COMPLIANCE/            # Crawler compliance, privacy, error handling
├── T07_DEPLOYMENT/            # CI/CD, monitoring, performance benchmarks
│
└── docs/                      # Common mistakes, data structure audit
```

## Architecture

```
Crawler (AGPL-3.0, separate repo)
  → RSS/API → bge-small-zh topic filter → dedup → clean
  → POST /api/v1/articles/batch → PowerReader API

PowerReader API (Cloudflare Workers)
  → bge-m3 embedding (Workers AI) → Vectorize knowledge search
  → R2 (full text) + D1 (structured data) + KV (config/cache)

Client (Cloudflare Pages PWA)
  → Fetch articles + knowledge → Assemble 3-layer prompt
  → WebLLM Qwen3-4B browser inference → Results + knowledge transparency panel
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Cloudflare Pages (PWA) + IndexedDB |
| Backend | Cloudflare Workers + D1 + R2 + KV + Vectorize |
| Embedding | Workers AI bge-m3 (1024d) + bge-small-zh (512d) |
| Inference | Qwen3-4B (client-side, WebLLM WebGPU, ~6s/article) |
| Crawler | GitHub Actions (every 2h), 13 RSS/API sources |
| Auth | Google OAuth (server-side redirect) + JWT RS256 |

## Support This Project

PowerReader 是一個完全開源的公民科技專案，致力於讓每個人都能用 AI 理解新聞背後的立場與偏見。

我們靠社群的力量維持營運 — 伺服器費用、資料處理、模型優化都需要持續投入。

### How to Support

| 管道 | 說明 |
|------|------|
| [GitHub Sponsors](https://github.com/sponsors/MackinHung) | 零手續費，直接支持開發者 |
| [Open Collective](https://opencollective.com/powerreader) | 完全透明的收支紀錄 |

即使是一杯咖啡的金額，也能幫助我們持續改善台灣的新聞分析工具。

### Why Sponsor?

- **100% 開源** — 你的贊助讓公共財持續存在
- **透明化** — 所有資金用途公開可查
- **公民驅動** — 不接受政黨或企業廣告收入

## License

AGPL-3.0 — see [LICENSE](LICENSE)

**Copyright** MackinHung
