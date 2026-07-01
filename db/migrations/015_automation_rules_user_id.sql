-- Migration 015: Add user_id to automation_rules for tenant isolation
-- Required by Meta/Google compliance: automation rules must be scoped per-user

ALTER TABLE automation_rules ADD COLUMN user_id TEXT DEFAULT 'system';
CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
