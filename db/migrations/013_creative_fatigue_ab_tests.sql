-- Creative fatigue detection, A/B testing, creative library, and dashboard widgets

CREATE TABLE IF NOT EXISTS creative_performance (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend REAL DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  ctr REAL,
  cpc REAL,
  frequency REAL,
  reach INTEGER DEFAULT 0,
  hook TEXT,
  body TEXT,
  image_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ad_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_creative_perf_ad ON creative_performance(ad_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_creative_perf_campaign ON creative_performance(campaign_id, snapshot_date);

CREATE TABLE IF NOT EXISTS ab_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_id TEXT,
  status TEXT DEFAULT 'draft',
  metric TEXT DEFAULT 'ctr',
  confidence REAL DEFAULT 0.95,
  winner_id TEXT,
  config TEXT DEFAULT '{}',
  started_at TEXT,
  stopped_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ab_test_variants (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  ad_id TEXT,
  creative_id TEXT,
  name TEXT NOT NULL,
  hook TEXT,
  body TEXT,
  variant_index INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend REAL DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_variants_test ON ab_test_variants(test_id);

CREATE TABLE IF NOT EXISTS creative_library (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'copy',
  hook TEXT,
  body TEXT,
  cta TEXT,
  image_url TEXT,
  video_url TEXT,
  tags TEXT DEFAULT '[]',
  platform TEXT,
  performance_score REAL,
  times_used INTEGER DEFAULT 0,
  best_roas REAL,
  best_ctr REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creative_lib_user ON creative_library(user_id, type);
CREATE INDEX IF NOT EXISTS idx_creative_lib_tags ON creative_library(tags);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  widget_type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  position INTEGER DEFAULT 0,
  size TEXT DEFAULT 'medium',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_widgets_user ON dashboard_widgets(user_id);
