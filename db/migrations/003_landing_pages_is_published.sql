-- 003: Add is_published column to landing_pages
ALTER TABLE landing_pages ADD COLUMN is_published BOOLEAN DEFAULT 0;
