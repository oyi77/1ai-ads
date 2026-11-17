-- Migration 054: First-party ad-click tracking (DEF-07, audit 2026-11-17).
--
-- Previously the attribution service fabricated `clicked_at` from
-- `ads.created_at` (when the ad was BORN, not when someone clicked), making
-- every product_time match meaningless. This table records actual click
-- events as we observe them; attribution backfill is not possible — matching
-- is forward-only from the migration date onward.
CREATE TABLE IF NOT EXISTS ad_clicks (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  campaign_id TEXT,
  product_id TEXT,
  user_id TEXT,
  clicked_at DATETIME NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  referer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_product_time
  ON ad_clicks(product_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_campaign
  ON ad_clicks(campaign_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_user
  ON ad_clicks(user_id, clicked_at);
