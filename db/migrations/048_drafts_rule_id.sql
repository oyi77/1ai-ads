-- Link approval_drafts to the automation rule that produced them, so the bot
-- can show per-rule history ("terakhir match: ...") and performance reports.
-- Nullable: AI-optimizer drafts and legacy rows have no rule.
ALTER TABLE approval_drafts ADD COLUMN rule_id TEXT;
CREATE INDEX IF NOT EXISTS idx_drafts_rule ON approval_drafts(rule_id);
CREATE INDEX IF NOT EXISTS idx_drafts_rule_status ON approval_drafts(rule_id, status);
