-- 009: Add last_error column to platform_accounts
ALTER TABLE platform_accounts ADD COLUMN last_error TEXT;
