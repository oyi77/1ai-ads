-- Migration 047: Attribute history tables to the owning user (multi-tenant fix).
--
-- performance_history and creative_performance had no owner column, so every
-- per-user report aggregate (dashboard, time-series, budget allocation) and
-- every fatigue read was computed GLOBAL across tenants.
--
-- performance_history.campaign_id references campaigns.id (internal UUID), so
-- legacy rows backfill from the campaigns table. Orphaned rows (demo data
-- whose campaigns no longer exist) fall back to 'system', matching the
-- campaigns convention — invisible to tenant-scoped reads.
--
-- creative_performance.campaign_id holds act_<id> Meta ACCOUNT ids (not
-- campaigns.id) and platform credentials are encrypted at rest, so no
-- reliable join exists. Legacy rows keep user_id NULL (hidden from scoped
-- reads); new snapshots store the sweep owner. 15 legacy rows on the live
-- DB go dark — documented, accepted (unattributable by construction).
ALTER TABLE performance_history ADD COLUMN user_id TEXT;
UPDATE performance_history SET user_id = COALESCE(
  (SELECT user_id FROM campaigns WHERE campaigns.id = performance_history.campaign_id),
  'system')
  WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_perf_history_user ON performance_history(user_id, snapshot_date);

ALTER TABLE creative_performance ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_creative_perf_user ON creative_performance(user_id, snapshot_date);
