-- Aligns the `ads` table with columns the repository/optimizer code already
-- references (campaignsRepo.getAds -> WHERE campaign_id = ?, .stats.roas;
-- RuleEvaluator._optimizeCreative -> platform_id). Without these the queries throw
-- "no such column" and the optimize_creative action crashes.
-- Idempotent: re-running is safe (ALTER ADD COLUMN is ignorable on dup).
ALTER TABLE ads ADD COLUMN campaign_id TEXT;
ALTER TABLE ads ADD COLUMN platform_id TEXT;
ALTER TABLE ads ADD COLUMN adset_id TEXT;
ALTER TABLE ads ADD COLUMN spend REAL DEFAULT 0;
ALTER TABLE ads ADD COLUMN revenue REAL DEFAULT 0;
ALTER TABLE ads ADD COLUMN roas REAL DEFAULT 0;
