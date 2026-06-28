import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/config/index.js', () => ({
  default: {
    metaApiVersion: 'v21.0',
    fbAppId: 'test-app-id',
    fbAppSecret: 'test-secret',
  },
}));

import {
  exchangeCodeForToken,
  verifyTokenAndGetUser,
  detectAdAccounts,
  connectMetaAccount,
} from '../../../server/services/meta-connection.js';

describe('meta-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for long-lived token', async () => {
      global.fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'short-lived-token' }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'long-lived-token', expires_in: 5184000 }),
        });

      const result = await exchangeCodeForToken('auth-code', 'https://redirect.com');
      expect(result.accessToken).toBe('long-lived-token');
      expect(result.expiresIn).toBe(5184000);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on token exchange error', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: { message: 'Invalid code' } }),
      });

      await expect(exchangeCodeForToken('bad-code', 'https://redirect.com'))
        .rejects.toThrow('Invalid code');
    });

    it('should throw on long-lived token exchange error', async () => {
      global.fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'short-token' }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ error: { message: 'Exchange failed' } }),
        });

      await expect(exchangeCodeForToken('code', 'https://redirect.com'))
        .rejects.toThrow('Exchange failed');
    });

    it('should fallback to short token if no long token', async () => {
      global.fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'short-token', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ expires_in: 5184000 }),
        });

      const result = await exchangeCodeForToken('code', 'https://redirect.com');
      expect(result.accessToken).toBe('short-token');
    });
  });

  describe('verifyTokenAndGetUser', () => {
    it('should return user info', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'fb-123', name: 'John', email: 'john@test.com' }),
      });

      const result = await verifyTokenAndGetUser('valid-token');
      expect(result.userId).toBe('fb-123');
      expect(result.name).toBe('John');
      expect(result.email).toBe('john@test.com');
    });

    it('should throw on verification error', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: { message: 'Token expired' } }),
      });

      await expect(verifyTokenAndGetUser('expired-token')).rejects.toThrow('Token expired');
    });
  });

  describe('detectAdAccounts', () => {
    it('should return ad accounts', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: [
            { id: 'act_111', name: 'Account 1', account_status: 1 },
            { id: 'act_222', name: 'Account 2', account_status: 1 },
          ],
        }),
      });

      const result = await detectAdAccounts('valid-token');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('act_111');
      expect(result[0].status).toBe(1);
    });

    it('should return empty array on error', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: { message: 'Permission denied' } }),
      });

      const result = await detectAdAccounts('limited-token');
      expect(result).toEqual([]);
    });

    it('should handle empty data', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await detectAdAccounts('token');
      expect(result).toEqual([]);
    });
  });

  describe('connectMetaAccount', () => {
    let mockRepo;

    beforeEach(() => {
      mockRepo = {
        getAccountByPlatformId: vi.fn().mockReturnValue(null),
        addAccount: vi.fn(),
        updateAccount: vi.fn(),
        findByUserAndPlatform: vi.fn().mockReturnValue(null),
      };
    });

    it('should run full connection flow', async () => {
      // exchangeCodeForToken
      global.fetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'short' }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'long', expires_in: 5184000 }) });
      // verifyTokenAndGetUser
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'fb-1', name: 'John', email: 'j@t.com' }),
      });
      // detectAdAccounts
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: [{ id: 'act_1', name: 'Ad Account 1', account_status: 1 }],
        }),
      });

      const result = await connectMetaAccount('code', 'https://redirect.com', mockRepo, 'user-1');
      expect(result.accessToken).toBe('long');
      expect(result.user.userId).toBe('fb-1');
      expect(result.accounts).toHaveLength(1);
      expect(mockRepo.addAccount).toHaveBeenCalled();
    });

    it('should update existing accounts', async () => {
      global.fetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'short' }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'long', expires_in: 5184000 }) });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'fb-1', name: 'John', email: 'j@t.com' }),
      });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          data: [{ id: 'act_1', name: 'Account 1', account_status: 1 }],
        }),
      });

      mockRepo.getAccountByPlatformId.mockReturnValue({ id: 'existing-id' });

      await connectMetaAccount('code', 'https://redirect.com', mockRepo, 'user-1');
      expect(mockRepo.updateAccount).toHaveBeenCalledWith('existing-id', expect.any(Object));
    });

    it('should save token even if no ad accounts detected', async () => {
      global.fetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'short' }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'long', expires_in: 5184000 }) });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'fb-1', name: 'John', email: 'j@t.com' }),
      });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: [] }),
      });

      await connectMetaAccount('code', 'https://redirect.com', mockRepo, 'user-1');
      expect(mockRepo.addAccount).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'meta', account_name: 'John',
      }));
    });

    it('should not duplicate token if user already has meta account', async () => {
      global.fetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'short' }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'long', expires_in: 5184000 }) });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ id: 'fb-1', name: 'John', email: 'j@t.com' }),
      });
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: [] }),
      });

      mockRepo.findByUserAndPlatform.mockReturnValue({ id: 'existing' });

      await connectMetaAccount('code', 'https://redirect.com', mockRepo, 'user-1');
      expect(mockRepo.addAccount).not.toHaveBeenCalled();
    });
  });
});
