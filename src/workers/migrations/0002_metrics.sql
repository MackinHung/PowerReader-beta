-- PowerReader D1 Database - Monitoring Schema (T07)
-- Source: T07/MONITORING_DASHBOARD.md v1.1
-- Run: wrangler d1 execute powerreader-db --file=./migrations/0002_metrics.sql

-- ============================================================================
-- 1. metrics_hourly — Aggregated metrics per hour
--    Stores pre-computed hourly rollups for dashboard queries.
--    Ref: T07/MONITORING_DASHBOARD.md §2.1 "Hourly Aggregation"
-- ============================================================================
CREATE TABLE IF NOT EXISTS metrics_hourly (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,           -- e.g. 'kv_read_latency_ms', 'd1_query_latency_ms',
                                         --      'cdn_cache_hit', 'response_time_ms',
                                         --      'vectorize_query_latency_ms', 'workers_ai_latency_ms'
    hour        TEXT NOT NULL,           -- ISO 8601 truncated to hour e.g. '2026-03-07T14:00:00'
    count       INTEGER DEFAULT 0,
    sum_value   REAL DEFAULT 0,
    min_value   REAL,
    max_value   REAL,
    avg_value   REAL,                    -- computed: sum_value / count
    p95_value   REAL,                    -- stored during aggregation from metrics_raw
    created_at  TEXT DEFAULT (datetime('now')),

    UNIQUE (metric_name, hour)
);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_name_hour
    ON metrics_hourly (metric_name, hour);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_hour
    ON metrics_hourly (hour);            -- for cleanup of old aggregated rows

-- ============================================================================
-- 2. metrics_raw — Raw per-request metric samples
--    Kept temporarily for P95 computation; cleaned up after aggregation.
--    Ref: T07/MONITORING_DASHBOARD.md §2.2 "Raw Sample Buffer"
-- ============================================================================
CREATE TABLE IF NOT EXISTS metrics_raw (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    value       REAL NOT NULL,
    recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_raw_name_recorded
    ON metrics_raw (metric_name, recorded_at);

-- ============================================================================
-- 3. alerts — Alert history
--    Tracks triggered alerts with severity, suppression, and resolution.
--    Ref: T07/MONITORING_DASHBOARD.md §3 "Alerting Pipeline"
-- ============================================================================
CREATE TABLE IF NOT EXISTS alerts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_name       TEXT NOT NULL,      -- e.g. 'kv_latency_high', 'cdn_hit_rate_low'
    severity         TEXT NOT NULL,      -- 'P0', 'P1', 'P2', 'P3'
    message          TEXT NOT NULL,
    metric_value     REAL,              -- the value that triggered the alert
    threshold_value  REAL,              -- the threshold that was exceeded
    status           TEXT DEFAULT 'active',  -- 'active', 'resolved', 'suppressed'
    triggered_at     TEXT DEFAULT (datetime('now')),
    resolved_at      TEXT,
    suppressed_until TEXT               -- for 1h suppression window
);

CREATE INDEX IF NOT EXISTS idx_alerts_name_status
    ON alerts (alert_name, status);

CREATE INDEX IF NOT EXISTS idx_alerts_triggered
    ON alerts (triggered_at);

-- ============================================================================
-- 4. daily_counters — Daily resource usage counters
--    Tracks Cloudflare Free Tier consumption against daily limits.
--    Ref: T07/MONITORING_DASHBOARD.md §4 "Resource Usage Tracking"
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_counters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,          -- 'YYYY-MM-DD'
    counter_name TEXT NOT NULL,          -- 'workers_requests', 'd1_reads',
                                         -- 'vectorize_query_dims', 'workers_ai_neurons',
                                         -- 'kv_writes', 'active_users',
                                         -- 'crawler_success', 'crawler_failure',
                                         -- 'analysis_passed', 'analysis_failed'
    value        INTEGER DEFAULT 0,

    UNIQUE (date, counter_name)
);

CREATE INDEX IF NOT EXISTS idx_daily_counters_date
    ON daily_counters (date);
