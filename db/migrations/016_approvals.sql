-- Add campaign_id to existing approval_drafts for campaign activation approval gating
ALTER TABLE approval_drafts ADD COLUMN campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON approval_drafts(campaign_id);
