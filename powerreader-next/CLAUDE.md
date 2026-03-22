# PowerReader — AI代理識讀新聞立場分析平台

## Project Info
- **Stack**: SvelteKit 2 + Svelte 5 + TypeScript + Vite + Vitest
- **Repo**: `MackinHung/PowerReader` branch `master`
- **Deploy**: Cloudflare Pages project `powerreader` (production branch = `master`)
- **Tests**: `npm test` (vitest run) — 1,342 tests (all passing)

## Directory Structure
```
src/
  lib/
    components/   # Svelte UI (analysis, article, data-viz, knowledge, share, ui)
    core/         # Business logic (api, auth, db, inference, benchmark, etc.)
    i18n/         # zh-TW translations
    pages/        # Page-level logic helpers
    share/        # Card share/render logic
    stores/       # Svelte 5 $state stores
    types/        # TypeScript type definitions
    utils/        # Utilities (device-detect, event-emitter, idb-helpers)
    assets/       # Static assets
  routes/         # SvelteKit file-based routing
tests/            # Unit + component tests (vitest + jsdom + @testing-library/svelte)
e2e/              # Playwright E2E tests
data/knowledge/   # Knowledge base JSON batches
docs/             # Design documents
static/           # sw.js, icons, fonts
scripts/          # Build scripts
```

## Key Conventions
- Svelte 5 runes (`$state`, `$derived`, `$effect`) — NOT legacy stores
- Direct component imports — no barrel `index.ts` files
- `$lib/` alias for `src/lib/`
- Types imported from source files (e.g., `$lib/types/api.js`)
- i18n via `t()` function from `$lib/i18n/zh-TW.js`

## Build & Test
```bash
npm test           # vitest run
npm run build      # node scripts/build.mjs
npm run dev        # vite dev
npm run typecheck  # svelte-check
npm run test:e2e   # playwright test
```
