import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PinterestAdsAPI } from '../../../server/services/pinterest-ads-api.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('PinterestAdsAPI', () => {
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
      access_token: 'test-pinterest-token',
    });

    api = new PinterestAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('sets platform name to pinterest', () => {
      expect(api.platformName).toBe('pinterest');
    });

    it('sets base URL to Pinterest Marketing API v5', () => {
      expect(api._baseUrl).toBe('https://api.pinterest.com/v5');
    });
  });

  describe('_getToken', () => {
    it('returns access_token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-pinterest-token');
    });

    it('returns explicit token when set', () => {
      api.setActiveAccount('acct1', 'explicit-token');
      expect(api._getToken()).toBe('explicit-token');
    });

    it('throws ConfigurationError when token is missing', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => api._getToken()).toThrow('Pinterest access token not configured');
    });

    it('throws ConfigurationError when no credentials exist', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Pinterest access token not configured');
    });
  });

  describe('_authHeaders', () => {
    it('returns authorization header with Bearer token', () => {
      const headers = api._authHeaders();
      expect(headers).toEqual({ 'Authorization': 'Bearer test-pinterest-token' });
    });
  });

  describe('getAdAccounts', () => {
    it('returns mapped ad accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [
            { id: 'act123', name: 'My Ad Account', currency: 'USD', country: 'US' },
            { id: 'act456', name: 'Second Account', currency: 'EUR', country: 'DE' },
          ],
        }),
      });

      const result = await api.getAdAccounts();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'act123', name: 'My Ad Account', currency: 'USD', country: 'US' });
      expect(result[1]).toEqual({ id: 'act456', name: 'Second Account', currency: 'EUR', country: 'DE' });
    });

    it('handles empty items array', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const result = await api.getAdAccounts();
      expect(result).toEqual([]);
    });

    it('uses correct API path and auth headers', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getAdAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.stringContaining('/ad_accounts'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-pinterest-token',
          }),
        })
      );
    });
  });

  describe('getCampaigns', () => {
    it('returns mapped campaigns for an ad account', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              id: 'camp001',
              name: 'Summer Sale',
              status: 'ACTIVE',
              daily_spend_cap: 5000,
              lifetime_spend_cap: null,
              objective_type: 'AWARENESS',
              created_time: '2026-01-01T00:00:00Z',
              updated_time: '2026-06-01T00:00:00Z',
            },
          ],
        }),
      });

      const result = await api.getCampaigns('act123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('camp001');
      expect(result[0].name).toBe('Summer Sale');
      expect(result[0].status).toBe('ACTIVE');
      expect(result[0].daily_spend_cap).toBe(5000);
    });

    it('passes entityStatus filter parameter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getCampaigns('act123', { entityStatus: 'ACTIVE' });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('entity_statuses=ACTIVE');
    });

    it('passes page_size parameter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getCampaigns('act123', { pageSize: 50 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('page_size=50');
    });
  });

  describe('getCampaignAnalytics', () => {
    it('returns analytics with numeric fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            IMPRESSIONS: 10000,
            CLICKS: 500,
            SPEND_IN_MICRO_DOLLAR: 75000000,
            CTR: 5.0,
            CPC_IN_MICRO_DOLLAR: 150000,
            TOTAL_CONVERSIONS: 25,
            ENGAGEMENT: 600,
          },
        ]),
      });

      const result = await api.getCampaignAnalytics('act123');

      expect(result).toHaveLength(1);
      expect(result[0].impressions).toBe(10000);
      expect(result[0].clicks).toBe(500);
      expect(result[0].spend).toBe(75); // micros to dollars
      expect(result[0].ctr).toBe(5.0);
      expect(result[0].cpc).toBe(0.15); // micros to dollars
      expect(result[0].conversions).toBe(25);
      expect(result[0].engagement).toBe(600);
    });

    it('handles missing fields gracefully', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { IMPRESSIONS: 100 },
        ]),
      });

      const result = await api.getCampaignAnalytics('act123');

      expect(result[0].clicks).toBe(0);
      expect(result[0].spend).toBe(0);
      expect(result[0].conversions).toBe(0);
    });

    it('uses default 30-day date range when not specified', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.getCampaignAnalytics('act123');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('start_date=');
      expect(url).toContain('end_date=');
    });

    it('accepts custom date range', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.getCampaignAnalytics('act123', { startDate: '2026-01-01', endDate: '2026-01-31' });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('start_date=2026-01-01');
      expect(url).toContain('end_date=2026-01-31');
    });
  });

  describe('getCampaignInsights', () => {
    it('returns campaign-level insights', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            IMPRESSIONS: 5000,
            CLICKS: 200,
            SPEND_IN_MICRO_DOLLAR: 30000000,
            CTR: 4.0,
            CPC_IN_MICRO_DOLLAR: 150000,
            TOTAL_CONVERSIONS: 10,
            ENGAGEMENT: 250,
          },
        ]),
      });

      const result = await api.getCampaignInsights('camp001');

      expect(result).toHaveLength(1);
      expect(result[0].campaign_id).toBe('camp001');
      expect(result[0].impressions).toBe(5000);
      expect(result[0].spend).toBe(30);
    });

    it('uses correct API path for campaign analytics', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await api.getCampaignInsights('camp001');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.stringContaining('/campaigns/camp001/analytics'),
        expect.any(Object)
      );
    });
  });

  describe('createCampaign', () => {
    it('creates a campaign with required fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'camp002',
          name: 'New Campaign',
          status: 'PAUSED',
        }),
      });

      const result = await api.createCampaign('act123', { name: 'New Campaign' });

      expect(result.id).toBe('camp002');
      expect(result.name).toBe('New Campaign');
      expect(result.status).toBe('PAUSED');
    });

    it('sends correct POST body with all params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'camp002', name: 'Test', status: 'ACTIVE' }),
      });

      await api.createCampaign('act123', {
        name: 'Test',
        status: 'ACTIVE',
        dailySpendCap: 10000,
        objectiveType: 'CONSIDERATION',
      });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.name).toBe('Test');
      expect(body.status).toBe('ACTIVE');
      expect(body.daily_spend_cap).toBe(10000);
      expect(body.objective_type).toBe('CONSIDERATION');
    });

    it('throws ConfigurationError when name is missing', async () => {
      await expect(api.createCampaign('act123', {})).rejects.toThrow('Campaign name is required');
    });
  });

  describe('updateCampaign', () => {
    it('sends PATCH request with updates', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'camp001',
          name: 'Updated Name',
          status: 'ACTIVE',
        }),
      });

      const result = await api.updateCampaign('camp001', { name: 'Updated Name', status: 'ACTIVE' });

      expect(result.id).toBe('camp001');
      expect(result.name).toBe('Updated Name');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.stringContaining('/campaigns/camp001'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-pinterest-token',
          }),
        })
      );
    });

    it('only includes provided update fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'camp001', name: 'New Name', status: 'PAUSED' }),
      });

      await api.updateCampaign('camp001', { name: 'New Name' });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.name).toBe('New Name');
      expect(body.status).toBeUndefined();
    });
  });

  describe('getAdGroups', () => {
    it('returns ad groups for a campaign', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [
            { id: 'ag001', name: 'Ad Group 1', status: 'ACTIVE', campaign_id: 'camp001', bid_strategy_type: 'MAX_BID' },
          ],
        }),
      });

      const result = await api.getAdGroups('act123', 'camp001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ag001');
      expect(result[0].name).toBe('Ad Group 1');
      expect(result[0].campaign_id).toBe('camp001');
    });

    it('uses correct API path', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getAdGroups('act123', 'camp001');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.stringContaining('/campaigns/camp001/ad_groups'),
        expect.any(Object)
      );
    });
  });

  describe('getTargetingKeywords', () => {
    it('returns targeting keywords', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ keyword: 'fashion', match_type: 'BROAD' }],
        }),
      });

      const result = await api.getTargetingKeywords('act123');

      expect(result).toHaveLength(1);
      expect(result[0].keyword).toBe('fashion');
    });
  });

  describe('searchTargeting', () => {
    it('searches targeting interests', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ id: 'int001', name: 'Fashion' }],
        }),
      });

      const result = await api.searchTargeting('fashion');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Fashion');
    });

    it('passes limit parameter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.searchTargeting('fashion', { limit: 10 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('limit=10');
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all accounts with campaigns and analytics', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            items: [{ id: 'act123', name: 'Main Account', currency: 'USD', country: 'US' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            items: [{ id: 'camp001', name: 'Summer Sale', status: 'ACTIVE', daily_spend_cap: 5000 }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { IMPRESSIONS: 10000, CLICKS: 500, SPEND_IN_MICRO_DOLLAR: 100000000, TOTAL_CONVERSIONS: 10 },
          ]),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('act123');
      expect(result[0].account.name).toBe('Main Account');
      expect(result[0].account.currency).toBe('USD');
      expect(result[0].campaigns).toHaveLength(1);
      expect(result[0].campaigns[0].id).toBe('camp001');
      expect(result[0].insights).toHaveLength(1);
      expect(result[0].insights[0].spend).toBe(100);
      expect(result[0].insights[0].impressions).toBe(10000);
      expect(result[0].insights[0].clicks).toBe(500);
      expect(result[0].insights[0].conversions).toBe(10);
      expect(result[0].syncedAt).toBeDefined();
    });

    it('handles errors for individual accounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            items: [{ id: 'act123', name: 'Main Account', currency: 'USD', country: 'US' }],
          }),
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('act123');
      expect(result[0].error).toContain('API Error');
      expect(result[0].syncedAt).toBeDefined();
    });

    it('syncs multiple accounts independently', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            items: [
              { id: 'act1', name: 'Account 1', currency: 'USD', country: 'US' },
              { id: 'act2', name: 'Account 2', currency: 'EUR', country: 'DE' },
            ],
          }),
        })
        // Account 1 campaigns
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        })
        // Account 1 analytics
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        // Account 2 campaigns
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        })
        // Account 2 analytics
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].account.id).toBe('act1');
      expect(result[1].account.id).toBe('act2');
    });
  });

  describe('API call structure', () => {
    it('uses correct base URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getAdAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.stringContaining('https://api.pinterest.com/v5'),
        expect.any(Object)
      );
    });

    it('includes Authorization header on all requests', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await api.getAdAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'pinterest',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-pinterest-token',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors from safeFetch', async () => {
      mockSafeFetch.mockRejectedValue(new Error('Network error'));

      await expect(api.getAdAccounts()).rejects.toThrow('Failed to fetch ad accounts');
    });

    it('wraps errors as PlatformError', async () => {
      mockSafeFetch.mockRejectedValue(new Error('Rate limited'));

      try {
        await api.getCampaigns('act123');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.name).toBe('PlatformError');
        expect(err.platform).toBe('pinterest');
      }
    });
  });
});
