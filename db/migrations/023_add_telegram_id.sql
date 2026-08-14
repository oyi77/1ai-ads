-- 023: Add telegram_id for multi-tenant Telegram customer binding.
-- SQLite cannot add a column-level UNIQUE constraint to a NON-EMPTY table
-- ("Cannot add a UNIQUE column"), so we add the column without the constraint
-- and enforce uniqueness via a UNIQUE INDEX (which still permits multiple NULL
-- rows for users that have not linked a Telegram account yet).
ALTER TABLE users ADD COLUMN telegram_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
