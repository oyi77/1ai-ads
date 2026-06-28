-- Multi-tenant: add user_id to core user-facing tables
-- Existing rows get 'system' user_id (shared demo data)

ALTER TABLE campaigns ADD COLUMN user_id TEXT DEFAULT 'system';
ALTER TABLE ads ADD COLUMN user_id TEXT DEFAULT 'system';
ALTER TABLE templates ADD COLUMN user_id TEXT DEFAULT 'system';
ALTER TABLE landing_pages ADD COLUMN user_id TEXT DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_user ON landing_pages(user_id);
