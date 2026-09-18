-- Visibilitas kegagalan eksekusi + anti-spam reminder draft pending.
-- last_error: sebab gagal terakhir (draft tetap pending/retryable).
-- reminded_at: penanda reminder terkirim (cron ingatkan max 1x/jam per draft).
ALTER TABLE approval_drafts ADD COLUMN last_error TEXT;
ALTER TABLE approval_drafts ADD COLUMN reminded_at TEXT;
CREATE INDEX IF NOT EXISTS idx_drafts_stale ON approval_drafts(status, reminded_at);
