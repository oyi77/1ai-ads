import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsAPI } from '../../../server/services/google/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('GoogleAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsRepo = {
      getCredentials: vi.fn(() => ({ access_token: 'test-token' })),
    };
    api = new GoogleAdsAPI(mockSettingsRepo);
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('accepts explicit token', () => {
      const api2 = new GoogleAdsAPI('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('_getToken', () => {
    it('returns explicit token when set', () => {
      const api2 = new GoogleAdsAPI('test-token');
      expect(api2._getToken()).toBe('test-token');
    });

    it('returns token from settings repo', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'repo-token' });
      expect(api._getToken()).toBe('repo-token');
    });

    it('throws ConfigurationError when no token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Google Ads access token not configured');
    });
  });

  describe('static withToken', () => {
    it('creates instance with explicit token', () => {
      const api2 = GoogleAdsAPI.withToken('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('getAdAccounts', () => {
    it('returns accounts from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              customerClient: {
                resourceName: 'customers/123',
                id: '123',
                descriptiveName: 'Test Account',
                currencyCode: 'USD',
                status: 'ENABLED',
              },
            },
          ],
        }),
      });

      const result = await api.getAdAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('123');
      expect(result[0].name).toBe('Test Account');
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
          results: [
            {
              campaign: {
                id: 'camp-1',
                name: 'Test Campaign',
                status: 'ENABLED',
                advertisingChannelType: 'SEARCH',
                budget: { amountMicros: '10000000' },
                impressions: '1000',
                clicks: '100',
                costMicros: '5000000',
                ctr: '0.1',
                averageCpc: '50000',
                conversions: '10',
              },
            },
          ],
        }),
      });

      const result = await api.getCampaigns('123');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('camp-1');
      expect(result[0].name).toBe('Test Campaign');
      expect(result[0].status).toBe('active');
      expect(result[0].budget).toBe(10);
    });

    it('returns empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API error'));
      const result = await api.getCampaigns('123');
      expect(result).toEqual([]);
    });
  });

  describe('getCampaignInsights', () => {
    it('returns insights from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              campaign: { id: 'camp-1', name: 'Test Campaign' },
              metrics: {
                impressions: '5000',
                clicks: '500',
                costMicros: '2500000',
                ctr: '0.1',
                averageCpc: '5000',
                conversions: '50',
              },
            },
          ],
        }),
      });

      const result = await api.getCampaignInsights('123', 'camp-1');
      expect(result).not.toBeNull();
      expect(result.campaignId).toBe('camp-1');
      expect(result.impressions).toBe(5000);
      expect(result.clicks).toBe(500);
    });

    it('returns null when no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

      const result = await api.getCampaignInsights('123', 'camp-1');
      expect(result).toBeNull();
    });
  });

  describe('updateCampaign', () => {
    it('updates campaign status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ resourceName: 'customers/123/campaigns/camp-1' }],
        }),
      });

      const result = await api.updateCampaign('123', 'camp-1', { status: 'paused' });
      expect(result.updated).toBe(true);
    });

    it('returns error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API error'));
      const result = await api.updateCampaign('123', 'camp-1', { status: 'paused' });
      expect(result.updated).toBe(false);
    });
  });

  describe('isExpiredToken', () => {
    it('returns true for 401 errors', () => {
      expect(api.isExpiredToken({ code: 401 })).toBe(true);
    });

    it('returns true for 403 errors', () => {
      expect(api.isExpiredToken({ code: 403 })).toBe(true);
    });

    it('returns true for unauthorized message', () => {
      expect(api.isExpiredToken({ message: 'unauthorized' })).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(api.isExpiredToken({ code: 500, message: 'server error' })).toBe(false);
    });
  });
});
