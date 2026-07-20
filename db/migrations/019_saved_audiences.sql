CREATE TABLE IF NOT EXISTS saved_audiences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT DEFAULT 'meta',
  description TEXT,
  targeting_json TEXT DEFAULT '{}',
  size_estimate INTEGER,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_audiences_user ON saved_audiences(user_id);
