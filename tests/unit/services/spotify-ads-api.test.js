import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpotifyAdsAPI } from '../../../server/services/spotify/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('SpotifyAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;
    mockSettingsRepo = {
      getCredentials: vi.fn().mockReturnValue({ access_token: 'test-spotify-token' }),
    };
    api = new SpotifyAdsAPI(mockSettingsRepo);
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('should set base URL to Spotify Ads API v3', () => {
      expect(api._baseUrl).toBe('https://api-partner.spotify.com/ads/v3');
    });
  });

  describe('_getToken', () => {
    it('should return the access token from settings', () => {
      expect(api._getToken()).toBe('test-spotify-token');
    });

    it('should throw ConfigurationError when no token available', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      const apiNoToken = new SpotifyAdsAPI(mockSettingsRepo);
      expect(() => apiNoToken._getToken()).toThrow('Spotify Ads access token not configured');
    });
  });

  describe('_headers', () => {
    it('should include Bearer authorization header', () => {
      const headers = api._headers();
      expect(headers).toEqual({ 'Authorization': 'Bearer test-spotify-token' });
    });
  });

  describe('getAccounts', () => {
    it('should call GET /ad_accounts (underscore, not hyphen)', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ ad_accounts: [{ id: 'acct1', name: 'Test Account', business_id: 'biz1' }] }),
      });

      const accounts = await api.getAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'spotify',
        'https://api-partner.spotify.com/ads/v3/ad_accounts',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(accounts).toEqual([{ id: 'acct1', name: 'Test Account', business_id: 'biz1' }]);
    });

    it('should fall back to data field if ad_accounts not present', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ data: [{ id: 'acct2' }] }),
      });

      const accounts = await api.getAccounts();
      expect(accounts).toEqual([{ id: 'acct2' }]);
    });
  });

  describe('getCampaigns', () => {
    it('should call GET /ad_accounts/{accountId}/campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ campaigns: [{ id: 'camp1', name: 'Campaign 1' }] }),
      });

      const campaigns = await api.getCampaigns('acct1');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'spotify',
        'https://api-partner.spotify.com/ads/v3/ad_accounts/acct1/campaigns',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(campaigns).toEqual([{ id: 'camp1', name: 'Campaign 1' }]);
    });
  });

  describe('createCampaign', () => {
    it('should call POST /ad_accounts/{accountId}/campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ campaign: { id: 'camp-new' } }),
      });

      const result = await api.createCampaign('acct1', { name: 'New Campaign', budget: 500 });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'spotify',
        'https://api-partner.spotify.com/ads/v3/ad_accounts/acct1/campaigns',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: 'New Campaign', status: 'PAUSED', budget: 500 }),
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
        'spotify',
        'https://api-partner.spotify.com/ads/v3/ad_accounts/acct1/campaigns/camp1',
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
    it('should include country_code and currency_code from account', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acct1', name: 'Account 1', currency_code: 'USD', country_code: 'US', business_id: 'biz1' }],
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            campaigns: [{ id: 'camp1', name: 'Campaign 1', status: 'ACTIVE', budget: 500 }],
          }),
        });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('acct1');
      expect(results[0].account.currency).toBe('USD');
      expect(results[0].account.country).toBe('US');
      expect(results[0].account.business_id).toBe('biz1');
      expect(results[0].campaigns[0].id).toBe('camp1');
      expect(results[0].campaigns[0].status).toBe('active');
    });
  });
});
