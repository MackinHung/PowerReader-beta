-- 0010: Frontend alignment — add missing columns
--
-- Fix 1: users.display_name — store Google OAuth display name for profile page
-- Fix 2: analyses.narrative_points — store narrative points from frontend submission
-- Fix 3: analyses.inference_mode — store inference mode (gpu/cpu/unknown)

ALTER TABLE users ADD COLUMN display_name TEXT;

ALTER TABLE analyses ADD COLUMN narrative_points TEXT;

ALTER TABLE analyses ADD COLUMN inference_mode TEXT;
