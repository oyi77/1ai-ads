-- Migration 045: Make team invites actually work.
--
-- Two structural problems with team_members as created in 035:
--
-- 1. `user_id` was NOT NULL, but the invite flow explicitly supports inviting
--    an email that has no account yet (routes/team.js falls back to
--    `invitedUser?.id || null`). Every such invite would fail the insert.
--    The column is now nullable, since enrollment is established later by
--    /api/team/accept.
--
-- 2. There was no expiry and no uniqueness on invite_token. A leaked invite
--    link stayed valid forever, and nothing prevented two rows sharing a
--    token. expires_at plus a UNIQUE partial index close both.
--
-- SQLite cannot ALTER a column's nullability, so this rebuilds the table with
-- the original column order (invite_token from migration 040 is preserved).
-- The migration runner wraps the file in a transaction, so this is atomic.

DROP TABLE IF EXISTS team_members_new;

CREATE TABLE team_members_new (
  id TEXT PRIMARY KEY,
  team_owner_id TEXT NOT NULL,          -- the account owner (billable user)
  user_id TEXT,                          -- the invited user; NULL until accepted
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',   -- owner, admin, viewer
  status TEXT NOT NULL DEFAULT 'pending',-- pending, active, revoked
  invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invite_token TEXT,
  expires_at DATETIME
);

INSERT INTO team_members_new (
  id, team_owner_id, user_id, email, role, status,
  invited_at, accepted_at, revoked_at, created_at, invite_token, expires_at
)
SELECT
  id, team_owner_id, user_id, email, role, status,
  invited_at, accepted_at, revoked_at, created_at, invite_token,
  -- Existing pending invites get a fresh window rather than expiring the
  -- instant this deploys; already-resolved rows need no expiry.
  CASE WHEN status = 'pending' THEN datetime('now', '+14 days') ELSE NULL END
FROM team_members;

DROP TABLE team_members;

ALTER TABLE team_members_new RENAME TO team_members;

CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(team_owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

-- Partial index: only real tokens are constrained, so the (initially NULL)
-- user_id rows of non-invite members do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invite
  ON team_members(invite_token) WHERE invite_token IS NOT NULL;
