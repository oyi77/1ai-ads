-- Migration 015: Add user_id to automation_rules for tenant isolation
-- Required by Meta/Google compliance: automation rules must be scoped per-user

ALTER TABLE automation_rules ADD COLUMN user_id TEXT;

-- Backfill: assign existing rules to the admin user
-- (admin is the only user with seeded automation data)
UPDATE automation_rules SET user_id = (
  SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
) WHERE user_id IS NULL;

-- Now set default for future rows
-- SQLite doesn't support ALTER COLUMN, so we rely on application-level default

CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
