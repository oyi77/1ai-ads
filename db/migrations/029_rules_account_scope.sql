-- Migration 029: Scope autonomous_rules to an ads account (or global).
-- The table is created lazily by RulesRepository at runtime; ensure it
-- exists before ALTER so fresh databases migrate cleanly.
CREATE TABLE IF NOT EXISTS autonomous_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition TEXT NOT NULL,
  action TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  account_id TEXT
);
ALTER TABLE autonomous_rules ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_user_rules ON autonomous_rules(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_user_rules_account ON autonomous_rules(user_id, account_id);
