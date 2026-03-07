# T04 Frontend Experience Team - Phase Plan

**Scope**: PWA (Cloudflare Pages), LINE Bot integration, browser extension, i18n (zh-TW), local model management (Qwen3.5-4B), offline capability, accessibility (WCAG 2.1 AA).

---

## Phase 1: Foundation (PWA Shell + Tooling)

**Goal**: Deployable PWA shell with Service Worker, IndexedDB, and locale system.

| Deliverable | Details |
|-------------|---------|
| `manifest.json` | App name, icons, standalone display, `lang: zh-TW` (from `config.js`) |
| Service Worker v1 | Cache-First for static assets (10-day TTL), Network-First for `/api/*` |
| IndexedDB setup | 5 stores: `articles`, `user_analyses`, `cached_results`, `pending_sync`, `model_files` |
| `locale/zh-TW.js` | All UI strings via `t()` function, no hardcoded Chinese |
| `utils/sanitize.js` | `escapeHtml()` - mandatory for all user-facing content |
| CSP headers | `wasm-unsafe-eval`, `worker-src blob:`, `frame-src 'none'` |
| Font loading | Noto Sans TC with `font-display: swap`, CJK subset |
| Login / OAuth flow | Anonymous browse → OAuth trigger on analyze → return to previous page |
| Privacy consent UI | Consent dialog before OAuth (per 個資法第 8 條), consent record to KV |

**Dependencies on other teams**:
- T01: Finalized API routes (`API_ROUTES.md`) and KV schema (`KV_SCHEMA.md`)
- T01: Cloudflare Pages project created

**Exit criteria**: Lighthouse PWA audit passes; app installable on mobile.

---

## Phase 2: Core Pages (Home + Article Detail) — Code Scaffold Complete

**Goal**: Users can browse trending news and view bias visualizations.

| Deliverable | Details | Status |
|-------------|---------|--------|
| API client (`js/api.js`) | Unified fetch + IndexedDB offline fallback + response caching | Done |
| Bias bar component (`js/components/bias-bar.js`) | Spectrum bar with indicator + compact badge + a11y labels | Done |
| Controversy badge (`js/components/controversy-badge.js`) | Colored badge + meter bar with fill + a11y | Done |
| Article card (`js/components/article-card.js`) | Clickable card with source, title, summary, bias, controversy | Done |
| Home page (`js/pages/home.js`) | Trending articles sorted by controversy, IntersectionObserver infinite scroll (20/page), category filter | Done |
| Article Detail (`js/pages/article-detail.js`) | Bias spectrum bar, controversy meter, knowledge panel (expandable), cross-media cluster, original link | Done |
| i18n source names (`locale/zh-TW.js`) | 17 Taiwan media source display names added | Done |
| Router integration (`js/app.js`) | Phase 1 stubs replaced with real page imports | Done |
| CSS styles (`css/main.css`) | Article card, bias indicator, controversy badge, knowledge panel, cluster panel, buttons, states | Done |
| Offline reading | IndexedDB-cached articles available offline, offline banner | Done (via api.js) |
| Persistent storage | `navigator.storage.persist()` request on startup | Done (Phase 1) |
| Cache cleanup | TTL-based eviction (10-day `cached_at` check) | Done (Phase 1) |

**Files added (Phase 2)**: 6 new + 3 modified = 9 files total
- `js/api.js` (246 lines) — API client with offline-first strategy
- `js/components/bias-bar.js` (85 lines) — Bias spectrum visualization
- `js/components/controversy-badge.js` (85 lines) — Controversy level display
- `js/components/article-card.js` (105 lines) — Article list card
- `js/pages/home.js` (232 lines) — Home page with infinite scroll
- `js/pages/article-detail.js` (333 lines) — Article detail with knowledge + cluster

**Note**: API endpoints not yet live — pages will function once T01/T02/T03 deliver backend APIs. Offline fallback to IndexedDB cache works immediately.

**Dependencies on other teams**:
- T01: `GET /api/v1/articles`, `GET /api/v1/articles/:id`, `GET /api/v1/articles/:id/cluster`, `GET /api/v1/articles/:id/knowledge`, `GET /api/v1/articles/:id/analyses` endpoints live
- T02: Articles flowing into D1/R2 with correct schema
- T03: Bias/controversy scores populated

**Provides to other teams**:
- T07: Performance benchmarks (Core Web Vitals targets: FCP < 2s, LCP < 2.5s, CLS < 0.1)

---

## Phase 3: Local Model + Analysis Page — Code Scaffold Complete

**Goal**: Users download Qwen3.5-4B and run local bias analysis.

