-- Migration 038: Scope content_queue to owning user (multi-tenant fix).
ALTER TABLE content_queue ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_content_queue_user ON content_queue(user_id);
