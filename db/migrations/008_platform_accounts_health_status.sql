-- 008: Add health_status column to platform_accounts
ALTER TABLE platform_accounts ADD COLUMN health_status TEXT DEFAULT 'ok';
