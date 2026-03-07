-- PowerReader D1 Database - Initial Schema
-- Source: T01/KV_SCHEMA.md v2.0 (SSOT)
-- Run: wrangler d1 execute powerreader-db --file=./migrations/0001_initial.sql

-- ============================================
-- Articles Table (primary article index)
-- ============================================
CREATE TABLE IF NOT EXISTS articles (
  article_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  source TEXT NOT NULL,
  primary_url TEXT NOT NULL,
  duplicate_urls TEXT,
  published_at TEXT NOT NULL,
  crawled_at TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  filter_score REAL,
  matched_topic TEXT,
  r2_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'crawled',
  status_updated_at TEXT,
  embedding_status TEXT DEFAULT 'pending',
  knowledge_ids TEXT,
  bias_score INTEGER,
  bias_category TEXT,
  controversy_score INTEGER,
  controversy_level TEXT,
  analysis_count INTEGER DEFAULT 0,
  consensus_reached INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash);

-- ============================================
-- Analyses Table (one per user per article)
-- ============================================
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  bias_score INTEGER NOT NULL,
  bias_category TEXT NOT NULL,
  controversy_score INTEGER NOT NULL,
  controversy_level TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  key_phrases TEXT NOT NULL,
  quality_gate_result TEXT NOT NULL,
  quality_scores TEXT,
  prompt_version TEXT NOT NULL,
  analysis_duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(article_id),
  UNIQUE(article_id, user_hash)
);

CREATE INDEX IF NOT EXISTS idx_analyses_article ON analyses(article_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_hash);

-- ============================================
-- Users Table (anonymized via SHA-256)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  user_hash TEXT PRIMARY KEY,
  total_points_cents INTEGER DEFAULT 0,
  contribution_count INTEGER DEFAULT 0,
  vote_rights INTEGER DEFAULT 0,
  daily_analysis_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  cooldown_until TEXT,
  last_contribution_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- Sessions Table (JWT cross-verification)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- Crawler Runs Table (tracking crawl batches)
-- ============================================
CREATE TABLE IF NOT EXISTS crawler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  total_crawled INTEGER,
  filtered_count INTEGER,
  pushed_count INTEGER,
  failed_count INTEGER,
  duration_seconds REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
