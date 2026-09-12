-- Migration 044: Scope boost recommendations and targeting suggestions to the
-- owning user (multi-tenant fix).
--
-- Both tables were global: `/api/boost/recommend` recorded a page/post pair with
-- no owner and `/api/boost/targeting` listed every row, so any signed-in user
-- could read — and approve/reject — another tenant's boost recommendations and
-- audience suggestions.
--
-- These tables are created lazily by their repositories at runtime and are not
-- in schema.sql, so on a fresh database the ALTERs below would fail with
-- "no such table" and abort the boot. So create them first (same shape the
-- repositories use, minus user_id, following migration 029). Deliberately NOT
-- including user_id here: that would make each ALTER raise "duplicate column
-- name", and the runner rolls the whole file back on an ignorable error while
-- still marking it applied — leaving a fresh database with no tables at all.
CREATE TABLE IF NOT EXISTS boost_recommendations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id                 TEXT NOT NULL,
  page_id                 TEXT NOT NULL,
  boost_score             REAL NOT NULL,
  suggested_budget_idr    TEXT,
  suggested_duration_days INTEGER DEFAULT 3,
  target_audience_json    TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  reviewed_by             TEXT,
  reviewed_at             TEXT,
  ad_campaign_id          TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS targeting_suggestions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id           TEXT NOT NULL,
  page_id           TEXT NOT NULL,
  category          TEXT,
  age_min           INTEGER NOT NULL DEFAULT 18,
  age_max           INTEGER NOT NULL DEFAULT 45,
  genders           TEXT NOT NULL DEFAULT 'ALL',
  interests_json    TEXT NOT NULL DEFAULT '[]',
  locations_json    TEXT NOT NULL DEFAULT '["Indonesia"]',
  lookalike_source  TEXT,
  confidence_score  REAL NOT NULL DEFAULT 0.0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, page_id)
);

ALTER TABLE boost_recommendations ADD COLUMN user_id TEXT;
ALTER TABLE targeting_suggestions ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_boost_recommendations_user ON boost_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_targeting_suggestions_user ON targeting_suggestions(user_id);
