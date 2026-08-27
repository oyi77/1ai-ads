-- Migration 033: Add user_id to schedules for per-user report-schedule isolation
-- Each user must see and manage only their own schedules.

ALTER TABLE schedules ADD COLUMN user_id TEXT DEFAULT 'system';

-- Backfill: existing rows belong to the single-tenant boundary ('system'),
-- which every user can still see until re-owned. Global job runner (findDue)
-- remains unscoped by design.
UPDATE schedules SET user_id = 'system' WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
