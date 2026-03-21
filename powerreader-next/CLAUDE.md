# PowerReader Next - Cold Start

## Project Info
- **Stack**: SvelteKit + Svelte 5 + TypeScript + Vite + Vitest
- **Repo**: `MackinHung/PowerReader-beta` branch `master`
- **Deploy**: Cloudflare Pages project `powerreader` (production branch = `master`)
- **Tests**: `npm test` (vitest run) — 875 tests (867 pass, 8 known-failing in ClusterCardV2)

## Directory Structure
```
src/
  lib/
    components/   # Svelte UI components (analysis, article, data-viz, knowledge, share, ui)
    core/         # Business logic (api, auth, db, groq, inference, benchmark, etc.)
    i18n/         # zh-TW translations
    pages/        # Page-level logic helpers (analyze, article, event, settings)
    share/        # Card share/render logic
    stores/       # Svelte 5 $state stores (analysis, articles, auth, events, knowledge, mediaQuery)
    types/        # TypeScript type definitions (api, models, inference, stores)
    utils/        # Utilities (device-detect, event-emitter, idb-helpers, knowledge-constants)
    assets/       # Static assets
  routes/         # SvelteKit file-based routing
tests/            # Unit + component tests (vitest + jsdom + @testing-library/svelte)
static/           # sw.js, icons, fonts
scripts/          # Build scripts
```

## Key Conventions
- Svelte 5 runes ($state, $derived, $effect) — NOT legacy stores
- Direct component imports (NOT barrel index.ts) — barrels were removed in dead code cleanup
- `$lib/` alias for `src/lib/`
- Types imported from their source files (e.g., `$lib/types/api.js`) — barrel `types/index.ts` only re-exports 6 types used by `pages/` helpers
- i18n via `t()` function from `$lib/i18n/zh-TW.js`

## Known Issues
- ClusterCardV2.test.js: 8 failing tests (sub-cluster badge `.sub-badge` selector mismatch)
- `@tsconfig/svelte` devDep appears unused by knip but tsconfig extends it

## Build & Test
```bash
npm test           # vitest run (875 tests)
npm run build      # node scripts/build.mjs
npm run dev        # vite dev
npm run typecheck  # svelte-check
```

## Dead Code Cleanup Log

### Round 1 (2026-03-21) — 21 files deleted, 5 edited, ~1,644 lines removed
**Code Review: APPROVED (0 CRITICAL, 0 HIGH)**

| Category | Files Deleted | Lines |
|----------|---------------|-------|
| Root scripts | `_test_esbuild.mjs`, `_test_ssr_build.mjs`, `scripts/migrate-knowledge-v2.mjs` | ~75 |
| Unused stores | `hardware.svelte.ts`, `settings.svelte.ts` | ~274 |
| Unused utils | `error.ts`, `sanitize.ts`, `score-categories.ts`, `knowledge-validators.ts` | ~238 |
| Unused components | `PreChecks.svelte`, `EventCard.svelte`, `FeedbackButtons.svelte`, `ReportDialog.svelte`, `Dialog.svelte`, `TextField.svelte`, `AutoRunnerBar.svelte` | ~868 |
| Empty barrel index.ts | analysis, article, data-viz, feedback, share, ui (6 files) | ~32 |
| Empty directory | `components/feedback/` removed | — |

**Surgically edited:**
- `knowledge-constants.ts`: Removed 8 unused exports
- `settings-helpers.ts`: Removed `createInfoRow`
- `device-detect.ts`: Removed `getBrowserInfo` + `WEBGPU_BROWSER_REQUIREMENTS`
- `types/index.ts`: Reduced from 42 to 6 re-exports (Article, AnalysisResult, CampRatio, FeedbackType, GPUScanResult, QueueStatus)
- `zh-TW.ts`: Removed unused default export

**Knip false positives (confirmed KEEP):**
- `static/sw.js` — Service worker registered in +layout.svelte
- `GlobalAutoRunnerBar.svelte` — Dynamic import in +layout.svelte
- `ClusterCard.svelte` — Fallback import in +page.svelte
- `SourceDots.svelte` — Used by ClusterCard.svelte

**Remaining low-priority (type-only, no runtime impact):**
- 6 unused type defs: AnalysisModeOption, ThemeOption, BiasCategory, ReportReason, QueueJob, BrowserInfo
- `storeGroupAnalysis`, `SOURCE_MAP` — used internally, knip false positive
