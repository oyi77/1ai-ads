-- Phase 3 trust tier: nullable-safe columns on users (see
-- docs/architecture-consolidation-2026-11.md, "Trust Tier").
-- SQLite cannot drop a DEFAULT from a live column, so every addition uses a
-- fresh column with a nullable-safe default. Existing rows keep NULL for the
-- two nullable fields until the first autonomous action hydrates them.
ALTER TABLE users ADD COLUMN autonomy_tier TEXT DEFAULT 'approval_first';
ALTER TABLE users ADD COLUMN autonomy_budget_remaining INTEGER DEFAULT 20;
ALTER TABLE users ADD COLUMN autonomy_budget_reset_at DATETIME;