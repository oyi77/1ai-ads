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
