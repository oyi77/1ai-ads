-- Add-on entitlements: base manage-ads (plan=enterprise) tetap, fitur LP dan
-- Content + Social Bridge dijual terpisah sebagai add-on lifetime.
-- Grant via admin (manual) atau pay:addon:*; tanpa baris aktif = 403.
CREATE TABLE IF NOT EXISTS user_addons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  addon_key TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by TEXT DEFAULT NULL,
  UNIQUE(user_id, addon_key)
);
CREATE INDEX IF NOT EXISTS idx_user_addons_user ON user_addons(user_id);
