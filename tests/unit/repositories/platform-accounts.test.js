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

      const newCreds = { token: 'newtoken' };
      const updated = repo.update(row.id, { credentials: newCreds });

      expect(updated).not.toBeNull();
      expect(updated.credentials).toEqual(newCreds);

      const refetched = repo.findActiveByUserAndPlatform(userId, 'meta');
      expect(refetched.credentials).toEqual(newCreds);
    });
  });

  describe('remove', () => {
    it('hard-deletes row; findActiveByUserAndPlatform returns null after remove', () => {
      const row = repo.create(makeAccount(userId));

      expect(repo.findActiveByUserAndPlatform(userId, 'meta')).not.toBeNull();

      const result = repo.remove(row.id);
      expect(result).toBe(true);

      expect(repo.findActiveByUserAndPlatform(userId, 'meta')).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns all active accounts for user', () => {
      repo.create(makeAccount(userId));
      repo.create(makeAccount(userId, { platform: 'google', account_name: 'Google Ads' }));
      const rows = repo.findByUserId(userId);
      expect(rows).toHaveLength(2);
    });

    it('excludes removed accounts', () => {
      const row = repo.create(makeAccount(userId));
      repo.create(makeAccount(userId, { platform: 'google', account_name: 'Google Ads' }));
      repo.remove(row.id);

      const rows = repo.findByUserId(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0].platform).toBe('google');
    });
  });

  describe('legacy contaminated tokens', () => {
    it('returns a cleaned token without rewriting the test row first', () => {
      const dirty = '✅ EAAlegacyToken connected for Meta (Facebook/Instagram)! You can manage this account from the web dashboard or /status.';
      db.prepare(
        `INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('legacy-row', userId, 'meta', 'Legacy Account', JSON.stringify({ access_token: dirty }), 1);
      const found = repo.findActiveByUserAndPlatform(userId, 'meta');
      expect(found.credentials.access_token).toBe('EAAlegacyToken');
    });
  });

  describe('account_name token guard', () => {
    it('replaces a pasted access token in account_name with a safe label', () => {
      // Proven live 2026-09-29: a 201-char EAA token sat in the plaintext
      // account_name column and rendered in every account list + log line.
      const leaked = 'EAAkLDo8h2UMBSROF6I219SqJRd1uI7adII2Orq8E8NdDJ7RAmsZB6Poyky6EdRmStpX1VefuSouh6IC7GVkXfnro1waMLZArQnsZBfZBH28QbfpJ591bFhxKPEILmXel6BmOpOkHgXpppijgOX9pvaek5LdW9pK8PKN0xPdKWs9e25W9ZAWLmdoaHrZABetSShOQZDZD';
      const row = repo.create(makeAccount(userId, { account_name: leaked }));

      expect(row.account_name).not.toContain('EAA');
      expect(row.account_name).toBe('Meta Account');
    });

    it('keeps a genuine account name untouched', () => {
      const row = repo.create(makeAccount(userId, { account_name: 'Adforge Meta QA' }));
      expect(row.account_name).toBe('Adforge Meta QA');
    });
  });
});
