import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsAPI } from '../../../server/services/google-ads-api.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('GoogleAdsAPI', () => {
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
      oauth_token: 'test-oauth-token',
      developer_token: 'test-dev-token',
      login_customer_id: '1234567890',
    });

    api = new GoogleAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });
  });

  describe('_getConfig', () => {
    it('returns credentials from settings repo', () => {
      const config = api._getConfig();

      expect(config.oauth_token).toBe('test-oauth-token');
      expect(config.developer_token).toBe('test-dev-token');
      expect(config.login_customer_id).toBe('1234567890');
    });

    it('throws error when developer token not configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({
        oauth_token: 'test-token',
      });

      expect(() => api._getConfig()).toThrow('Google Ads developer token not configured');
    });

    it('throws error when OAuth token not configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({
        developer_token: 'test-dev-token',
      });

      expect(() => api._getConfig()).toThrow('Google Ads OAuth token not configured');
    });
  });

  describe('_query', () => {
    it('makes POST request with GAQL query', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ results: [{ campaign: { id: '123', name: 'Test' } }] }]),
      });

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'google',
        expect.stringContaining('/customers/1234567890/googleAds:searchStream'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-oauth-token',
            'developer-token': 'test-dev-token',
            'login-customer-id': '1234567890',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('SELECT campaign.id FROM campaign'),
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
    });

    it('handles multiple result batches', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { results: [{ campaign: { id: '1' } }] },
          { results: [{ campaign: { id: '2' } }] },
        ]),
      });

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(result).toHaveLength(2);
      expect(result[0].campaign.id).toBe('1');
      expect(result[1].campaign.id).toBe('2');
    });

    it('handles empty response', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(result).toEqual([]);
    });
  });

  describe('listAccounts', () => {
    it('returns list of accessible customer IDs', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          resourceNames: ['customers/1234567890', 'customers/0987654321'],
        }),
      });

      const result = await api.listAccounts();

      expect(result).toEqual(['1234567890', '0987654321']);
    });

    it('handles empty resource names', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ resourceNames: [] }),
      });

      const result = await api.listAccounts();

      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns campaigns for a customer', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            results: [
              {
                campaign: {
                  id: '123',
                  name: 'Test Campaign',
                  status: 'ENABLED',
                },
                campaignBudget: {
                  amountMicros: '50000000',
                },
              },
            ],
          },
        ]),
      });

      const result = await api.getCampaigns('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
      expect(result[0].campaign.name).toBe('Test Campaign');
      expect(result[0].campaign.status).toBe('ENABLED');
    });

    it('uses correct GAQL query with all required fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ results: [] }]),
      });

      await api.getCampaigns('1234567890');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.query).toContain('SELECT campaign.id, campaign.name, campaign.status');
      expect(body.query).toContain('campaign_budget.amount_micros');
      expect(body.query).toContain('campaign.advertising_channel_type');
    });
  });

  describe('getCampaignPerformance', () => {
    it('returns campaign performance metrics', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            results: [
              {
                campaign: { id: '123', name: 'Test', status: 'ENABLED' },
                metrics: {
                  impressions: '10000',
                  clicks: '500',
                  costMicros: '100000000',
                  ctr: 5.0,
                  averageCpc: 200000,
                  conversions: 10,
                  costPerConversion: 10000000,
                },
              },
            ],
          },
        ]),
      });

      const result = await api.getCampaignPerformance('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
      expect(result[0].metrics.impressions).toBe('10000');
      expect(result[0].metrics.clicks).toBe('500');
      expect(result[0].metrics.costMicros).toBe('100000000');
    });

    it('uses custom days parameter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ results: [] }]),
      });

      await api.getCampaignPerformance('1234567890', { days: 7 });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.query).toContain('DURING LAST_7_DAYS');
    });

    it('defaults to 30 days', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ results: [] }]),
      });

      await api.getCampaignPerformance('1234567890');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.query).toContain('DURING LAST_30_DAYS');
    });
  });

  describe('getAdPerformance', () => {
    it('returns ad performance metrics', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            results: [
              {
                adGroupAd: {
                  ad: {
                    id: '456',
                    name: 'Test Ad',
                    type: 'RESPONSIVE_SEARCH_AD',
                    finalUrls: ['https://example.com'],
                    responsiveSearchAd: {
                      headlines: [{ text: 'Headline 1' }, { text: 'Headline 2' }],
                      descriptions: [{ text: 'Description 1' }],
                    },
                  },
                },
                metrics: {
                  impressions: '5000',
                  clicks: '250',
                  ctr: 5.0,
                  costMicros: '50000000',
                },
              },
            ],
          },
        ]),
      });

      const result = await api.getAdPerformance('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].adGroupAd.ad.id).toBe('456');
      expect(result[0].metrics.impressions).toBe('5000');
    });

    it('uses correct GAQL query for ads', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ results: [] }]),
      });

      await api.getAdPerformance('1234567890');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.query).toContain('SELECT ad_group_ad.ad.id');
      expect(body.query).toContain('ad_group_ad.ad.name');
      expect(body.query).toContain('metrics.impressions');
      expect(body.query).toContain('metrics.clicks');
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all accounts with campaigns and performance', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceNames: ['customers/1234567890'],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              results: [
                {
                  campaign: { id: '123', name: 'Test', status: 'ENABLED' },
                  campaignBudget: { amountMicros: '50000000' },
                },
              ],
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              results: [
                {
                  campaign: { id: '123' },
                  metrics: {
                    costMicros: '100000000',
                    impressions: '10000',
                    clicks: '500',
                    conversions: '10',
                  },
                },
              ],
            },
          ]),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('1234567890');
      expect(result[0].campaigns).toHaveLength(1);
      expect(result[0].insights).toHaveLength(1);
      expect(result[0].insights[0].campaign_id).toBe('123');
      expect(result[0].insights[0].spend).toBe(100);
      expect(result[0].insights[0].impressions).toBe(10000);
      expect(result[0].insights[0].clicks).toBe(500);
      expect(result[0].insights[0].conversions).toBe(10);
    });

    it('handles errors for individual accounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceNames: ['customers/1234567890'],
          }),
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('1234567890');
      expect(result[0].error).toBe('API Error');
    });

    it('converts micros to standard units', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceNames: ['customers/1234567890'],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              results: [
                {
                  campaign: { id: '123', name: 'Test', status: 'ENABLED' },
                  campaignBudget: { amountMicros: '1000000000' },
                },
              ],
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              results: [
                {
                  campaign: { id: '123' },
                  metrics: { costMicros: '250000000', impressions: '5000', clicks: '100', conversions: '5' },
                },
              ],
            },
          ]),
        });

      const result = await api.syncAllAccounts();

      expect(result[0].campaigns[0].budget).toBe(1000); // 1B micros = 1000
      expect(result[0].insights[0].spend).toBe(250); // 250M micros = 250
    });
  });

  describe('API call structure', () => {
    it('uses correct base URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.listAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'google',
        expect.stringContaining('https://googleads.googleapis.com/v18'),
        expect.any(Object)
      );
    });

    it('includes authorization headers', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.listAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'google',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-oauth-token',
            'developer-token': 'test-dev-token',
          }),
        })
      );
    });

    it('includes login-customer-id header when configured', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'google',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'login-customer-id': '1234567890',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors from safeFetch', async () => {
      mockSafeFetch.mockRejectedValue(new Error('Network error'));

      await expect(api.listAccounts()).rejects.toThrow('Network error');
    });

    it('handles non-OK responses', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(api.listAccounts()).rejects.toThrow();
    });
  });
});
