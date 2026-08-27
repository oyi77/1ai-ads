-- Migration 034: Add last_sync to platform_accounts
-- Tracks when the platform account was last synced successfully

ALTER TABLE platform_accounts ADD COLUMN last_sync DATETIME;

-- Backfill: null for existing rows
UPDATE platform_accounts SET last_sync = null WHERE last_sync IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_accounts_last_sync ON platform_accounts(last_sync);