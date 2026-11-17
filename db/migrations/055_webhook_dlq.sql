-- Migration 055: Webhook dead-letter queue (DEF-08, audit 2026-11-17).
--
-- Previously webhook-processor.js marked failed events as processed=1 and
-- discarded them permanently. This migration adds retry_counter, failed_at,
-- and event_id columns, plus a unique index to prevent duplicate webhook
-- ingestion. Failed events are retried with exponential backoff (max 3
-- attempts) before moving to dead-letter status.
--
-- Backfill: existing processed=1 rows keep retry_counter=0, failed_at=NULL
-- (already done, no retry needed). Unprocessed rows start at retry_counter=0.
-- event_id dedups webhooks from Meta and other sources that include delivery IDs.

ALTER TABLE webhook_events ADD COLUMN event_id TEXT;
ALTER TABLE webhook_events ADD COLUMN retry_counter INTEGER DEFAULT 0;
ALTER TABLE webhook_events ADD COLUMN failed_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON webhook_events(processed, retry_counter, failed_at);

-- event_id can be NULL for legacy rows; use COALESCE for dedup key
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedup
  ON webhook_events(source, event_type, COALESCE(event_id, id));
