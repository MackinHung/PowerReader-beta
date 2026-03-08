# shared/ — PowerReader Shared Libraries

Central shared modules used by all teams (T01-T07). These files are **SSOT** (Single Source of Truth) and must not be duplicated.

## Files

| File | Lines | Purpose | SSOT? |
|------|-------|---------|-------|
| `config.js` | 355 | All system-wide constants (models, Cloudflare limits, reward params, etc.) | Yes |
| `enums.js` | 378 | All enum-like values (news sources, statuses, categories, error types) | Yes |
| `response.js` | ~60 | `jsonResponse()` / `successResponse()` / `errorResponse()` for Workers handlers | No |
| `errors.js` | ~128 | Structured error responses + logging + error wrapping middleware | No |
| `utils.js` | ~67 | Pure utility functions (date, hash, escapeHtml, validation helpers) | No |
| `validators.js` | — | Input validation for articles, analyses, knowledge entries | No |
| `state-machine.js` | — | Article status transition logic | No |
| `kv-budget.js` | — | KV write budget tracking (free tier: 1000 writes/day) | No |

## Rules

1. **Never split** `config.js` or `enums.js` — they are intentionally monolithic SSOT files
2. **Never duplicate** values defined here — import them instead
3. **All handlers** must use `shared/response.js` for JSON responses (no local `jsonResponse()`)
4. **All error handling** should use `shared/errors.js` for structured error responses
5. **escapeHtml()** must be applied to all user-supplied strings before rendering
6. **Parameterized SQL** only — never interpolate values into queries

## Cross-Team Communication

See `cross_team_comms/README.md` for the file-based async message queue between teams.

## Deprecation Notes

- `NEWS_SOURCES.TAIWAN_APPLE_DAILY` — ceased 2021, historical data only, not crawled
- `NEWS_SOURCES.STORM_MEDIA` — RSS feed broken (encoding damage + single entry), crawler uses independent repo now
