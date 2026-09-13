import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

// 047 backfill logic proven against a synthetic pre-047 database.
describe('migration 047 history attribution', () => {
  function pre047Db() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE campaigns (id TEXT PRIMARY KEY, user_id TEXT);
      CREATE TABLE performance_history (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL,
        snapshot_date DATE NOT NULL, platform TEXT NOT NULL, spend REAL DEFAULT 0);
      CREATE TABLE creative_performance (id TEXT PRIMARY KEY, ad_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL, platform TEXT NOT NULL, snapshot_date DATE NOT NULL);`);
    return db;
  }

  it('attributes performance_history from campaigns, orphans to system', () => {
    const db = pre047Db();
    db.prepare(`INSERT INTO campaigns (id, user_id) VALUES ('c-owned', 'owner-1')`).run();
    db.prepare(`INSERT INTO performance_history (id, campaign_id, snapshot_date, platform, spend)
      VALUES ('h1', 'c-owned', '2026-09-01', 'meta', 100),
             ('h2', 'c-gone', '2026-09-01', 'meta', 50)`).run();
    db.exec(readFileSync('db/migrations/047_history_user_id.sql', 'utf-8'));
    const rows = db.prepare('SELECT id, user_id FROM performance_history ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'h1', user_id: 'owner-1' },
      { id: 'h2', user_id: 'system' },
    ]);
    db.close();
  });

  it('adds unattributed creative_performance column without touching legacy rows', () => {
    const db = pre047Db();
    db.prepare(`INSERT INTO creative_performance
      (id, ad_id, campaign_id, platform, snapshot_date) VALUES ('cp1', 'ad1', 'act_1', 'meta', '2026-09-01')`).run();
    db.exec(readFileSync('db/migrations/047_history_user_id.sql', 'utf-8'));
    const row = db.prepare('SELECT user_id FROM creative_performance WHERE id = ?').get('cp1');
    expect(row.user_id).toBeNull();
    db.close();
  });
});
