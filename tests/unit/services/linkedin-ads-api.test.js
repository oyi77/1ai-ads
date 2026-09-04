import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInAdsAPI } from '../../../server/services/linkedin/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LinkedInAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsRepo = { getCredentials: vi.fn(() => ({ access_token: 'test-token' })) };
    api = new LinkedInAdsAPI(mockSettingsRepo);
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('accepts explicit token', () => {
      const api2 = new LinkedInAdsAPI('test-token');
      expect(api2._explicitToken).toBe('test-token');
    });
  });

  describe('_getToken', () => {
    it('returns explicit token when set', () => {
      const api2 = new LinkedInAdsAPI('test-token');
      expect(api2._getToken()).toBe('test-token');
    });

    it('returns token from settings repo', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ access_token: 'repo-token' });
      expect(api._getToken()).toBe('repo-token');
    });

    it('throws ConfigurationError when no token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('LinkedIn Ads access token not configured');
    });
  });

  describe('getAdAccounts', () => {
    it('returns accounts from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          elements: [{
            id: 'acc-123',
            name: { localized: { en_US: 'Test Account' } },
            status: 'ACTIVE',
            type: 'BUSINESS',
            currency: 'USD',
          }],
        }),
      });

      const result = await api.getAdAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('acc-123');
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
          elements: [{
            id: 'camp-1',
            name: 'Test Campaign',
            status: 'ACTIVE',
            dailyBudget: { amount: '100' },
            created: '2024-01-01',
          }],
        }),
      });

      const result = await api.getCampaigns('acc-123');
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
        json: async () => ({}),
      });

      const result = await api.updateCampaign('acc-123', 'camp-1', { status: 'paused' });
      expect(result.updated).toBe(true);
    });
  });

  describe('isExpiredToken', () => {
    it('returns true for 401', () => {
      expect(api.isExpiredToken({ code: 401 })).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(api.isExpiredToken({ code: 500 })).toBe(false);
    });
  });
});
