-- Phase 3 — Idempotency keys for mutating API routes.
-- Prevents duplicate campaign/ad creation on retry (network timeout, bot
-- restart, double-click). The middleware reads an Idempotency-Key header,
-- stores sha256(key + userId + body) with the first response, and replays that
-- response for any repeat inside the 24h window.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  status_code INTEGER,
  result_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Same key reused by the same user is one logical request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_idem_key_user
  ON idempotency_keys(key, user_id);
CREATE INDEX IF NOT EXISTS idx_idem_expires
  ON idempotency_keys(expires_at);
