# T04_FRONTEND — PowerReader PWA Frontend

Deployed to Cloudflare Pages at `https://powerreader.pages.dev`.

## Directory Structure

```
src/
  index.html          — SPA entry (loads main.css + page CSS + app.js)
  dashboard.html      — Monitoring dashboard (standalone, dark theme)
  sw.js               — Service Worker (cache-first + network-first + BG sync)
  manifest.json       — PWA manifest
  css/
    main.css          — Base reset, tokens, layout, nav, bias-bar, controversy-meter, buttons, states
    article.css       — Article card, detail, bias-indicator, knowledge-panel, cluster-panel
    analyze.css       — Analysis flow UI (Phase 3)
    profile.css       — User profile, points, contributions (Phase 4)
    settings.css      — Model download, preferences (Phase 5)
    onboarding.css    — First-time guide (Phase 6)
    dashboard.css     — Dashboard-only dark theme (standalone, no main.css dependency)
  js/
    app.js            — SPA router + page mounting
    api.js            — API client (offline-first, IndexedDB cache)
    auth.js           — Google OAuth + JWT management
    db.js             — IndexedDB wrapper
    dashboard.js      — Dashboard controller (KPI, charts, alerts, usage bars)
    components/       — Reusable UI components (bias-bar, controversy-badge, article-card)
    model/            — Local Qwen inference (Ollama)
      inference.js    — Mode detection + inference orchestration
      manager.js      — Model download management
      prompt.js       — 3-layer prompt assembly (L1+L2+L3)
      output-parser.js— Parse Qwen JSON output
      ollama-detect.js— Ollama availability detection
    pages/            — Page renderers (see below)
    utils/            — Client-side utilities (sanitize, error, score-categories)
  locale/             — i18n strings (zh-TW)
```

## Pages

| File | Route | Purpose |
|------|-------|---------|
| `home.js` | `#/` | Article list + filters |
| `article-detail.js` | `#/article/:id` | Single article view |
| `analyze.js` | `#/analyze/:hash` | AI bias analysis (split into 4 sub-modules) |
| `compare.js` | `#/compare/:id` | Cross-media comparison |
| `profile.js` | `#/profile` | User points + contributions (split into 3 sub-modules) |
| `settings.js` | `#/settings` | Model download + preferences |
| `onboarding.js` | `#/onboarding` | First-time user guide |
| `dashboard.html` | Standalone | System monitoring (no SPA router) |

## File Splitting

### analyze.js (split)
- `analyze.js` — Main entry + route handler
- `analyze-checks.js` — Pre-analysis validation + blocked state
- `analyze-engine.js` — Inference pipeline + status UI
- `analyze-result.js` — Result preview + submit
- `analyze-helpers.js` — Deadline indicator + error rendering

### profile.js (split)
- `profile.js` — Main entry + login prompt + header
- `profile-points.js` — Points KPI + sparkline
- `profile-contributions.js` — Contribution history + account actions
- `profile-helpers.js` — Shared date formatting

### dashboard.html (split)
- `dashboard.html` — HTML structure only (99 lines)
- `css/dashboard.css` — Dark theme styles (standalone)
- `js/dashboard.js` — Controller: KPI, Canvas charts, usage bars, alerts, auto-refresh

## CSS Architecture

| File | Lines | Scope |
|------|-------|-------|
| `main.css` | ~520 | Shared: tokens, reset, layout, nav, bias-bar, controversy-meter, buttons, states |
| `article.css` | ~260 | Article: card, detail, bias-indicator, knowledge-panel, cluster-panel |
| `analyze.css` | ~200 | Analysis flow |
| `profile.css` | ~150 | User profile |
| `settings.css` | ~100 | Settings page |
| `onboarding.css` | ~80 | Onboarding guide |
| `dashboard.css` | ~460 | Dashboard (standalone dark theme) |

## SSOT Mirrors

`utils/score-categories.js` mirrors bias/controversy boundaries from `shared/config.js`.
If `ANALYSIS.BIAS_BOUNDARIES` or `ANALYSIS.CONTROVERSY_BOUNDARIES` change in the backend,
this file must be updated to match.

## Deployment

```bash
npx wrangler pages deploy src --project-name powerreader --branch main
```
