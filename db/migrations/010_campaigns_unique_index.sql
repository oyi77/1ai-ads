-- 010: Add unique index on campaigns(platform, campaign_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_platform_external_id ON campaigns(platform, campaign_id);
