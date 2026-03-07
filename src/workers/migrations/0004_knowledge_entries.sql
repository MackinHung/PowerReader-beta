-- Knowledge Entries D1 Table (metadata mirror for Vectorize)
-- Source: T03 knowledge base management
-- Run: wrangler d1 execute powerreader-db --file=./migrations/0004_knowledge_entries.sql

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- politician | media | topic | term | event
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  party TEXT,                   -- [DPP] | [KMT] | [TPP] | null
  metadata TEXT,                -- JSON: extra fields per type
  vectorize_synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_party ON knowledge_entries(party);
CREATE INDEX IF NOT EXISTS idx_knowledge_synced ON knowledge_entries(vectorize_synced);
