-- Migration 039: Scope competitor_snapshots to owning user (multi-tenant fix).
ALTER TABLE competitor_snapshots ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_user ON competitor_snapshots(user_id);
