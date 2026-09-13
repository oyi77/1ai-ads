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

  describe('getCredentials/setCredentials (removed — cross-tenant leak)', () => {
    it('getCredentials throws and points at the per-user lookup', () => {
      expect(() => repo.getCredentials('meta')).toThrow(/findActiveByUserAndPlatform/);
    });

    it('setCredentials throws and points at per-user create/update', () => {
      expect(() => repo.setCredentials('meta', { token: 'new' })).toThrow(/explicit user_id/);
    });

    it('getActiveAccount throws and points at the per-user lookup', () => {
      expect(() => repo.getActiveAccount('meta')).toThrow(/findActiveByUserAndPlatform/);
    });

    it('per-user lookups still work via platformAccountsRepo', () => {
      const userId = 'test-user-1';
      db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(userId, `user_${userId}`, `${userId}@test.com`, 'hash');
      accountsRepo.addAccount({ user_id: userId, platform: 'meta', account_name: 'Test Account', credentials: { accessToken: 'abc123' }, is_active: 1 });
      const found = accountsRepo.findActiveByUserAndPlatform(userId, 'meta');
      expect(found.credentials).toEqual({ accessToken: 'abc123' });
    });
  });

  describe('approval_required flag', () => {
    it('defaults to off (config.approvalRequired) when unset', () => {
      // beforeEach wipes seeded settings; with no DB row the resolver must
      // fall back to the code default (false), never throw.
      expect(repo.getApprovalRequired()).toBe(false);
    });

    it('reflects a persisted on value', () => {
      repo.setApprovalRequired(true);
      expect(repo.getApprovalRequired()).toBe(true);
    });

    it('reflects a persisted off value', () => {
      repo.setApprovalRequired(false);
      expect(repo.getApprovalRequired()).toBe(false);
    });
  });
});
