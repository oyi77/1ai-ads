import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/config/index.js', () => ({
  default: {
    metaApiVersion: 'v21.0',
    fbAppId: 'test-app-id',
    fbAppSecret: 'test-app-secret',
  },
}));

vi.mock('../../../server/services/meta-api.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn().mockReturnValue({
      apiGet: vi.fn()
        .mockResolvedValueOnce({
          data: [
            { id: 'page-1', name: 'Page 1', access_token: 'page-token', perms: ['CREATE_AD'] },
            { id: 'page-2', name: 'Page 2', access_token: 'page-token', perms: ['BASIC'] },
          ],
        })
        .mockResolvedValueOnce({
          data: [{ id: 'biz-1', name: 'Business 1' }],
        }),
    }),
  },
}));

import { FacebookConnectionService } from '../../../server/services/facebook-connection.js';
import { MetaAdsAPI } from '../../../server/services/meta-api.js';

describe('FacebookConnectionService', () => {
  let service;
  let mockRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();

    mockRepo = {
      upsert: vi.fn().mockReturnValue({ id: 'account-1' }),
    };

    service = new FacebookConnectionService(mockRepo);
  });

  it('should create instance with platform accounts repo', () => {
    expect(service.platformAccountsRepo).toBe(mockRepo);
  });

  describe('connectFacebook', () => {
    it('should exchange code for long-lived token', async () => {
      global.fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'short-token' }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'long-token', expires_in: 5184000 }),
        });

      const result = await service.connectFacebook('auth-code', 'https://redirect.com');

      expect(result.accessToken).toBe('long-token');
      expect(result.expires).toBe(5184000);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on initial token exchange error', async () => {
      global.fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: { message: 'Invalid code' } }),
      });

      await expect(service.connectFacebook('bad-code', 'https://redirect.com'))
        .rejects.toThrow('Invalid code');
    });

    it('should fallback to short token if long exchange returns no token', async () => {
      global.fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'short-token' }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ expires_in: 3600 }),
        });

      const result = await service.connectFacebook('code', 'https://redirect.com');
      expect(result.accessToken).toBe('short-token');
    });
  });

  describe('getFacebookAccounts', () => {
    it('should return personal and business accounts', async () => {
      // Reset the mock for this test
      MetaAdsAPI.withToken.mockReturnValue({
        apiGet: vi.fn()
          .mockResolvedValueOnce({
            data: [
              { id: 'page-1', name: 'Page 1', perms: ['CREATE_AD'] },
              { id: 'page-2', name: 'Page 2', perms: ['BASIC'] },
            ],
          })
          .mockResolvedValueOnce({
            data: [{ id: 'biz-1', name: 'Business 1' }],
          }),
      });

      const result = await service.getFacebookAccounts('token');

      expect(result.personal).toHaveLength(1);
      expect(result.personal[0].id).toBe('page-1');
      expect(result.business).toHaveLength(1);
    });

    it('should handle empty responses', async () => {
      MetaAdsAPI.withToken.mockReturnValue({
        apiGet: vi.fn()
          .mockResolvedValueOnce({ data: [] })
          .mockResolvedValueOnce({ data: [] }),
      });

      const result = await service.getFacebookAccounts('token');
      expect(result.personal).toHaveLength(0);
      expect(result.business).toHaveLength(0);
    });

    it('should handle null data in response', async () => {
      MetaAdsAPI.withToken.mockReturnValue({
        apiGet: vi.fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({}),
      });

      const result = await service.getFacebookAccounts('token');
      expect(result.personal).toHaveLength(0);
      expect(result.business).toHaveLength(0);
    });
  });

  describe('linkFacebookAccount', () => {
    it('should upsert account to platform_accounts', async () => {
      const result = await service.linkFacebookAccount('user-1', 'act-123', 'My Page', 'access-token');

      expect(mockRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-1',
        platform: 'meta',
        platform_id: 'act-123',
        name: 'My Page',
        access_token: 'access-token',
        status: 'connected',
      }));
    });

    it('should include metadata with last_sync', async () => {
      await service.linkFacebookAccount('user-1', 'act-123', 'Page', 'token');
      const call = mockRepo.upsert.mock.calls[0][0];
      const meta = JSON.parse(call.metadata);
      expect(meta.last_sync).toBeDefined();
    });
  });
});
