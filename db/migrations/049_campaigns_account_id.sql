-- Link campaigns to the ad account they were synced from, so bot rules
-- scoped to one account only evaluate that account's campaigns.
-- Nullable: legacy rows synced before this migration have no account.
ALTER TABLE campaigns ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_account_status ON campaigns(account_id, status);
