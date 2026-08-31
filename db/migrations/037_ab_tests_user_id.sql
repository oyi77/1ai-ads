-- Migration 037: Scope ab_tests to owning user (multi-tenant fix).
ALTER TABLE ab_tests ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ab_tests_user ON ab_tests(user_id);