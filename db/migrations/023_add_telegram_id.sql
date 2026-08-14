-- 023: Add telegram_id for multi-tenant Telegram customer binding
ALTER TABLE users ADD COLUMN telegram_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
