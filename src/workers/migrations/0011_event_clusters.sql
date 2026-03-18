-- Migration 0011: Event Clusters (pre-computed for frontend visualization)
-- Stores cluster aggregation data for the homepage cluster card view.

CREATE TABLE IF NOT EXISTS event_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id TEXT NOT NULL UNIQUE,
  representative_title TEXT NOT NULL,
  article_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  camp_distribution TEXT NOT NULL,         -- JSON {"green":N,"white":N,"blue":N}
  sources_json TEXT NOT NULL,              -- JSON [{"source":"自由時報","camp":"green","count":2}]
  article_ids TEXT NOT NULL,               -- JSON ["id1","id2"]
  avg_controversy_score REAL,
  max_controversy_level TEXT,
  category TEXT,
  is_blindspot INTEGER NOT NULL DEFAULT 0,
  blindspot_type TEXT,
  missing_camp TEXT,
  earliest_published_at TEXT NOT NULL,
  latest_published_at TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ec_latest ON event_clusters(latest_published_at);
CREATE INDEX IF NOT EXISTS idx_ec_category ON event_clusters(category);
