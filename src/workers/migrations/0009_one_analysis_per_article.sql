-- Migration 0009: Global one-analysis-per-article constraint
-- Rule: Once ANY user analyzes an article, NO ONE can analyze it again.
-- Replaces UNIQUE(article_id, user_hash) with UNIQUE(article_id).
-- Race condition: concurrent inserts caught by DB-level UNIQUE constraint.

-- Step 1: Recreate analyses table with UNIQUE(article_id) instead of UNIQUE(article_id, user_hash)
CREATE TABLE IF NOT EXISTS analyses_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  bias_score INTEGER,
  bias_category TEXT,
  controversy_score INTEGER,
  controversy_level TEXT,
  reasoning TEXT,
  key_phrases TEXT,
  quality_gate_result TEXT DEFAULT 'pending',
  quality_scores TEXT,
  prompt_version TEXT,
  camp_ratio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(article_id)
);

-- Copy existing data. If duplicates exist for same article_id, keep the earliest.
INSERT OR IGNORE INTO analyses_new (
  id, article_id, user_hash, bias_score, bias_category,
  controversy_score, controversy_level, reasoning, key_phrases,
  quality_gate_result, quality_scores, prompt_version, camp_ratio, created_at
)
SELECT id, article_id, user_hash, bias_score, bias_category,
  controversy_score, controversy_level, reasoning, key_phrases,
  quality_gate_result, quality_scores, prompt_version, camp_ratio, created_at
FROM analyses
ORDER BY created_at ASC;

DROP TABLE IF EXISTS analyses;
ALTER TABLE analyses_new RENAME TO analyses;

CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_hash);
CREATE INDEX IF NOT EXISTS idx_analyses_quality ON analyses(quality_gate_result);
