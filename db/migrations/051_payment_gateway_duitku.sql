-- Kontrak 1ai-payment live: gateway duitku (midtrans = FATAL di production).
-- 031 seed midtrans; UPDATE eksplisit karena INSERT OR IGNORE tidak menimpa.
UPDATE settings SET value = '{"planId":"plan_pro","planName":"Pro","amount":99000,"gateway":"duitku"}', updated_at = datetime('now') WHERE key = 'payment_plan_pro';
UPDATE settings SET value = '{"planId":"plan_enterprise","planName":"Enterprise","amount":499000,"gateway":"duitku"}', updated_at = datetime('now') WHERE key = 'payment_plan_enterprise';
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('payment_plan_pro', '{"planId":"plan_pro","planName":"Pro","amount":99000,"gateway":"duitku"}', datetime('now')),
  ('payment_plan_enterprise', '{"planId":"plan_enterprise","planName":"Enterprise","amount":499000,"gateway":"duitku"}', datetime('now'));
