import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInAdsAPI } from '../../../server/services/linkedin-ads-api.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('LinkedInAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;

    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };

    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test-linkedin-token',
    });

    api = new LinkedInAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('sets platform name to linkedin', () => {
      expect(api.platformName).toBe('linkedin');
    });

    it('sets base URL to LinkedIn REST API', () => {
      expect(api._baseUrl).toBe('https://api.linkedin.com/rest');
    });
  });

  describe('_getToken', () => {
    it('returns access token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-linkedin-token');
      expect(mockSettingsRepo.getCredentials).toHaveBeenCalledWith('linkedin');
    });

    it('throws ConfigurationError when no access token configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => api._getToken()).toThrow('LinkedIn access token not configured');
    });

    it('throws ConfigurationError when credentials are null', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('LinkedIn access token not configured');
    });

    it('returns explicit token when set via setActiveAccount', () => {
      api.setActiveAccount('123', 'explicit-token');
      expect(api._getToken()).toBe('explicit-token');
    });
  });

  describe('_get', () => {
    it('makes GET request with LinkedIn headers', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api._get('/test', { param1: 'value1' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-linkedin-token',
            'LinkedIn-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
          }),
        })
      );
    });

    it('includes query parameters in URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api._get('/adAccounts', { q: 'search', fields: 'id,name' });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('q=search');
      expect(url).toContain('fields=id%2Cname');
    });

    it('converts object parameters to JSON strings', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api._get('/test', { filter: { status: 'ACTIVE' } });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('filter=');
    });

    it('returns parsed JSON response', async () => {
      const mockData = { elements: [{ id: '1', name: 'Account 1' }] };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await api._get('/test');

      expect(result).toEqual(mockData);
    });
  });

  describe('_post', () => {
    it('makes POST request with LinkedIn headers and JSON body', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      });

      await api._post('/adCampaigns', { name: 'Test' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.stringContaining('/adCampaigns'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-linkedin-token',
            'LinkedIn-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });
  });

  describe('getAccounts', () => {
    it('makes correct API call with search params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getAccounts();

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('/adAccounts');
      expect(url).toContain('q=search');
      expect(url).toContain('search=');
      expect(url).toContain('fields=id%2Cname%2Cstatus%2Ctype%2Ccurrency');
    });

    it('returns accounts data', async () => {
      const mockAccounts = {
        elements: [
          { id: '111', name: 'Account 1', status: 'ACTIVE', type: 'BUSINESS', currency: 'USD' },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAccounts),
      });

      const result = await api.getAccounts();

      expect(result).toEqual(mockAccounts);
    });
  });

  describe('getCampaigns', () => {
    it('makes correct API call with account URN', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getCampaigns('111');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('/adCampaigns');
      expect(url).toContain('q=account');
      expect(url).toContain('account=urn%3Ali%3AsponsoredAccount%3A111');
      expect(url).toContain('fields=');
    });

    it('includes pagination parameters', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getCampaigns('111', { start: 10, count: 50 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('start=10');
      expect(url).toContain('count=50');
    });

    it('returns campaigns data', async () => {
      const mockCampaigns = {
        elements: [
          { id: '222', name: 'Campaign 1', status: 'ACTIVE', type: 'SPONSORED_UPDATES' },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCampaigns),
      });

      const result = await api.getCampaigns('111');

      expect(result).toEqual(mockCampaigns);
    });
  });

  describe('getCampaignAnalytics', () => {
    it('makes correct API call with analytics params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getCampaignAnalytics('111');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('/adAnalytics');
      expect(url).toContain('q=analytics');
      expect(url).toContain('pivot=CAMPAIGN');
      expect(url).toContain('timeGranularity=ALL');
      expect(url).toContain('dateRange=');
      expect(url).toContain('fields=');
    });

    it('includes campaign URNs when campaignIds provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getCampaignAnalytics('111', { campaignIds: ['222', '333'] });

      const url = mockSafeFetch.mock.calls[0][1];
      // URL class encodes parentheses, so check decoded form
      const decodedUrl = decodeURIComponent(url);
      expect(decodedUrl).toContain('campaigns=List(');
      expect(decodedUrl).toContain('urn:li:sponsoredCampaign:222');
      expect(decodedUrl).toContain('urn:li:sponsoredCampaign:333');
    });

    it('returns analytics data', async () => {
      const mockAnalytics = {
        elements: [
          { pivotValue: '222', impressions: '1000', clicks: '50', costInLocalCurrency: '100.00' },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAnalytics),
      });

      const result = await api.getCampaignAnalytics('111', { campaignIds: ['222'] });

      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('createCampaign', () => {
    it('sends correct payload to POST /adCampaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '999' }),
      });

      await api.createCampaign('111', { name: 'New Campaign', dailyBudget: { amount: '10.00', currencyCode: 'USD' } });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.stringContaining('/adCampaigns'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            account: 'urn:li:sponsoredAccount:111',
            name: 'New Campaign',
            status: 'PAUSED',
            type: 'SPONSORED_UPDATES',
            dailyBudget: { amount: '10.00', currencyCode: 'USD' },
          }),
        })
      );
    });

    it('returns created campaign ID', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '999' }),
      });

      const result = await api.createCampaign('111', { name: 'Test' });

      expect(result).toEqual({ campaignId: '999' });
    });

    it('allows custom status and type', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '888' }),
      });

      await api.createCampaign('111', { name: 'Active', status: 'ACTIVE', type: 'TEXT_AD' });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][1] ? mockSafeFetch.mock.calls[0][2].body : '{}');
      expect(body.status).toBe('ACTIVE');
      expect(body.type).toBe('TEXT_AD');
    });
  });

  describe('updateCampaign', () => {
    it('sends PATCH with $set operator', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.updateCampaign('999', { name: 'Updated', status: 'PAUSED' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.stringContaining('/adCampaigns/999'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            patch: {
              $set: {
                name: 'Updated',
                status: 'PAUSED',
              },
            },
          }),
        })
      );
    });

    it('returns campaignId on success', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await api.updateCampaign('999', { name: 'Updated' });

      expect(result).toEqual({ campaignId: '999' });
    });

    it('only includes provided fields in patch', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.updateCampaign('999', { status: 'ACTIVE' });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.patch.$set).toEqual({ status: 'ACTIVE' });
      expect(body.patch.$set.name).toBeUndefined();
    });
  });

  describe('getAdCreatives', () => {
    it('makes correct API call', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getAdCreatives('111');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('/adCreatives');
      expect(url).toContain('q=account');
      expect(url).toContain('account=urn%3Ali%3AsponsoredAccount%3A111');
    });
  });

  describe('getAudiences', () => {
    it('makes correct API call', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getAudiences('111');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('/adAudiences');
      expect(url).toContain('q=account');
      expect(url).toContain('account=urn%3Ali%3AsponsoredAccount%3A111');
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all accounts with campaigns and analytics', async () => {
      mockSafeFetch
        // getAccounts
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            elements: [{ id: '111', name: 'Account 1', currency: 'USD' }],
          }),
        })
        // getCampaigns
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            elements: [{ id: '222', name: 'Campaign 1', status: 'ACTIVE', type: 'SPONSORED_UPDATES' }],
          }),
        })
        // getCampaignAnalytics
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            elements: [{ pivotValue: '222', impressions: '10000', clicks: '500', costInLocalCurrency: '100.00', conversions: '10', conversionValueInLocalCurrency: '500.00', ctr: '0.05', cpc: '0.20' }],
          }),
        });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('111');
      expect(results[0].account.name).toBe('Account 1');
      expect(results[0].account.currency).toBe('USD');
      expect(results[0].campaigns).toHaveLength(1);
      expect(results[0].campaigns[0].id).toBe('222');
      expect(results[0].campaigns[0].name).toBe('Campaign 1');
      expect(results[0].campaigns[0].status).toBe('active');
      expect(results[0].insights).toHaveLength(1);
      expect(results[0].insights[0].campaign_id).toBe('222');
      expect(results[0].insights[0].impressions).toBe(10000);
      expect(results[0].insights[0].clicks).toBe(500);
      expect(results[0].insights[0].spend).toBe(100);
      expect(results[0].insights[0].conversions).toBe(10);
      expect(results[0].syncedAt).toBeDefined();
    });

    it('returns empty results when no accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(0);
    });

    it('handles errors for individual accounts', async () => {
      mockSafeFetch
        // getAccounts
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            elements: [{ id: '111', name: 'Account 1', currency: 'USD' }],
          }),
        })
        // getCampaigns throws
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('111');
      expect(results[0].error).toBe('API Error');
      expect(results[0].syncedAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('propagates errors from safeFetch', async () => {
      mockSafeFetch.mockRejectedValue(new Error('Network error'));

      await expect(api.getAccounts()).rejects.toThrow('Network error');
    });

    it('handles non-OK responses', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(api.getAccounts()).rejects.toThrow();
    });
  });

  describe('API call structure', () => {
    it('uses correct base URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.stringContaining('https://api.linkedin.com/rest'),
        expect.any(Object)
      );
    });

    it('includes LinkedIn-Version header on all requests', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      });

      await api.getAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'linkedin',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'LinkedIn-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
          }),
        })
      );
    });
  });
});
