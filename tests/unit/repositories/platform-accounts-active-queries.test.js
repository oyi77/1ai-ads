import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlatformAccountsRepository } from '../../../server/repositories/platform-accounts.js';

// The scheduler's per-user jobs each fan out over accounts scoped with
// `is_active = 1`. The dead-token guards (hasUsableAccount / filterUsableAccounts)
// must never skip a user that these queries would have returned as work for.
// If the two ever disagree, the metadata sync silently stops for live customers.
describe('platform account active-account queries', () => {
  let db;
  let repo;

  const seed = (id, { userId, platform = 'meta', isActive = 1, health = 'ok', created }) => {
    db.prepare(`INSERT INTO platform_accounts
      (id, platform, user_id, account_name, credentials, is_active, health_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, platform, userId, `acct-${id}`,
      JSON.stringify({ access_token: `tok-${id}`, ad_account_id: `act_${id}` }),
      isActive, health, created || '2026-01-01 00:00:00'
    );
  };

  beforeEach(() => {
    db = new Database(':memory:');
    // Minimal shape of the real table: only the columns these queries touch.
    db.exec(`CREATE TABLE platform_accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      user_id TEXT,
      account_name TEXT,
      credentials TEXT,
      is_active INTEGER DEFAULT 1,
      health_status TEXT,
      last_error TEXT,
      updated_at TEXT,
      created_at TEXT
    )`);
    repo = new PlatformAccountsRepository(db);
  });

  afterEach(() => db.close());

  it('getDistinctUserPlatforms returns an owner for each platform they hold', () => {
    seed('m1', { userId: 'u1' });
    seed('f1', { userId: 'u1', platform: 'facebook' });
    seed('m2', { userId: 'u2' });
    const owners = repo.getDistinctUserPlatforms('meta');
    expect(owners.map(o => o.user_id)).toEqual(['u1', 'u2']);
  });

  it('getDistinctUserPlatforms omits accounts the owner paused', () => {
    seed('m1', { userId: 'u1' });
    seed('m2', { userId: 'u2', isActive: 0 });
    expect(repo.getDistinctUserPlatforms('meta').map(o => o.user_id)).toEqual(['u1']);
  });

  it('getDistinctUserPlatforms reports a user even when their token is dead', () => {
    // This is the exact disagreement the guard exists to catch: the query says
    // "u1 has work", the health flag says "that work would fail". The guard
    // must be able to tell the difference, which it can only do by reading
    // health_status from a second query.
    seed('m1', { userId: 'u1', health: 'expired' });
    const owners = repo.getDistinctUserPlatforms('meta');
    expect(owners.map(o => o.user_id)).toEqual(['u1']);
    const owned = repo.findAllActiveByUserAndPlatform('u1', 'meta');
    expect(owned.map(a => a.health_status)).toEqual(['expired']);
  });

  it('findAllActiveByUserAndPlatform returns every active account for that owner only', () => {
    seed('m1', { userId: 'u1', created: '2026-01-01 00:00:00' });
    seed('m2', { userId: 'u1', created: '2026-02-01 00:00:00' });
    seed('m3', { userId: 'u2' });
    seed('m4', { userId: 'u1', platform: 'google' });
    seed('m5', { userId: 'u1', isActive: 0 });
    const owned = repo.findAllActiveByUserAndPlatform('u1', 'meta');
    // Newest first, no cross-user or cross-platform bleed, paused account gone.
    expect(owned.map(a => a.id)).toEqual(['m2', 'm1']);
  });

  it('returns an empty list rather than throwing for an unknown owner', () => {
    expect(repo.findAllActiveByUserAndPlatform('nobody', 'meta')).toEqual([]);
  });

  it('decrypts credentials on the rows the guard inspects', () => {
    seed('m1', { userId: 'u1' });
    const [owned] = repo.findAllActiveByUserAndPlatform('u1', 'meta');
    // The guard reads access_token off these rows; if decryption regressed to
    // returning the raw ciphertext, every account would look token-bearing.
    expect(owned.credentials.access_token).toBe('tok-m1');
  });
});
