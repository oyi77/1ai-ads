import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsAPI } from '../../../server/services/google-ads-api.js';

// Hoist mock references so vi.mock factories can use them
const { mockQuery, mockListAccessibleCustomers, mockCampaignsCreate, mockCampaignsUpdate, mockCustomer, MockGoogleAdsApi } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockListAccessibleCustomers = vi.fn();
  const mockCampaignsCreate = vi.fn();
  const mockCampaignsUpdate = vi.fn();
  const mockCustomer = vi.fn().mockReturnValue({
    query: mockQuery,
    campaigns: {
      create: mockCampaignsCreate,
      update: mockCampaignsUpdate,
    },
  });
  class MockGoogleAdsApi {
    constructor() {
      this.Customer = mockCustomer;
      this.listAccessibleCustomers = mockListAccessibleCustomers;
    }
  }
  return { mockQuery, mockListAccessibleCustomers, mockCampaignsCreate, mockCampaignsUpdate, mockCustomer, MockGoogleAdsApi };
});

vi.mock('google-ads-api', () => ({
  default: MockGoogleAdsApi,
}));

// Keep safeFetch mock for backward compatibility (imported but now unused for query/mutate)
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('GoogleAdsAPI', () => {
  let api;
  let mockSettingsRepo;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };

    mockSettingsRepo.getCredentials.mockReturnValue({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
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
    it('uses SDK customer.query with GAQL query', async () => {
      mockQuery.mockResolvedValue([{ campaign: { id: '123', name: 'Test' } }]);

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(mockCustomer).toHaveBeenCalledWith({
        refresh_token: 'test-oauth-token',
        customer_id: '1234567890',
        login_customer_id: '1234567890',
      });
      expect(mockQuery).toHaveBeenCalledWith('SELECT campaign.id FROM campaign');

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
    });

    it('handles multiple results', async () => {
      mockQuery.mockResolvedValue([
        { campaign: { id: '1' } },
        { campaign: { id: '2' } },
      ]);

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(result).toHaveLength(2);
      expect(result[0].campaign.id).toBe('1');
      expect(result[1].campaign.id).toBe('2');
    });

    it('handles empty response', async () => {
      mockQuery.mockResolvedValue([]);

      const result = await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(result).toEqual([]);
    });
  });

  describe('listAccounts', () => {
    it('returns list of accessible customer IDs', async () => {
      mockListAccessibleCustomers.mockResolvedValue({
        resource_names: ['customers/1234567890', 'customers/0987654321'],
      });

      const result = await api.listAccounts();

      expect(mockListAccessibleCustomers).toHaveBeenCalledWith('test-oauth-token');
      expect(result).toEqual(['1234567890', '0987654321']);
    });

    it('handles empty resource names', async () => {
      mockListAccessibleCustomers.mockResolvedValue({ resource_names: [] });

      const result = await api.listAccounts();

      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns campaigns for a customer', async () => {
      mockQuery.mockResolvedValue([
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
      ]);

      const result = await api.getCampaigns('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
      expect(result[0].campaign.name).toBe('Test Campaign');
      expect(result[0].campaign.status).toBe('ENABLED');
    });

    it('uses correct GAQL query with all required fields', async () => {
      mockQuery.mockResolvedValue([]);

      await api.getCampaigns('1234567890');

      const gaql = mockQuery.mock.calls[0][0];
      expect(gaql).toContain('SELECT campaign.id, campaign.name, campaign.status');
      expect(gaql).toContain('campaign_budget.amount_micros');
      expect(gaql).toContain('campaign.advertising_channel_type');
    });
  });

  describe('getCampaignPerformance', () => {
    it('returns campaign performance metrics', async () => {
      mockQuery.mockResolvedValue([
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
      ]);

      const result = await api.getCampaignPerformance('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].campaign.id).toBe('123');
      expect(result[0].metrics.impressions).toBe('10000');
      expect(result[0].metrics.clicks).toBe('500');
      expect(result[0].metrics.costMicros).toBe('100000000');
    });

    it('uses custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      await api.getCampaignPerformance('1234567890', { days: 7 });

      const gaql = mockQuery.mock.calls[0][0];
      expect(gaql).toContain('DURING LAST_7_DAYS');
    });

    it('defaults to 30 days', async () => {
      mockQuery.mockResolvedValue([]);

      await api.getCampaignPerformance('1234567890');

      const gaql = mockQuery.mock.calls[0][0];
      expect(gaql).toContain('DURING LAST_30_DAYS');
    });
  });

  describe('getAdPerformance', () => {
    it('returns ad performance metrics', async () => {
      mockQuery.mockResolvedValue([
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
      ]);

      const result = await api.getAdPerformance('1234567890');

      expect(result).toHaveLength(1);
      expect(result[0].adGroupAd.ad.id).toBe('456');
      expect(result[0].metrics.impressions).toBe('5000');
    });

    it('uses correct GAQL query for ads', async () => {
      mockQuery.mockResolvedValue([]);

      await api.getAdPerformance('1234567890');

      const gaql = mockQuery.mock.calls[0][0];
      expect(gaql).toContain('SELECT ad_group_ad.ad.id');
      expect(gaql).toContain('ad_group_ad.ad.name');
      expect(gaql).toContain('metrics.impressions');
      expect(gaql).toContain('metrics.clicks');
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all accounts with campaigns and performance', async () => {
      mockListAccessibleCustomers.mockResolvedValue({
        resource_names: ['customers/1234567890'],
      });
      mockQuery
        .mockResolvedValueOnce([
          {
            campaign: { id: '123', name: 'Test', status: 'ENABLED' },
            campaignBudget: { amountMicros: '50000000' },
          },
        ])
        .mockResolvedValueOnce([
          {
            campaign: { id: '123' },
            metrics: {
              costMicros: '100000000',
              impressions: '10000',
              clicks: '500',
              conversions: '10',
            },
          },
        ]);

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
      mockListAccessibleCustomers.mockResolvedValue({
        resource_names: ['customers/1234567890'],
      });
      mockQuery.mockRejectedValueOnce(new Error('API Error'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('1234567890');
      expect(result[0].error).toBe('API Error');
    });

    it('converts micros to standard units', async () => {
      mockListAccessibleCustomers.mockResolvedValue({
        resource_names: ['customers/1234567890'],
      });
      mockQuery
        .mockResolvedValueOnce([
          {
            campaign: { id: '123', name: 'Test', status: 'ENABLED' },
            campaignBudget: { amountMicros: '1000000000' },
          },
        ])
        .mockResolvedValueOnce([
          {
            campaign: { id: '123' },
            metrics: { costMicros: '250000000', impressions: '5000', clicks: '100', conversions: '5' },
          },
        ]);

      const result = await api.syncAllAccounts();

      expect(result[0].campaigns[0].budget).toBe(1000); // 1B micros = 1000
      expect(result[0].insights[0].spend).toBe(250); // 250M micros = 250
    });
  });

  describe('API call structure', () => {
    it('initializes SDK client with correct credentials', async () => {
      mockQuery.mockResolvedValue([]);

      await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      // Verify SDK was initialized by checking customer was created with correct auth
      expect(mockCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          refresh_token: 'test-oauth-token',
          customer_id: '1234567890',
        })
      );
    });

    it('creates customer with correct auth parameters', async () => {
      mockQuery.mockResolvedValue([]);

      await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(mockCustomer).toHaveBeenCalledWith({
        refresh_token: 'test-oauth-token',
        customer_id: '1234567890',
        login_customer_id: '1234567890',
      });
    });

    it('passes GAQL query to SDK customer.query', async () => {
      mockQuery.mockResolvedValue([]);

      await api._query('1234567890', 'SELECT campaign.id FROM campaign');

      expect(mockQuery).toHaveBeenCalledWith('SELECT campaign.id FROM campaign');
    });
  });

  describe('error handling', () => {
    it('propagates errors from SDK query', async () => {
      mockQuery.mockRejectedValue(new Error('Network error'));

      await expect(api._query('1234567890', 'SELECT campaign.id FROM campaign')).rejects.toThrow('Network error');
    });

    it('handles SDK initialization failures', async () => {
      mockListAccessibleCustomers.mockRejectedValue(new Error('Unauthorized'));

      await expect(api.listAccounts()).rejects.toThrow('Unauthorized');
    });
  });
});
