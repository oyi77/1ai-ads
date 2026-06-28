import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedditAdsAPI } from '../../../server/services/reddit/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('RedditAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;
    mockSettingsRepo = {
      getCredentials: vi.fn().mockReturnValue({ access_token: 'test-reddit-token' }),
    };
    api = new RedditAdsAPI(mockSettingsRepo);
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('should set base URL to Reddit Ads API v3', () => {
      expect(api._baseUrl).toBe('https://ads-api.reddit.com/api/v3');
    });
  });

  describe('_getToken', () => {
    it('should return the access token from settings', () => {
      expect(api._getToken()).toBe('test-reddit-token');
    });

    it('should throw ConfigurationError when no token available', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      const apiNoToken = new RedditAdsAPI(mockSettingsRepo);
      expect(() => apiNoToken._getToken()).toThrow('Reddit Ads access token not configured');
    });
  });

  describe('_headers', () => {
    it('should include Bearer authorization header', () => {
      const headers = api._headers();
      expect(headers).toEqual({ 'Authorization': 'Bearer test-reddit-token' });
    });
  });

  describe('getAccounts', () => {
    it('should call GET /ad_accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ data: [{ id: 'acct1', name: 'Test Account' }] }),
      });

      const accounts = await api.getAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'reddit',
        'https://ads-api.reddit.com/api/v3/ad_accounts',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(accounts).toEqual([{ id: 'acct1', name: 'Test Account' }]);
    });
  });

  describe('getCampaigns', () => {
    it('should call GET /ad_accounts/{accountId}/campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ data: [{ id: 'camp1', name: 'Campaign 1' }] }),
      });

      const campaigns = await api.getCampaigns('acct1');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'reddit',
        'https://ads-api.reddit.com/api/v3/ad_accounts/acct1/campaigns',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(campaigns).toEqual([{ id: 'camp1', name: 'Campaign 1' }]);
    });
  });

  describe('createCampaign', () => {
    it('should call POST /ad_accounts/{accountId}/campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ data: { id: 'camp-new' } }),
      });

      const result = await api.createCampaign('acct1', { name: 'New Campaign', budget: 1000 });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'reddit',
        'https://ads-api.reddit.com/api/v3/ad_accounts/acct1/campaigns',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: 'New Campaign', status: 'PAUSED', budget: 1000 }),
        })
      );
      expect(result).toEqual({ campaignId: 'camp-new' });
    });
  });

  describe('updateCampaign', () => {
    it('should call PATCH /ad_accounts/{accountId}/campaigns/{campaignId}', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({}),
      });

      const result = await api.updateCampaign('acct1', 'camp1', { name: 'Updated', status: 'ACTIVE' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'reddit',
        'https://ads-api.reddit.com/api/v3/ad_accounts/acct1/campaigns/camp1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: 'Updated', status: 'ACTIVE' }),
        })
      );
      expect(result).toEqual({ campaignId: 'camp1' });
    });
  });

  describe('syncAllAccounts', () => {
    it('should fetch campaigns for each account', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'acct1', name: 'Account 1', currency: 'USD' }] }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'camp1', name: 'Campaign 1', status: 'ACTIVE', budget: 500 }] }),
        });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('acct1');
      expect(results[0].campaigns[0].id).toBe('camp1');
      expect(results[0].campaigns[0].status).toBe('active');
    });
  });
});
