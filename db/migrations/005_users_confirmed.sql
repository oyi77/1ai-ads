-- 005: Add confirmed column to users
ALTER TABLE users ADD COLUMN confirmed BOOLEAN DEFAULT 0;
-- Backfill admin as confirmed
UPDATE users SET confirmed = 1 WHERE username = 'admin' AND confirmed = 0;
