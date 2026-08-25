-- Email verification + password reset tokens, and self-serve plan pricing.
ALTER TABLE users ADD COLUMN email_verification_hash TEXT;
ALTER TABLE users ADD COLUMN email_verification_expires TEXT;
ALTER TABLE users ADD COLUMN password_reset_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires TEXT;

-- Self-serve checkout pricing (consumed by PaymentService._validatePaymentContext).
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('payment_plan_pro', '{"planId":"plan_pro","planName":"Pro","amount":99000,"gateway":"midtrans"}', datetime('now')),
  ('payment_plan_enterprise', '{"planId":"plan_enterprise","planName":"Enterprise","amount":499000,"gateway":"midtrans"}', datetime('now'));
