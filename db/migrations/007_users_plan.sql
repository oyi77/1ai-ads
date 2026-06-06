-- 007: Add plan column to users
ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
