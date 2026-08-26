-- Migration 032: plan expiry for recurring renewal
ALTER TABLE users ADD COLUMN plan_expires_at TEXT;
