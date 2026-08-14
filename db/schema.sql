CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'system',
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
  user_id TEXT DEFAULT 'system',
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
  user_id TEXT DEFAULT 'system',
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
   telegram_id TEXT UNIQUE,
   role TEXT DEFAULT 'user',
   plan TEXT DEFAULT 'free',
   confirmed BOOLEAN DEFAULT 0,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 );


CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);

CREATE TABLE IF NOT EXISTS plans (
   id TEXT PRIMARY KEY,
   name TEXT UNIQUE NOT NULL,
   tier INTEGER NOT NULL,
   max_ads INTEGER,
   max_campaigns INTEGER,
   max_platform_accounts INTEGER,
   features TEXT DEFAULT '[]',
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plans_tier ON plans(tier);

-- Insert default plans
INSERT OR IGNORE INTO plans (id, name, tier, max_ads, max_campaigns, max_platform_accounts, features) VALUES
  ('plan_free', 'Free', 1, 5, 2, 1, '["basic_ads", "analytics"]'),
  ('plan_pro', 'Pro', 2, 50, 10, 3, '["basic_ads", "analytics", "ai_generation", "competitor_spy"]'),
  ('plan_enterprise', 'Enterprise', 3, -1, -1, -1, '["basic_ads", "analytics", "ai_generation", "competitor_spy", "auto_optimization", "api_access"]');

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

CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  health_status TEXT DEFAULT 'ok',
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_type TEXT,
  payload TEXT DEFAULT '{}',
  processed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source, created_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'IDR',
  status TEXT DEFAULT 'pending',
  provider TEXT DEFAULT 'scalev',
  provider_ref TEXT,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  platform TEXT,
  ad_data TEXT DEFAULT '{}',
  snapshot_type TEXT DEFAULT 'auto',
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_url ON competitor_snapshots(url, captured_at);

-- Content queue for scheduled video posting (ported from content-generator)
CREATE TABLE IF NOT EXISTS content_queue (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  platform TEXT DEFAULT 'facebook',
  file_path TEXT NOT NULL,
  caption TEXT DEFAULT '',
  hashtags TEXT DEFAULT '[]',
  hook TEXT DEFAULT '',
  cta TEXT DEFAULT '',
  category TEXT DEFAULT '',
  style TEXT DEFAULT '',
  product_desc TEXT DEFAULT '',
  video_id TEXT,
  permalink_url TEXT,
  status TEXT DEFAULT 'pending',
  scheduled_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  posted_at INTEGER,
  updated_at INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_page ON content_queue(page_id, scheduled_at);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'system',
  category TEXT NOT NULL DEFAULT 'general',
  name TEXT NOT NULL,
  description TEXT,
  hook_template TEXT,
  body_template TEXT,
  cta_template TEXT,
  design_config TEXT DEFAULT '{}',
  thumbnail_url TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_industry ON templates(industry);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_ads_campaign ON ads(platform, status);

CREATE INDEX IF NOT EXISTS idx_ads_platform ON ads(platform);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_automation_rules_campaign ON automation_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_perf_history_campaign ON performance_history(campaign_id, snapshot_date);

CREATE TABLE IF NOT EXISTS ad_utm_map (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  utm_source TEXT DEFAULT 'meta',
  utm_medium TEXT DEFAULT 'paid',
  utm_campaign TEXT,
  utm_content TEXT,
  click_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ad_utm_map_ad_id ON ad_utm_map(ad_id);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS ads_updated_at AFTER UPDATE ON ads
BEGIN UPDATE ads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);

CREATE TRIGGER IF NOT EXISTS landing_pages_updated_at AFTER UPDATE ON landing_pages
BEGIN UPDATE landing_pages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS payments_updated_at AFTER UPDATE ON payments
BEGIN UPDATE payments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- Attribution table for Shopee order matching
CREATE TABLE IF NOT EXISTS attributions (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  shopee_order_id TEXT NOT NULL,
  shopee_revenue REAL DEFAULT 0,
  ad_spend REAL DEFAULT 0,
  match_method TEXT DEFAULT 'taglink',
  matched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(shopee_order_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_attributions_campaign ON attributions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_attributions_ad ON attributions(ad_id);
CREATE INDEX IF NOT EXISTS idx_attributions_matched_at ON attributions(matched_at);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule_time TEXT NOT NULL,
  platform TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_platform ON schedules(platform);
CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(schedule_time);

CREATE TRIGGER IF NOT EXISTS schedules_updated_at AFTER UPDATE ON schedules
BEGIN UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TABLE IF NOT EXISTS ai_suggestions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 type TEXT NOT NULL,
 target_id TEXT,
 target_type TEXT,
 suggestion TEXT NOT NULL,
 rationale TEXT,
 status TEXT DEFAULT 'pending',
 created_at TEXT DEFAULT (datetime('now')),
 applied_at TEXT,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit log for tracking all mutations
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
