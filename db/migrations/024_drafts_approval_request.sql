-- Link approval_drafts rows to a system-generated approval request id and track notify state.
-- Allows autonomous agents (auto-optimizer, ai-agent) to create a draft and surface it
-- for human review instead of mutating live campaigns/ads directly.
ALTER TABLE approval_drafts ADD COLUMN approval_request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_drafts_request ON approval_drafts(approval_request_id);
