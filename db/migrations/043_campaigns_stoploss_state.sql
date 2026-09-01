-- Add stoploss-tracking columns to campaigns so the scheduler can persist
-- evaluation state across runs. Without these, detectRoasDrop always sees a
-- 0% drop (previousROAS === currentROAS) and evaluateStoploss always returns
-- MONITOR — REDUCE_BUDGET, WAIT, and KILL are unreachable.
ALTER TABLE campaigns ADD COLUMN previous_roas REAL;
ALTER TABLE campaigns ADD COLUMN consecutive_drops INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN budget_reduced INTEGER DEFAULT 0; -- boolean