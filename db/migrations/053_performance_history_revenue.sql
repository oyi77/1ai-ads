-- Migration 053: Persist revenue in performance_history so dashboards and
-- time-series show a real historical revenue/ROAS trend instead of a hardcoded
-- zero (DEF-06, audit 2026-11-17).
--
-- The column is nullable: legacy rows have no revenue measurement and are
-- aggregated as 0. Backfill joins campaigns.revenue (the live lifetime value)
-- so historical snapshots are at least the same as what the campaigns table
-- reports today; they are not per-day deltas.
ALTER TABLE performance_history ADD COLUMN revenue REAL DEFAULT 0;

UPDATE performance_history
SET revenue = COALESCE((
  SELECT campaigns.revenue
  FROM campaigns
  WHERE campaigns.id = performance_history.campaign_id
), 0)
WHERE revenue IS NULL OR revenue = 0;

CREATE INDEX IF NOT EXISTS idx_perf_history_revenue
  ON performance_history(user_id, snapshot_date, revenue);
