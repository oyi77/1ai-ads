import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { PlatformAccountsRepository } from '../../../server/repositories/platform-accounts.js';
import { v4 as uuid } from 'uuid';

function insertUser(db, id) {
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)`
  ).run(id, `user_${id}`, `user_${id}@test.com`, 'hash');
}

function makeAccount(userId, overrides = {}) {
  return {
    user_id: userId,
    platform: 'meta',
    account_name: 'Test Account',
    credentials: JSON.stringify({ token: 'abc123' }),
    is_active: 1,
    ...overrides,
  };
}

describe('PlatformAccountsRepository', () => {
  let db, repo, userId;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new PlatformAccountsRepository(db);
    userId = uuid();
    insertUser(db, userId);
  });

  describe('create + findActiveByUserAndPlatform', () => {
    it('inserts a row and findActiveByUserAndPlatform returns it', () => {
      const data = makeAccount(userId);
      const row = repo.create(data);

      expect(row).toBeDefined();
      expect(row.id).toBeDefined();
      expect(row.user_id).toBe(userId);
      expect(row.platform).toBe('meta');
      expect(row.account_name).toBe('Test Account');

      const found = repo.findActiveByUserAndPlatform(userId, 'meta');
      expect(found).not.toBeNull();
      expect(found.id).toBe(row.id);
    });
  });

  describe('update', () => {
    it('changes credentials and re-fetched row has updated credentials', () => {
      const row = repo.create(makeAccount(userId));

      const newCreds = JSON.stringify({ token: 'newtoken' });
      const updated = repo.update(row.id, { credentials: newCreds });

      expect(updated).not.toBeNull();
      expect(updated.credentials).toBe(newCreds);

      const refetched = repo.findActiveByUserAndPlatform(userId, 'meta');
      expect(refetched.credentials).toBe(newCreds);
    });
  });

  describe('remove', () => {
    it('soft-deletes row; findActiveByUserAndPlatform returns null after remove', () => {
      const row = repo.create(makeAccount(userId));

      expect(repo.findActiveByUserAndPlatform(userId, 'meta')).not.toBeNull();

      const result = repo.remove(row.id);
      expect(result).toBe(true);

      expect(repo.findActiveByUserAndPlatform(userId, 'meta')).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns all rows for a user regardless of platform', () => {
      repo.create(makeAccount(userId, { platform: 'meta' }));
      repo.create(makeAccount(userId, { platform: 'google' }));
      repo.create(makeAccount(userId, { platform: 'tiktok' }));

      // Row for a different user - should not be included
      const otherId = uuid();
      insertUser(db, otherId);
      repo.create(makeAccount(otherId, { platform: 'meta' }));

      const rows = repo.findByUserId(userId);
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.platform)).toEqual(expect.arrayContaining(['meta', 'google', 'tiktok']));
      rows.forEach(r => expect(r.user_id).toBe(userId));
    });

    it('returns inactive rows too', () => {
      const row = repo.create(makeAccount(userId));
      repo.remove(row.id);

      const rows = repo.findByUserId(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0].is_active).toBe(0);
    });
  });
});
