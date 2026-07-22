CREATE TABLE IF NOT EXISTS wa_conversations (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  wa_account_id TEXT,
  wa_phone_number_id TEXT,
  contact_name TEXT,
  messages TEXT DEFAULT '[]',
  intent_score REAL,
  intent_label TEXT,
  intent_reasoning TEXT,
  product TEXT,
  estimated_value REAL,
  currency TEXT DEFAULT 'IDR',
  capi_event_sent INTEGER DEFAULT 0,
  capi_event_type TEXT,
  capi_event_id TEXT,
  capi_sent_at TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_phone ON wa_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_status ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_capi_sent ON wa_conversations(capi_event_sent);
