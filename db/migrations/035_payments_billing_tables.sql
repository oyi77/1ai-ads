-- Migration 035: Customer self-serve billing + payments tables
-- api_keys (self-serve access), team_members (multi-user), usage_meters (per-tenant limits), milestones (first-value tracker)
-- Idempotent: matches db/schema.sql definitions.

-- API Keys for customer self-serve access
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT DEFAULT '[]',
  rate_limit_tier TEXT DEFAULT 'standard',
  last_used_at DATETIME,
  expires_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Team members for multi-user accounts
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_owner_id TEXT NOT NULL,  -- the account owner (billable user)
  user_id TEXT NOT NULL,         -- the invited user (can be same as owner initially)
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- owner, admin, viewer
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, active, revoked
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(team_owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

-- Usage meters for per-tenant billing/limits
CREATE TABLE IF NOT EXISTS usage_meters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  meter_key TEXT NOT NULL,  -- api_calls, campaigns, rules, webhook_events
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_meters_user ON usage_meters(user_id);

-- First-value milestone tracker
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  milestone_key TEXT NOT NULL,  -- first_sync, first_report, first_rule, first_campaign
  achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_milestones_user ON milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_key ON milestones(milestone_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_user_key ON milestones(user_id, milestone_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_meters_unique ON usage_meters(user_id, meter_key, period_start, period_end);
