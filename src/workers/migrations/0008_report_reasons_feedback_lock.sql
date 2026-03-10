-- Migration 0008: Update report reasons + feedback locking
-- Report reasons: analysis_inaccurate, analysis_abnormal, cannot_analyze, data_abnormal, other
-- Feedback: one-time only (no retraction), enforced by app logic + UNIQUE constraint

-- Recreate reports table with updated CHECK constraint
CREATE TABLE IF NOT EXISTS reports_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('article', 'analysis')),
  target_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('analysis_inaccurate', 'analysis_abnormal', 'cannot_analyze', 'data_abnormal', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, reporter_hash)
);

-- Copy existing data (map old reasons to new)
INSERT OR IGNORE INTO reports_new (id, target_type, target_id, reporter_hash, reason, description, status, created_at, updated_at)
SELECT id, target_type, target_id, reporter_hash,
  CASE reason
    WHEN 'inaccurate' THEN 'analysis_inaccurate'
    WHEN 'biased' THEN 'data_abnormal'
    WHEN 'spam' THEN 'analysis_abnormal'
    WHEN 'offensive' THEN 'analysis_abnormal'
    ELSE 'other'
  END,
  description, status, created_at, updated_at
FROM reports;

DROP TABLE IF EXISTS reports;
ALTER TABLE reports_new RENAME TO reports;

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
