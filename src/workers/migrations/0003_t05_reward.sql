-- T05 Reward System - KV to D1 Migration
-- Source: T06 KV Budget Risk Assessment (2026-03-07)
-- Reason: KV write budget exhaustion (1,350 writes/day vs 150 budget)
--         KV is cache-only per KV_SCHEMA.md v2.0
--
-- Run: wrangler d1 execute powerreader-db --file=./migrations/0003_t05_reward.sql

-- ============================================
-- Extend users table for daily reset tracking
-- ============================================
ALTER TABLE users ADD COLUMN daily_analysis_date TEXT;
ALTER TABLE users ADD COLUMN votes_used INTEGER DEFAULT 0;

-- ============================================
-- Reward dedup tracking
-- Replaces KV keys: article:{user}:{id} + analysis:{user}:{hash}
-- ============================================
CREATE TABLE IF NOT EXISTS reward_dedup (
  user_hash TEXT NOT NULL,
  article_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  rewarded_at TEXT NOT NULL,
  PRIMARY KEY (user_hash, article_id),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);

-- Pre-Check D: Content-hash dedup (mirror source attack prevention)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_content_dedup
  ON reward_dedup(user_hash, content_hash);
