-- Migration 040: Store invite token for team member invitations.
ALTER TABLE team_members ADD COLUMN invite_token TEXT;
CREATE INDEX IF NOT EXISTS idx_team_members_invite ON team_members(invite_token);
