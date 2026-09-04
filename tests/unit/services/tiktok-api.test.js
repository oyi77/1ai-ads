import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TikTokAdsAPI } from '../../../server/services/tiktok/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('TikTokAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsRepo = {
      getCredentials: vi.fn(() => ({ access_token: 'test-token' })),
    };
    api = new TikTokAdsAPI(mockSettingsRepo, { appId: 'test-app', secret: 'test-secret' });
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('accepts explicit token', () => {
      const api2 = new TikTokAdsAPI('test-token', { appId: 'app' });
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('_getToken', () => {
    it('returns explicit token when set', () => {
      const api2 = new TikTokAdsAPI('test-token');
      expect(api2._getToken()).toBe('test-token');
    });

    it('returns token from settings repo', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'repo-token' });
      expect(api._getToken()).toBe('repo-token');
    });

    it('throws ConfigurationError when no token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('TikTok Ads access token not configured');
    });
  });

  describe('static withToken', () => {
    it('creates instance with explicit token', () => {
      const api2 = TikTokAdsAPI.withToken('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('getAdAccounts', () => {
    it('returns accounts from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: {
            list: [{
              advertiser_id: 'adv-123',
              advertiser_name: 'Test Advertiser',
              company: 'Test Co',
              status: 'ENABLED',
              currency: 'USD',
              timezone: 'America/New_York',
            }],
          },
        }),
      });

      const result = await api.getAdAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('adv-123');
      expect(result[0].name).toBe('Test Advertiser');
    });

    it('returns empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API error'));
      const result = await api.getAdAccounts();
      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns campaigns from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: {
            list: [{
              campaign_id: 'camp-1',
              campaign_name: 'Test Campaign',
              status: 'ENABLE',
              budget: 100,
              objective: 'TRAFFIC',
              create_time: '2024-01-01',
            }],
          },
        }),
      });

      const result = await api.getCampaigns('adv-123');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('camp-1');
      expect(result[0].status).toBe('active');
    });
  });

  describe('updateCampaign', () => {
    it('updates campaign status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: {} }),
      });

      const result = await api.updateCampaign('adv-123', 'camp-1', { status: 'paused' });
      expect(result.updated).toBe(true);
    });
  });

  describe('isExpiredToken', () => {
    it('returns true for 401', () => {
      expect(api.isExpiredToken({ code: 401 })).toBe(true);
    });

    it('returns true for 403', () => {
      expect(api.isExpiredToken({ code: 403 })).toBe(true);
    });

    it('returns true for token invalid message', () => {
      expect(api.isExpiredToken({ message: 'access token is invalid' })).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(api.isExpiredToken({ code: 500 })).toBe(false);
    });
  });
});
