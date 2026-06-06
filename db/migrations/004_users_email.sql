-- 004: Add email column to users
ALTER TABLE users ADD COLUMN email TEXT;
-- Backfill null emails
UPDATE users SET email = username || '@1ai-ads.local' WHERE email IS NULL OR email = '';
