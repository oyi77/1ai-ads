-- Recreate idx_ad_sets_user on databases where 041_ad_sets_drop_campaign_fk.sql
-- already ran. 041's table rebuild (DROP TABLE ad_sets) destroyed the
-- idx_ad_sets_user index that migration 036 created; the first deployed
-- version of 041 did not re-create it. This is idempotent — on fresh DBs
-- (where 041 now re-creates the index) this is a no-op.
CREATE INDEX IF NOT EXISTS idx_ad_sets_user ON ad_sets(user_id);