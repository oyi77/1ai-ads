-- Migration 036: Scope ad_sets to owning user (multi-tenant fix).
-- Backfill from owning campaign; new ad_sets get user_id from the route layer.
ALTER TABLE ad_sets ADD COLUMN user_id TEXT;
UPDATE ad_sets SET user_id = (SELECT user_id FROM campaigns WHERE campaigns.id = ad_sets.campaign_id)
  WHERE ad_sets.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ad_sets_user ON ad_sets(user_id);
