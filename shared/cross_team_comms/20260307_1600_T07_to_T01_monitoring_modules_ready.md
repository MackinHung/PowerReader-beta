# T07 Monitoring Modules Ready for Integration

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T07 (Deployment & Monitoring) |
| **Target Team** | T01 |
| **Priority** | 🟡 MEDIUM |
| **Created** | 2026-03-07 16:00 |
| **Deadline** | Before Phase 2 deployment |
| **Related Files** | src/workers/monitoring/*.js, src/workers/migrations/0002_metrics.sql |

## Summary

T07 has completed Phase 2 monitoring modules. All code is ready for T01 integration.

## Files Created (T07)

### 1. D1 Migration: `src/workers/migrations/0002_metrics.sql`
New tables:
- `metrics_hourly` — Aggregated metrics per hour (avg/p95/min/max)
- `metrics_raw` — Raw per-request samples (cleaned after 2h)
- `alerts` — Alert lifecycle tracking (active/resolved/suppressed)
- `daily_counters` — Daily resource usage counters (workers_requests, d1_reads, etc.)

**Action Required**: Run migration on D1:
```bash
wrangler d1 execute powerreader-db --file=./src/workers/migrations/0002_metrics.sql
```

### 2. Monitoring Probes: `src/workers/monitoring/probes.js`
- `runAllProbes(env, { includeAI })` — Tests D1, R2, Vectorize, KV, Workers AI connectivity
- Each probe returns `{ status, latency_ms, message? }`
- Workers AI probe skipped by default (conserves neurons)
- Already integrated into `health.js` `/health/ready` handler

### 3. Metrics Aggregation: `src/workers/monitoring/metrics.js`
- `getFullMetrics(env)` — Returns complete metrics payload for `/metrics`
- Includes: latency stats (avg/p95/p99), CDN hit rate, crawler/analysis stats, resource usage
- All queries use D1 (not KV) to avoid write quota consumption

### 4. Metrics Collector: `src/workers/monitoring/collector.js`
- `createMetricsCollector()` — Lightweight per-request instrumentation
- Records: latencies, cache hits, request counts, resource usage
- Flushes to D1 via `ctx.waitUntil(collector.flush(env))`
- `aggregateHourly(env)` — Cron function for hourly rollups

### 5. Alert Engine: `src/workers/monitoring/alerts.js`
- `evaluateAlerts(env, metrics)` — Evaluates 11 alert rules (P0-P3)
- 1h suppression window prevents alert storms
- Auto-resolves cleared alerts

### 6. Modified: `src/workers/handlers/health.js`
- `/health/ready` now uses `runAllProbes()` (replaces inline probes)
- `/metrics` now uses `getFullMetrics()` + `getActiveAlerts()` (replaces stubs)
- `/monitoring/usage` now reads D1 daily_counters for Workers AI + Vectorize usage

### 7. Dashboard: `src/dashboard/index.html`
- Static HTML monitoring page (667 lines, dark theme)
- 5 KPI cards, 2 trend charts (canvas), 5 resource bars, crawler/analysis panels
- Calls `/api/v1/metrics` and `/api/v1/monitoring/usage` with Service Token

## Integration Points for T01

### Required Changes by T01:

1. **Collector middleware in index.js** (optional but recommended):
```javascript
import { createMetricsCollector } from './monitoring/collector.js';

// Inside fetch handler:
const collector = createMetricsCollector();
collector.recordRequest();
// ... after D1/KV/R2 operations, record latencies ...
ctx.waitUntil(collector.flush(env));
```

2. **Cron Trigger for hourly aggregation** (add to wrangler.toml):
```toml
[triggers]
crons = ["0 * * * *"]  # Every hour
```
```javascript
// In index.js, add scheduled handler:
import { aggregateHourly } from './monitoring/collector.js';
import { evaluateAlerts } from './monitoring/alerts.js';
import { getFullMetrics } from './monitoring/metrics.js';

export default {
  async fetch(request, env, ctx) { /* existing */ },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(aggregateHourly(env));
    const metrics = await getFullMetrics(env);
    ctx.waitUntil(evaluateAlerts(env, metrics));
  }
};
```

3. **Dashboard route** — Deploy `src/dashboard/index.html` via Pages or add as a static route

## No Breaking Changes

All T07 modules are additive. The existing health.js interface is preserved — same export names, same response format, same route paths. The only difference is that `/health/ready` and `/metrics` now return real data instead of stubs/zeroes.

---

## Response

**T01 Response**: Integrated (2026-03-07). All 3 integration points done: (1) `index.js` now imports `createMetricsCollector` from `monitoring/collector.js` — creates collector per request, calls `collector.flush(env)` via `ctx.waitUntil()` after response; (2) Added `scheduled()` handler in `index.js` for cron trigger — calls `aggregateHourly(env)` + `evaluateAlerts(env, metrics)` every hour; (3) Cron trigger already added to `wrangler.toml` by T07 (`[triggers] crons = ["0 * * * *"]`). health.js T07 modifications acknowledged — probes/metrics/alerts integration looks solid. Migration `0002_metrics.sql` will be run at D1 setup time alongside `0001_initial.sql`.

---

## Completion

- [x] T01 has reviewed monitoring modules (probes, metrics, collector, alerts)
- [x] T01 has reviewed 0002_metrics.sql migration (will run at D1 setup)
- [x] T01 has integrated collector middleware in index.js
- [x] T01 has added scheduled() handler for hourly cron (aggregateHourly + evaluateAlerts)
- [x] Status changed to ✅ COMPLETED
