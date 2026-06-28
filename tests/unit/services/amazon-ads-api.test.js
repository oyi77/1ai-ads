import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmazonAdsAPI } from '../../../server/services/amazon/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('AmazonAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;
    mockSettingsRepo = {
      getCredentials: vi.fn().mockReturnValue({
        access_token: 'test-amazon-token',
        client_id: 'test-client-id',
      }),
    };
    api = new AmazonAdsAPI(mockSettingsRepo);
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('should set base URL to Amazon Advertising API', () => {
      expect(api._baseUrl).toBe('https://advertising-api.amazon.com');
    });
  });

  describe('_headers', () => {
    it('should include Authorization, Amazon-Advertising-API-ClientId headers', () => {
      const headers = api._headers();
      expect(headers).toEqual({
        'Authorization': 'Bearer test-amazon-token',
        'Amazon-Advertising-API-ClientId': 'test-client-id',
      });
    });

    it('should include Amazon-Advertising-API-Scope when profileId provided', () => {
      const headers = api._headers('profile123');
      expect(headers['Amazon-Advertising-API-Scope']).toBe('profile123');
    });
  });

  describe('getProfiles', () => {
    it('should call GET /v2/profiles', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve([{ profileId: 'p1', countryCode: 'US' }]),
      });

      const profiles = await api.getProfiles();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'amazon',
        'https://advertising-api.amazon.com/v2/profiles',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(profiles).toEqual([{ profileId: 'p1', countryCode: 'US' }]);
    });
  });

  describe('getAccounts', () => {
    it('should be an alias for getProfiles', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve([{ profileId: 'p1' }]),
      });

      const accounts = await api.getAccounts();
      expect(accounts).toEqual([{ profileId: 'p1' }]);
    });
  });

  describe('getCampaigns', () => {
    it('should call POST /adsApi/v1/query/campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve([{ campaignId: 'c1', name: 'Campaign 1' }]),
      });

      const campaigns = await api.getCampaigns('profile1');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'amazon',
        'https://advertising-api.amazon.com/adsApi/v1/query/campaigns',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Amazon-Advertising-API-Scope': 'profile1',
          }),
        })
      );
      expect(campaigns).toEqual([{ campaignId: 'c1', name: 'Campaign 1' }]);
    });
  });

  describe('createCampaign', () => {
    it('should call POST /adsApi/v1/create/campaigns with correct body', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ campaignId: 'camp-new' }),
      });

      const result = await api.createCampaign('profile1', { name: 'New Campaign', budget: 100 });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'amazon',
        'https://advertising-api.amazon.com/adsApi/v1/create/campaigns',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Amazon-Advertising-API-Scope': 'profile1',
          }),
          body: JSON.stringify({
            name: 'New Campaign',
            targetingType: 'MANUAL',
            state: 'PAUSED',
            dailyBudget: 100,
          }),
        })
      );
      expect(result).toEqual({ campaignId: 'camp-new' });
    });

    it('should omit dailyBudget when budget not provided', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ campaignId: 'camp-new' }),
      });

      await api.createCampaign('profile1', { name: 'No Budget' });

      const callBody = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(callBody).not.toHaveProperty('dailyBudget');
    });
  });

  describe('updateCampaign', () => {
    it('should call POST /adsApi/v1/update/campaigns with campaignId in body', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({}),
      });

      const result = await api.updateCampaign('profile1', 'camp1', { name: 'Updated', status: 'active' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'amazon',
        'https://advertising-api.amazon.com/adsApi/v1/update/campaigns',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Amazon-Advertising-API-Scope': 'profile1',
          }),
          body: JSON.stringify({ campaignId: 'camp1', name: 'Updated', state: 'ACTIVE' }),
        })
      );
      expect(result).toEqual({ campaignId: 'camp1' });
    });
  });

  describe('syncAllAccounts', () => {
    it('should fetch campaigns for each profile', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve([
            { profileId: 'p1', countryCode: 'US', currencyCode: 'USD', accountInfo: { name: 'Account 1' } },
          ]),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve([
            { campaignId: 'c1', name: 'Campaign 1', state: 'ENABLED', targetingType: 'MANUAL' },
          ]),
        });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('p1');
      expect(results[0].account.name).toBe('Account 1');
      expect(results[0].account.currency).toBe('USD');
      expect(results[0].campaigns[0].id).toBe('c1');
      expect(results[0].campaigns[0].status).toBe('enabled');
    });
  });
});
