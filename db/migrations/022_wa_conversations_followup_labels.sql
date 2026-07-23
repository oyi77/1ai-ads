-- Add auto follow-up tracking columns
ALTER TABLE wa_conversations ADD COLUMN labels TEXT DEFAULT '[]';
ALTER TABLE wa_conversations ADD COLUMN follow_up_count INTEGER DEFAULT 0;
ALTER TABLE wa_conversations ADD COLUMN last_follow_up_at TEXT;
ALTER TABLE wa_conversations ADD COLUMN last_follow_up_message TEXT;

-- Index for follow-up queries (active conversations that haven't had recent follow-up)
CREATE INDEX IF NOT EXISTS idx_wa_conversations_followup ON wa_conversations(follow_up_count, last_follow_up_at);
