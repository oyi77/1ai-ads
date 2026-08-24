-- Drop the FK on approval_drafts.campaign_id (added by 016_approvals.sql).
-- Drafts now reference LIVE platform campaigns (Telegram bot per-account AI
-- Optimize passes real Meta campaign ids that may not exist in the local
-- `campaigns` table), so enforcing an FK against local rows breaks draft
-- creation with "FOREIGN KEY constraint failed". The authoritative campaign
-- payload lives in details_json; campaign_id is metadata only.
CREATE TABLE approval_drafts_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  user_id TEXT,
  proposed_by TEXT DEFAULT 'ai',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  rejection_reason TEXT,
  execution_result TEXT,
  campaign_id TEXT,
  approval_request_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO approval_drafts_new (
  id, type, summary, details_json, user_id, proposed_by, status,
  reviewed_at, reviewed_by, rejection_reason, execution_result,
  campaign_id, approval_request_id, created_at, updated_at
)
SELECT
  id, type, summary, details_json, user_id, proposed_by, status,
  reviewed_at, reviewed_by, rejection_reason, execution_result,
  campaign_id, approval_request_id, created_at, updated_at
FROM approval_drafts;
DROP TABLE approval_drafts;
ALTER TABLE approval_drafts_new RENAME TO approval_drafts;
CREATE INDEX IF NOT EXISTS idx_drafts_status ON approval_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_created ON approval_drafts(created_at);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON approval_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON approval_drafts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drafts_request ON approval_drafts(approval_request_id);
