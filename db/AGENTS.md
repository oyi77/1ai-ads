<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# db

## Purpose
SQLite database layer. Handles schema creation, migrations, connection management, and demo data seeding.

## Key Files
| File | Description |
|------|-------------|
| `index.js` | Database connection factory — creates/opens SQLite DB, runs schema migrations |
| `schema.sql` | Full DDL — defines tables: `ads`, `landing_pages`, `campaigns`, `settings`, `users`, `automation_rules`, `performance_history`, `platform_accounts` |
| `seed.js` | Demo data seeding script (runs on every server start) |

## Database Schema (7 tables)
| Table | Purpose |
|-------|---------|
| `ads` | Ad creatives with platform, format, hook/body/CTA, design JSON |
| `landing_pages` | Landing pages with template, theme, HTML output |
| `campaigns` | Ad campaign metrics (impressions, clicks, spend, ROAS) |
| `settings` | Key-value app configuration store |
| `users` | User accounts with bcrypt password hashes |
| `automation_rules` | Conditional automation rules for campaigns |
| `performance_history` | Historical campaign snapshots (CTR, CPC) |
| `platform_accounts` | Connected ad platform credentials (per user) |

## For AI Agents

### Working In This Directory
- Uses better-sqlite3 (synchronous API)
- Schema includes triggers for `updated_at` on `ads` and `landing_pages`
- Indexes on `ads.platform`, `ads.status`, `campaigns.platform`, and performance history
- JSON fields (`tags`, `pain_points`, `benefits`, `design_json`, `credentials`) stored as TEXT

### Testing Requirements
- Unit tests in `tests/unit/db/index.test.js`
- Repository tests in `tests/unit/repositories/` exercise actual DB queries

### Common Patterns
- `createDatabase(path)` factory returns `{ db, seedDemoData }`
- Repositories receive the `db` instance via dependency injection



## Migrations (`db/migrations/`)

- **Filename is the identity.** The runner (`db/migrations/index.js`) keys on
  filename in a `_migrations` table, not on content or number. Renaming an
  already-applied file makes the tracker treat it as unapplied and **re-run**
  it. Never rename a shipped migration.
- **Prefixes are ordering metadata.** Files sort lexically (`041_` before
  `042_`), so a duplicate prefix falls back to the rest of the name. `041_`
  is already duplicated: `041_ad_sets_drop_campaign_fk.sql` and
  `041_add_currency.sql` (both applied; ordered by `_` < `a` lexically).
  Do not add a third.
- **Next free number:** `052_` (highest applied is `051_payment_gateway_duitku.sql`).
- **Duplicate prefixes fail boot — for pending files only.** The runner calls
  `assertNoDuplicatePendingPrefixes` on the unapplied set and throws with both
  filenames. Historical dups that are already applied are not flagged (that
  would brick every boot for a condition that is already safe on disk).
- **Not all statements are re-runnable.** `ALTER TABLE ... ADD COLUMN` fails
  harmlessly on re-run (duplicate column), a table rebuild from
  `ad_sets_drop_campaign_fk` does not — treat any rename of an applied file as
  a data-loss risk until proven otherwise.

## Dependencies

### Internal
- Consumed by `server.js` at bootstrap
- Used by `server/repositories/` for all data access

### External
- better-sqlite3 — Synchronous SQLite3 driver

<!-- MANUAL: Custom project notes can be added below -->
