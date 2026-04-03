CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product TEXT,
  target TEXT,
  keunggulan TEXT,
  platform TEXT DEFAULT 'meta',
  format TEXT DEFAULT 'single_image',
  content_model TEXT,
  hook TEXT,
  body TEXT,
  cta TEXT,
  design_json TEXT,
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  theme TEXT DEFAULT 'dark',
  product_name TEXT,
  price TEXT,
  pain_points TEXT DEFAULT '[]',
  benefits TEXT DEFAULT '[]',
  cta_primary TEXT,
  cta_secondary TEXT,
  wa_link TEXT,
  checkout_link TEXT,
  html_output TEXT,
  slug TEXT,
  is_published BOOLEAN DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  budget REAL,
  spend REAL,
  revenue REAL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  roas REAL,
  last_synced DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
   id TEXT PRIMARY KEY,
   username TEXT UNIQUE NOT NULL,
   email TEXT UNIQUE NOT NULL,
   password_hash TEXT NOT NULL,
   confirmed BOOLEAN DEFAULT 0,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 );

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  condition_metric TEXT NOT NULL,
  condition_operator TEXT NOT NULL,
  condition_value REAL NOT NULL,
  action TEXT NOT NULL,
  action_value REAL,
  check_interval TEXT DEFAULT 'daily',
  last_triggered DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_history (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  platform TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend REAL DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  ctr REAL,
  cpc REAL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ads_platform ON ads(platform);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_automation_rules_campaign ON automation_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_perf_history_campaign ON performance_history(campaign_id, snapshot_date);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS ads_updated_at AFTER UPDATE ON ads
BEGIN UPDATE ads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS landing_pages_updated_at AFTER UPDATE ON landing_pages
BEGIN UPDATE landing_pages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
