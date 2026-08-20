-- 027: add missing user_id indexes for multi-tenant query performance
-- ads, landing_pages, campaigns, platform_accounts, saved_audiences, ai_suggestions
-- previously lacked an index on user_id, causing full scans on per-user lookups.
CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_user_id ON landing_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_audiences_user_id ON saved_audiences(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user_id ON ai_suggestions(user_id);
