-- Migration 046: Per-tenant WhatsApp conversations.
--
-- wa_conversations had no owner: every tenant behind one deployment shared a
-- single global pool (reads, webhooks, follow-ups). This adds user_id plus an
-- admin-managed WABA-number → owner map used at ingress. Inbound webhooks
-- carry only the business phone_number_id, so attribution resolves through
-- wa_number_owners; unmapped numbers store NULL (invisible to every tenant)
-- rather than being assigned to a stranger.
--
-- Runs after 020 (table order guaranteed); zero live rows to backfill.

ALTER TABLE wa_conversations ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_user ON wa_conversations(user_id);

CREATE TABLE IF NOT EXISTS wa_number_owners (
  wa_phone_number_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
