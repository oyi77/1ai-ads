CREATE TABLE IF NOT EXISTS ad_sets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  platform TEXT DEFAULT 'meta',
  name TEXT NOT NULL,
  status TEXT DEFAULT 'PAUSED',
  daily_budget REAL DEFAULT 0,
  targeting_json TEXT DEFAULT '{}',
  optimization_goal TEXT,
  billing_event TEXT,
  platform_adset_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign ON ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_platform ON ad_sets(platform);