| Deliverable | Details | Status |
|-------------|---------|--------|
| Model manager (`js/model/manager.js`) | WiFi + battery > 20% + storage checks, AbortController pause/resume, OPFS preferred | Done |
| Model storage | OPFS preferred, IndexedDB `model_files` fallback, Range request resume | Done |
| Download UI | Progress bar, pause/resume, condition status indicators (integrated in analyze page) | Done |
| Inference engine (`js/model/inference.js`) | Fallback chain: Ollama → WebGPU → WASM → Server, 3-layer prompt assembly, JSON output parsing | Done |
| Ollama detection (`js/model/ollama-detect.js`) | T07 module integrated — detects local Ollama + Qwen3.5-4B availability (3s timeout) | Done |
| Analysis page (`js/pages/analyze.js`) | Pre-checks, inference execution, result preview, confirm-then-submit | Done |
| Cooldown timer UI | 1-hour countdown (3 failures), button disabled, timer display | Done |
| 72h analysis deadline indicator | Remaining time indicator, disable analyze after 72h | Done |
| Inference waiting UX | Progress animation, >10s comfort message, >30s server fallback button | Done |
| Background Sync | Offline submissions queued in `pending_sync` IndexedDB store | Done |
| CSS styles (`css/analyze.css`) | Separated analysis styles (status, result, blocked, deadline) | Done |

**Files added (Phase 3)**: 5 new + 2 modified = 7 files total
- `js/model/manager.js` (310 lines) — Model download manager with pre-checks + Ollama detection + resumable download
- `js/model/inference.js` (280 lines) — Inference fallback chain: Ollama → WebGPU → WASM → Server, with prompt assembly and JSON parsing
- `js/model/ollama-detect.js` (112 lines) — Ollama HTTP API detection (from T07)
- `js/pages/analyze.js` (633 lines) — Full analysis page with pre-checks, execution, result preview
- `css/analyze.css` (205 lines) — Analysis page styles (extracted from main.css)

**Note**: Ollama inference fully implemented (calls localhost:11434/api/generate). WebGPU/WASM local inference still stubbed — awaiting T03 model binary on R2. Server fallback always available.

**Dependencies on other teams**:
- T03: Qwen3.5-4B model binary hosted on R2, prompt template finalized
- T01: `/api/analysis/submit` endpoint live, Workers AI fallback configured

**Provides to other teams**:
- T03: Client-side inference telemetry (mode used, latency)
- T05: Analysis results submitted for reward calculation

---

## Phase 4: LINE Bot + Profile + Reward UI — Code Scaffold Complete

**Goal**: LINE channel operational; users see points and contribution history.

