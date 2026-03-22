# PowerReader — AI代理識讀新聞立場分析平台

## 專案概覽

去中心化新聞立場分析平台。使用者透過 WebLLM 在瀏覽器內運行 Qwen3-8B 進行本地推論，Cloudflare 全棧提供 RAG 知識注入。

- **前端**: `powerreader-next/` — SvelteKit 2 + Svelte 5 + TypeScript（詳見 `powerreader-next/CLAUDE.md`）
- **後端**: `src/workers/` — Cloudflare Workers API + D1 + R2 + KV + Vectorize
- **獎勵系統**: `T05_REWARD_SYSTEM/` — 點數計算、品質驗證、冷卻機制
- **共用模組**: `shared/` — config、enums、validators、state-machine
- **知識庫資料**: `knowledge_batch_payloads/` — 808+ 筆 JSON 批次

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | SvelteKit 2 + Svelte 5 + TypeScript + Cloudflare Pages |
| 後端 | Cloudflare Workers + D1 + R2 + KV + Vectorize + Workers AI |
| 推論 | Qwen3-8B via WebLLM (WebGPU, 4-bit, ~4.3GB, ~7s/篇) |
| 嵌入 | Workers AI bge-m3 (1024d) + bge-small-zh (512d) |
| 爬蟲 | GitHub Actions (閉源, 每 2h) |
| 認證 | Google OAuth + JWT RS256 |

## RAG 三層 Prompt 架構

- **L1 (靜態)**: 政治光譜定義 (0=泛綠 ~ 100=泛藍) + JSON schema
- **L2 (RAG 動態)**: 知識庫條目 (政治人物/議題/事件)
- **L3 (輸入)**: 新聞原文 (截取前 8,400 字, ≤ context window 40%)

## 部署

```bash
# 前端 (SvelteKit)
cd powerreader-next && npm run build
# 透過 Cloudflare Pages 自動部署 (production branch = master)

# 後端 (Workers) — 見 DEPLOY_GUIDE.md
npx wrangler deploy --dry-run --outdir dist
# REST API 上傳 (因 Non-ASCII 路徑 + Node.js v24 不相容)
```

## 測試

```bash
# 前端 (1,342 tests)
cd powerreader-next && npm test

# 後端 Workers
cd src/workers && npx vitest run

# 獎勵系統
cd T05_REWARD_SYSTEM && npx jest
```

## 授權

AGPL-3.0
