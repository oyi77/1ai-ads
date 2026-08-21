-- Per-user Meta App-level credentials (App Creds: SystemToken, App Secret, App Id, Threads Id, Threads Secret)
-- Distinct from platform_accounts (per ad-account) and global env.
-- Secrets stored AES-256-GCM (encryptToken). One active row per user.
CREATE TABLE IF NOT EXISTS user_meta_apps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  app_secret TEXT NOT NULL,          -- encrypted
  system_token TEXT NOT NULL,        -- encrypted
  threads_id TEXT,
  threads_secret TEXT,               -- encrypted (nullable)
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_meta_apps_user ON user_meta_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_meta_apps_user_active ON user_meta_apps(user_id, is_active);