| Deliverable | Details | Status |
|-------------|---------|--------|
| LINE Bot webhook | `POST /api/v1/line/webhook`, HMAC-SHA256 Step 1 + hash-first ID flow | Design complete (LINE_BOT_DESIGN.md v1.1), T06 security audit resolved |
| Rich Menu | 6-grid menu spec in LINE_BOT_DESIGN.md | Design complete (server-side config) |
| Flex Message templates | Daily digest, comparison card, error card (all in design doc) | Design complete |
| LIFF integration | Open PWA detail pages from LINE | Design complete |
| Profile page (`js/pages/profile.js`) | Points KPI (4格), 30-day sparkline, contribution history, account actions | Done |
| Auth module (`js/auth.js`) | JWT token storage, OAuth callback, privacy consent dialog (requireConsent) | Done |
| Privacy consent UI | Modal dialog before OAuth — checkbox + policy link + consent record in localStorage | Done |
| User API (`js/api.js`) | fetchUserMe, fetchUserPoints, fetchUserContributions | Done |
| OAuth callback | `#/auth/callback?token=xxx&session=xxx` → store + redirect | Done |
| Profile CSS (`css/profile.css`) | Header, KPI grid, sparkline, contributions, account actions | Done |
| ~~Vote submission UI~~ | ~~Integrated with reward system~~ — **Phase 2+ 延後 (決策 #010)** | N/A |
| Push strategy | Daily digest 1x/day, vote results, system updates (all free tier) | Design complete |

**Files added (Phase 4)**: 3 new + 4 modified = 7 files total
- `js/pages/profile.js` (302 lines) — Profile page with points, trend, contributions
- `js/auth.js` (155 lines) — JWT storage, auth helpers, privacy consent dialog
- `css/profile.css` (210 lines) — Profile page styles

**Dependencies on other teams**:
- T01: `/api/user/points` endpoint live
- T05: Reward calculation logic finalized, points API available
- T06: Privacy policy for LINE user data (SHA-256 hashed user IDs only)

**Provides to other teams**:
- T06: LINE Bot message samples for compliance review

---

## Phase 5: Compare + Settings + Browser Extension — Code Scaffold Complete

**Goal**: Full feature set including cross-media comparison and browser extension.

| Deliverable | Details | Status |
|-------------|---------|--------|
| Compare page (`js/pages/compare.js`) | High-controversy events → cluster → side-by-side bias bars per source, spread indicator | Done |
| Settings page (`js/pages/settings.js`) | Model management, cache management, notification toggle, about/version | Done |
| Settings/Compare CSS (`css/settings.css`) | Settings card, toggle, about row, compare card/row/spread | Done |
| Browser extension | MV3 manifest, content script (10 news sites), popup (bias bar + controversy), context menu, background worker, badge score | Done |
| Extension i18n | `_locales/zh_TW/messages.json` (23 keys), all strings via `chrome.i18n.getMessage()`, manifest `__MSG_*__` substitution | Done |
| Push notifications | Web Push API integration, opt-in toggle in settings | Toggle UI done, API integration server-side |

**Files added (Phase 5)**: 3 new (PWA) + 6 new (extension) + 3 modified = 12 files total
- `js/pages/compare.js` (146 lines) — Cross-media comparison page
- `js/pages/settings.js` (254 lines) — Settings with model/cache/notification/about
- `css/settings.css` (193 lines) — Settings + compare styles
- `extension/manifest.json` — Chrome Extension Manifest V3
- `extension/background.js` (115 lines) — Context menu, badge, API relay
- `extension/content.js` (18 lines) — Article detection on news sites
- `extension/popup.html` — Popup UI with bias bar + controversy badge
- `extension/popup.js` (136 lines) — Popup logic with result rendering

**Dependencies on other teams**:
- T01: `/api/articles/compare` endpoint live with `similarity_cluster` data
- T02: Cross-media event clustering operational

---

## Phase 6: Polish + Accessibility + QA — Code Scaffold Complete

**Goal**: Production-ready quality across all surfaces.

| Deliverable | Details | Status |
|-------------|---------|--------|
| WCAG 2.1 AA audit | Focus management on route change, keyboard nav for clickable elements, ARIA labels (zh-TW), skip-to-content | Done |
| Device testing | 5 devices minimum (high-end/low-end/mobile/tablet/desktop) | Blocked (needs deployment) |
| Lighthouse targets | Performance >= 90, Accessibility >= 90, Best Practices >= 90, SEO >= 90 | Blocked (needs deployment) |
| Error UX (`utils/error.js`) | `getUserErrorMessage()` maps HTTP status + error types to i18n strings, integrated in home/compare pages, no internal leaks | Done |
| SW version migration | Old cache cleanup on activate (version-filtered, not delete-all), v1→v2→v3 | Done |
| ROC calendar option | Toggle in settings display section, stored in localStorage | Done |
| Onboarding flow (`pages/onboarding.js`) | 4-step guide: welcome → spectrum tutorial → local AI → get started | Done |
| Sync failure recovery | `showSyncFailureBanner()` with retry/dismiss buttons, SW message listener | Done |

**Files added (Phase 6)**: 3 new + 7 modified = 10 files total
- `js/pages/onboarding.js` (156 lines) — 4-step onboarding flow
- `css/onboarding.css` (105 lines) — Onboarding styles
- `js/utils/error.js` (82 lines) — Error message utility with status/type mapping

**Dependencies on other teams**:
- T06: Final compliance review (XSS, CSP, error messages, privacy)
- T07: CI/CD pipeline for Cloudflare Pages deployment

---

## Cross-Team Dependency Summary

| We need from | What | When |
|-------------|------|------|
| T01 | API routes, KV schema, CF Pages project | Phase 1 |
| T01 | All API endpoints live | Phase 2-5 |
| T02 | Articles in KV, event clustering | Phase 2, 5 |
| T03 | Model binary on R2, prompt template | Phase 3 |
| T05 | Points API, reward logic | Phase 4 |
| T06 | Privacy policy, compliance review | Phase 4, 6 |
| T07 | CI/CD pipeline | Phase 6 |

| We provide to | What | When |
|--------------|------|------|
| T03 | Inference telemetry (mode, latency) | Phase 3+ |
| T05 | Analysis submission UI | Phase 3 |
| T06 | LINE Bot messages + extension for review | Phase 4-5 |
| T07 | Lighthouse benchmarks, SW update strategy | Phase 2, 6 |

---

## Risks and Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| T01 API delays | Blocks Phase 2+ | Build with mock data (`config.js DEV.USE_MOCK_DATA`), swap to live APIs later |
| Qwen 3.4GB download on mobile | User drop-off | Strict pre-checks (WiFi/battery/charging), server fallback always available |
| WebGPU browser support | Low-end devices cannot run local inference | WASM fallback + server fallback chain |
| KV write limit (1000/day free) | Background Sync flood | Batch submissions, client-side dedup before sync |
| LINE Flex Message 10KB limit | Complex articles truncated | Enforce 200-char summary, max 10 carousel bubbles |
| CJK font file size (~1MB+) | Slow FCP on first load | `font-display: swap`, subset to CJK range, preload critical weight |
