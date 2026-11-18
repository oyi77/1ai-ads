-- Phase 3d — Campaign state reconciliation cron.
-- Nightly re-sync of campaign status/budget/spend from platform source of truth.
-- Prevents drift (external pause/resume, budget changes, status flips).
--
-- Adds a reconciliation_log table for audit trail.
CREATE TABLE IF NOT EXISTS campaign_reconciliation_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  local_status TEXT,
  remote_status TEXT,
  local_budget REAL,
  remote_budget REAL,
  drift_detected INTEGER DEFAULT 0,
  drift_details TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  success INTEGER DEFAULT 1,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_recon_campaign_time
  ON campaign_reconciliation_log(campaign_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_recon_user_time
  ON campaign_reconciliation_log(user_id, synced_at);