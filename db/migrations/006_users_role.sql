-- 006: Add role column to users
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
