import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { RefreshTokensRepository } from '../../../server/repositories/refresh-tokens.js';
import { v4 as uuid } from 'uuid';

describe('RefreshTokensRepository', () => {
  let db, repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new RefreshTokensRepository(db);
  });

  describe('create', () => {
    it('stores a token and returns id', () => {
      const userId = uuid();
      const token = 'refresh_token_123';
      const expiresAt = new Date(Date.now() + 86400000).toISOString(); // 24 hours from now

      const id = repo.create(userId, token, expiresAt);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('stores all token data correctly', () => {
      const userId = uuid();
      const token = 'my_refresh_token';
      const expiresAt = '2025-12-31T23:59:59.000Z';

      const id = repo.create(userId, token, expiresAt);

      const found = repo.findByToken(token);
      expect(found.id).toBe(id);
      expect(found.user_id).toBe(userId);
      expect(found.token).toBe(token);
      expect(found.expires_at).toBe(expiresAt);
      expect(found.created_at).toBeDefined();
    });
  });

  describe('findByToken', () => {
    it('finds the stored token', () => {
      const userId = uuid();
      const token = 'find_me_token';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token, expiresAt);

      const found = repo.findByToken(token);
      expect(found).toBeDefined();
      expect(found.token).toBe(token);
      expect(found.user_id).toBe(userId);
    });

    it('returns null for non-existent token', () => {
      const found = repo.findByToken('nonexistent_token');
      expect(found).toBeNull();
    });

    it('distinguishes between different tokens', () => {
      const userId = uuid();
      const token1 = 'token_1';
      const token2 = 'token_2';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token1, expiresAt);
      repo.create(userId, token2, expiresAt);

      const found1 = repo.findByToken(token1);
      const found2 = repo.findByToken(token2);

      expect(found1.token).toBe(token1);
      expect(found2.token).toBe(token2);
      expect(found1.id).not.toBe(found2.id);
    });
  });

  describe('deleteByToken', () => {
    it('removes a token', () => {
      const userId = uuid();
      const token = 'delete_me';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token, expiresAt);
      expect(repo.findByToken(token)).toBeDefined();

      repo.deleteByToken(token);
      expect(repo.findByToken(token)).toBeNull();
    });

    it('does not error when deleting non-existent token', () => {
      expect(() => repo.deleteByToken('nonexistent')).not.toThrow();
    });

    it('only deletes the specified token', () => {
      const userId = uuid();
      const token1 = 'keep_me';
      const token2 = 'delete_me';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token1, expiresAt);
      repo.create(userId, token2, expiresAt);

      repo.deleteByToken(token2);

      expect(repo.findByToken(token1)).toBeDefined();
      expect(repo.findByToken(token2)).toBeNull();
    });
  });

  describe('deleteByUserId', () => {
    it('removes all tokens for a user', () => {
      const userId = uuid();
      const token1 = 'token_1';
      const token2 = 'token_2';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token1, expiresAt);
      repo.create(userId, token2, expiresAt);

      expect(repo.findByToken(token1)).toBeDefined();
      expect(repo.findByToken(token2)).toBeDefined();

      repo.deleteByUserId(userId);

      expect(repo.findByToken(token1)).toBeNull();
      expect(repo.findByToken(token2)).toBeNull();
    });

    it('only removes tokens for the specified user', () => {
      const userId1 = uuid();
      const userId2 = uuid();
      const token1 = 'user1_token';
      const token2 = 'user2_token';
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId1, token1, expiresAt);
      repo.create(userId2, token2, expiresAt);

      repo.deleteByUserId(userId1);

      expect(repo.findByToken(token1)).toBeNull();
      expect(repo.findByToken(token2)).toBeDefined();
    });

    it('does not error when user has no tokens', () => {
      const userId = uuid();
      expect(() => repo.deleteByUserId(userId)).not.toThrow();
    });
  });

  describe('deleteExpired', () => {
    it('removes expired tokens', () => {
      const userId = uuid();
      const expiredToken = 'expired';
      const validToken = 'valid';
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, expiredToken, pastDate);
      repo.create(userId, validToken, futureDate);

      expect(repo.findByToken(expiredToken)).toBeDefined();
      expect(repo.findByToken(validToken)).toBeDefined();

      repo.deleteExpired();

      expect(repo.findByToken(expiredToken)).toBeNull();
      expect(repo.findByToken(validToken)).toBeDefined();
    });

    it('does not error when no tokens exist', () => {
      expect(() => repo.deleteExpired()).not.toThrow();
    });

    it('does not remove non-expired tokens', () => {
      const userId = uuid();
      const token1 = 'valid1';
      const token2 = 'valid2';
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      repo.create(userId, token1, futureDate);
      repo.create(userId, token2, futureDate);

      repo.deleteExpired();

      expect(repo.findByToken(token1)).toBeDefined();
      expect(repo.findByToken(token2)).toBeDefined();
    });
  });
});
