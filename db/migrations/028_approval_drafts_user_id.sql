-- Scope approval_drafts to the owning user so the Telegram bot can offer
-- Approve/Reject only to the rule owner (scheduler-created drafts from job #5).
-- Column is nullable: web admin drafts keep working without a user binding.
ALTER TABLE approval_drafts ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_drafts_user ON approval_drafts(user_id);
