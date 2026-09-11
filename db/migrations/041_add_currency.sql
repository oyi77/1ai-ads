-- Add currency column to campaigns table for proper budget unit handling
-- IDR and other zero-decimal currencies need special budget conversion

ALTER TABLE campaigns ADD COLUMN currency TEXT DEFAULT 'IDR';

-- Add currency column to ad_sets for consistent budget handling
ALTER TABLE ad_sets ADD COLUMN currency TEXT DEFAULT 'IDR';