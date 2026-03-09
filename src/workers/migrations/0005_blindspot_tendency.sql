-- Blindspot Events + Source Tendency D1 Tables (v2.0 Features)
-- Source: T01_SYSTEM_ARCHITECTURE/API_ROUTES.md v3.0 (SSOT)
-- Run: wrangler d1 execute powerreader-db --file=./src/workers/migrations/0005_blindspot_tendency.sql

-- ============================================
-- Blindspot Events Table (cron-populated)
-- ============================================
-- Each row = one event cluster that has blindspot detection result.
-- Cron scans clusters hourly, writes detected blindspots here.
CREATE TABLE IF NOT EXISTS blindspot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id TEXT NOT NULL,
  representative_title TEXT NOT NULL,
  blindspot_type TEXT NOT NULL,
  camp_distribution TEXT NOT NULL,
  missing_camp TEXT,
  article_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  detected_at TEXT DEFAULT (datetime('now')),
  UNIQUE(cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_blindspot_type ON blindspot_events(blindspot_type);
CREATE INDEX IF NOT EXISTS idx_blindspot_detected ON blindspot_events(detected_at);

-- ============================================
-- Source Tendency Table (cron-populated)
-- ============================================
-- Each row = one media source's rolling 30-day tendency.
-- Cron recalculates daily from articles.bias_score.
CREATE TABLE IF NOT EXISTS source_tendency (
  source TEXT PRIMARY KEY,
  avg_bias_score REAL NOT NULL,
  camp TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',
  window_days INTEGER NOT NULL DEFAULT 30,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tendency_camp ON source_tendency(camp);
