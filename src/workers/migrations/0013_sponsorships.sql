-- 0013_sponsorships.sql
-- ECPay sponsorship records for PowerReader Power Pool
-- Tracks donations with allocation breakdown per sponsor type

CREATE TABLE sponsorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_trade_no TEXT NOT NULL UNIQUE,   -- ECPay order number (unique)
  user_hash TEXT,                           -- Sponsor identity (NULL = anonymous)
  amount INTEGER NOT NULL,                  -- Amount in TWD
  sponsor_type TEXT NOT NULL,               -- coffee|civic|compute|proxy
  -- Allocation breakdown (pre-computed by ratio)
  alloc_developer INTEGER NOT NULL DEFAULT 0,
  alloc_platform INTEGER NOT NULL DEFAULT 0,
  alloc_compute INTEGER NOT NULL DEFAULT 0,
  -- ECPay callback fields
  ecpay_trade_no TEXT,                      -- ECPay transaction number
  payment_type TEXT,                        -- e.g. Credit_CreditCard
  payment_date TEXT,                        -- Payment timestamp from ECPay
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE INDEX idx_sponsorships_status ON sponsorships(status);
CREATE INDEX idx_sponsorships_user ON sponsorships(user_hash);
