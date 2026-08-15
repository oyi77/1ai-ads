import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { SettingsRepository } from '../../../server/repositories/settings.js';
import { PlatformAccountsRepository } from '../../../server/repositories/platform-accounts.js';

describe('SettingsRepository', () => {
  let db, repo, accountsRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    // Migrations seed feature-flag settings (e.g. approval_required); the
    // getAll() assertions below assume a pristine DB, so clear them.
    db.prepare('DELETE FROM settings').run();
    accountsRepo = new PlatformAccountsRepository(db);
    repo = new SettingsRepository(db, accountsRepo);
  })

  describe('get', () => {
    it('returns null for missing key', () => {
      const value = repo.get('nonexistent_key');
      expect(value).toBeNull();
    });

    it('returns string value for string setting', () => {
      repo.set('string_key', 'hello world');
      const value = repo.get('string_key');
      expect(value).toBe('hello world');
    });

    it('returns parsed JSON for JSON setting', () => {
      const obj = { name: 'test', value: 123, nested: { a: 1 } };
      repo.set('json_key', obj);
      const value = repo.get('json_key');
      expect(value).toEqual(obj);
    });
  });

  describe('set/get roundtrip', () => {
    it('preserves string value', () => {
      const original = 'my string value';
      repo.set('test_string', original);
      const retrieved = repo.get('test_string');
      expect(retrieved).toBe(original);
    });

    it('preserves JSON object value', () => {
      const original = { foo: 'bar', num: 42, bool: true, arr: [1, 2, 3] };
      repo.set('test_object', original);
      const retrieved = repo.get('test_object');
      expect(retrieved).toEqual(original);
      expect(retrieved).not.toBe(original); // Should be a new object
    });

    it('preserves number value', () => {
      const original = 3.14159;
      repo.set('test_number', original);
      const retrieved = repo.get('test_number');
      expect(retrieved).toBe(original);
    });

    it('preserves boolean value', () => {
      const original = false;
      repo.set('test_boolean', original);
      const retrieved = repo.get('test_boolean');
      expect(retrieved).toBe(original);
    });

    it('updates existing key', () => {
      repo.set('update_key', 'old value');
      repo.set('update_key', 'new value');
      const retrieved = repo.get('update_key');
      expect(retrieved).toBe('new value');
    });
  });

  describe('delete', () => {
    it('removes a key', () => {
      repo.set('to_delete', 'value');
      expect(repo.get('to_delete')).toBe('value');

      repo.delete('to_delete');
      expect(repo.get('to_delete')).toBeNull();
    });

    it('does not error when deleting non-existent key', () => {
      expect(() => repo.delete('nonexistent')).not.toThrow();
    });
  });

  describe('getAll', () => {
    it('returns empty object when no settings exist', () => {
      const all = repo.getAll();
      expect(all).toEqual({});
    });

    it('returns all settings as object', () => {
      repo.set('key1', 'string value');
      repo.set('key2', { nested: 'object' });
      repo.set('key3', 42);

      const all = repo.getAll();
      expect(all).toHaveProperty('key1', 'string value');
      expect(all).toHaveProperty('key2', { nested: 'object' });
      expect(all).toHaveProperty('key3', 42);
      expect(Object.keys(all)).toHaveLength(3);
    });

    it('excludes deleted keys from getAll', () => {
      repo.set('keep', 'keep me');
      repo.set('delete', 'delete me');
      repo.delete('delete');

      const all = repo.getAll();
      expect(all).toHaveProperty('keep');
      expect(all).not.toHaveProperty('delete');
      expect(Object.keys(all)).toHaveLength(1);
    });
  });

  describe('getCredentials/setCredentials', () => {
    function insertUser(id) {
      db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(id, `user_${id}`, `${id}@test.com`, 'hash');
    }

    it('stores and retrieves platform credentials', () => {
      const userId = 'test-user-1';
      insertUser(userId);
      const credentials = { accessToken: 'abc123', refreshToken: 'xyz789' };
      accountsRepo.addAccount({ user_id: userId, platform: 'meta', account_name: 'Test Account', credentials, is_active: 1 });

      const retrieved = repo.getCredentials('meta');
      expect(retrieved).toEqual(credentials);
    });

    it('returns null for non-existent platform credentials', () => {
      const retrieved = repo.getCredentials('google');
      expect(retrieved).toBeNull();
    });

    it('updates existing credentials', () => {
      const userId = 'test-user-2';
      insertUser(userId);
      accountsRepo.addAccount({ user_id: userId, platform: 'meta', account_name: 'Test', credentials: { token: 'old' }, is_active: 1 });
      repo.setCredentials('meta', { token: 'new', extra: 'data' });

      const retrieved = repo.getCredentials('meta');
      expect(retrieved).toEqual({ token: 'new', extra: 'data' });
    });

    it('stores credentials for different platforms separately', () => {
      const userId = 'test-user-3';
      insertUser(userId);
      accountsRepo.addAccount({ user_id: userId, platform: 'meta', account_name: 'Meta Account', credentials: { meta_token: 'meta_val' }, is_active: 1 });
      accountsRepo.addAccount({ user_id: userId, platform: 'google', account_name: 'Google Account', credentials: { google_token: 'google_val' }, is_active: 1 });

      expect(repo.getCredentials('meta')).toEqual({ meta_token: 'meta_val' });
      expect(repo.getCredentials('google')).toEqual({ google_token: 'google_val' });
    });
  });
});
