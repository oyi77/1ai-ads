CREATE TABLE IF NOT EXISTS approval_drafts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  proposed_by TEXT DEFAULT 'ai',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  rejection_reason TEXT,
  execution_result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON approval_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_created ON approval_drafts(created_at);
