# src/workers/ — Cloudflare Workers API

## Architecture

```
index.js          — Worker entrypoint (fetch + scheduled)
router.js         — Route table + request dispatcher
handlers/         — Route handler functions
middleware/       — Auth, CORS, rate limiting
monitoring/       — T07 probes, metrics, alerts, collector
migrations/       — D1 SQL schema migrations
```

## Handlers

| File | Endpoints | Auth |
|------|-----------|------|
| `articles.js` | GET/POST articles, batch, cluster | none/service |
| `analysis.js` | POST analysis, GET analyses | jwt/none |
| `knowledge.js` | Barrel re-export (split below) | — |
| `knowledge-read.js` | GET article knowledge | none |
| `knowledge-admin.js` | POST upsert/batch, GET search/list | admin |
| `auth.js` | Google OAuth, user CRUD, contributions | none/jwt |
| `points.js` | GET user points | jwt |
| `rewards.js` | POST submit/failure, GET summary | service |
| `health.js` | GET health, readiness, metrics, usage | none/service |

## Middleware

| File | Purpose |
|------|---------|
| `auth.js` | JWT (RS256) verification + Service Token validation |
| `cors.js` | CORS headers for cross-origin requests |
| `rate-limit.js` | Rate limiting via Cache API (no KV budget impact) |

## Key Patterns

- **All responses** use `shared/response.js` `jsonResponse()` — no local duplicates
- **All SQL** uses `.bind()` parameterized queries — never interpolate
- **XSS prevention** via `shared/utils.js` `escapeHtml()` on all user strings
- **Error responses** never leak internal details — use `shared/errors.js`

## Monitoring (T07)

| File | Purpose |
|------|---------|
| `probes.js` | Health probes for D1, R2, Vectorize, KV, Workers AI |
| `metrics.js` | Metrics aggregation + daily counters |
| `alerts.js` | Threshold-based alerting |
| `collector.js` | Periodic metrics collection |
