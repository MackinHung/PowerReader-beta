-- 0014_point_shop.sql
-- Point Shop tables: items catalog + user purchases

CREATE TABLE IF NOT EXISTS point_shop_items (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  description_key TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cosmetic', 'functional')),
  icon TEXT NOT NULL,
  is_consumable INTEGER DEFAULT 0,
  duration_hours INTEGER,
  max_per_user INTEGER,
  display_order INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL,
  item_id TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  purchased_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  is_consumed INTEGER DEFAULT 0,
  consumed_at TEXT,
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  FOREIGN KEY (item_id) REFERENCES point_shop_items(id)
);

CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON user_purchases(user_hash);
CREATE INDEX IF NOT EXISTS idx_user_purchases_active ON user_purchases(user_hash, is_consumed, expires_at);

-- Seed initial items
-- Cosmetic badges (permanent, max 1 per user)
INSERT INTO point_shop_items (id, name_key, description_key, cost_cents, category, icon, is_consumable, duration_hours, max_per_user, display_order) VALUES
  ('badge_civic_analyst', 'shop.item.badge_civic_analyst', 'shop.item.badge_civic_analyst_desc', 500, 'cosmetic', 'verified', 0, NULL, 1, 1),
  ('badge_power_contributor', 'shop.item.badge_power_contributor', 'shop.item.badge_power_contributor_desc', 1500, 'cosmetic', 'military_tech', 0, NULL, 1, 2),
  ('badge_data_pioneer', 'shop.item.badge_data_pioneer', 'shop.item.badge_data_pioneer_desc', 1000, 'cosmetic', 'explore', 0, NULL, 1, 3);

-- Functional items (consumable)
INSERT INTO point_shop_items (id, name_key, description_key, cost_cents, category, icon, is_consumable, duration_hours, max_per_user, display_order) VALUES
  ('quota_boost_10', 'shop.item.quota_boost', 'shop.item.quota_boost_desc', 2000, 'functional', 'add_circle', 1, 24, NULL, 10),
  ('skip_cooldown', 'shop.item.skip_cooldown', 'shop.item.skip_cooldown_desc', 3000, 'functional', 'timer_off', 1, NULL, NULL, 11),
  ('extended_history', 'shop.item.extended_history', 'shop.item.extended_history_desc', 1000, 'functional', 'history', 0, NULL, 1, 12);
