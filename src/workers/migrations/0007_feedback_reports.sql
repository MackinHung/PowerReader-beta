-- Migration 0007: Feedback + Reports system
-- Supports: A6/A7 (article feedback), B1 (analysis feedback), B7 (reports)

-- Article feedback (like/dislike per user per article)
CREATE TABLE IF NOT EXISTS article_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('like', 'dislike')),
  created_at TEXT NOT NULL,
  UNIQUE(article_id, user_hash)
);
CREATE INDEX IF NOT EXISTS idx_article_feedback_article ON article_feedback(article_id);

-- Analysis feedback (like/dislike per user per analysis)
CREATE TABLE IF NOT EXISTS analysis_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,
  user_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('like', 'dislike')),
  created_at TEXT NOT NULL,
  UNIQUE(analysis_id, user_hash)
);
CREATE INDEX IF NOT EXISTS idx_analysis_feedback_analysis ON analysis_feedback(analysis_id);

-- Reports (flag articles or analyses for review)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('article', 'analysis')),
  target_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('inaccurate', 'biased', 'spam', 'offensive', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, reporter_hash)
);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
