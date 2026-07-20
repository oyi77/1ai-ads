CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'IDR',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue', 'cancelled')),
  description TEXT,
  line_items TEXT DEFAULT '[]',
  due_date TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'canceled', 'past_due')),
  current_period_start TEXT,
  current_period_end TEXT,
  provider_subscription_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
