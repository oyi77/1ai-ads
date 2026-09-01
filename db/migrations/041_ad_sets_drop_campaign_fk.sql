-- Drop the FK on ad_sets.campaign_id (added by 017_ad_sets.sql).
-- The sync code at campaigns.js:365 stores Meta campaign IDs (e.g.
-- "1203300000000001") in ad_sets.campaign_id, but the FK references
-- campaigns(id) which is a local UUID. FK enforcement is ON, so every
-- adset insert from sync throws "FOREIGN KEY constraint failed", silently
-- swallowed by catch { /* skip individual adset errors */ } at campaigns.js:375.
-- Same bug class as migration 030 (approval_drafts.campaign_id FK dropped).
-- campaign_id remains metadata-only (lookup via platform + platform_adset_id).
CREATE TABLE ad_sets_new (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  user_id TEXT,
  platform TEXT DEFAULT 'meta',
  name TEXT NOT NULL,
  status TEXT DEFAULT 'PAUSED',
  daily_budget REAL DEFAULT 0,
  targeting_json TEXT DEFAULT '{}',
  optimization_goal TEXT,
  billing_event TEXT,
  platform_adset_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO ad_sets_new (
  id, campaign_id, user_id, platform, name, status, daily_budget,
  targeting_json, optimization_goal, billing_event, platform_adset_id,
  created_at, updated_at
)
SELECT
  id, campaign_id, user_id, platform, name, status, daily_budget,
  targeting_json, optimization_goal, billing_event, platform_adset_id,
  created_at, updated_at
FROM ad_sets;
DROP TABLE ad_sets;
ALTER TABLE ad_sets_new RENAME TO ad_sets;
CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign ON ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_platform ON ad_sets(platform);