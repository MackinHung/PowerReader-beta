-- Migration 0006: Add camp_ratio column to analyses and articles
-- camp_ratio stores JSON string: {"green":N,"white":N,"blue":N,"gray":N} where sum ≈ 100

ALTER TABLE analyses ADD COLUMN camp_ratio TEXT;
ALTER TABLE articles ADD COLUMN camp_ratio TEXT;
