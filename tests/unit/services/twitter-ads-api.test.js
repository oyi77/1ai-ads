import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwitterAdsAPI } from '../../../server/services/twitter/index.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('TwitterAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;

    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };

    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test-twitter-token',
    });

    api = new TwitterAdsAPI(mockSettingsRepo);

    // Clear mock calls before each test
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('sets platform name to twitter', () => {
      expect(api.platformName).toBe('twitter');
    });

    it('sets base URL to Twitter Ads API v12', () => {
      expect(api._baseUrl).toBe('https://ads-api.twitter.com/12');
    });

    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });
  });

  describe('_getToken', () => {
    it('returns access token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-twitter-token');
      expect(mockSettingsRepo.getCredentials).toHaveBeenCalledWith('twitter');
    });

    it('throws error when no access token configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => api._getToken()).toThrow('Twitter/X access token not configured');
    });

    it('throws error when credentials are null', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Twitter/X access token not configured');
    });

    it('throws error when settingsRepo is null', () => {
      const apiNoRepo = new TwitterAdsAPI(null);
      expect(() => apiNoRepo._getToken()).toThrow('Twitter/X access token not configured');
    });
  });

  describe('_get', () => {
    it('makes GET request with Bearer token header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { param1: 'value1' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'twitter',
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-twitter-token' },
        })
      );
    });

    it('includes query parameters in URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/accounts/123/campaigns', { count: 200 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('count=200');
    });

    it('skips null and undefined parameters', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { valid: 'yes', skip: null, also: undefined });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('valid=yes');
      expect(url).not.toContain('skip');
      expect(url).not.toContain('also');
    });

    it('returns data from response', async () => {
      const mockData = [{ id: '1', name: 'Account 1' }];
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockData }),
      });

      const result = await api._get('/accounts');
      expect(result).toEqual(mockData);
    });

    it('falls back to full body when no data key', async () => {
      const mockBody = { id: '1', name: 'Test' };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBody),
      });

      const result = await api._get('/test');
      expect(result).toEqual(mockBody);
    });

    it('throws PlatformError when response contains errors', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ code: 'INVALID_REQUEST', message: 'Bad request' }],
        }),
      });

      await expect(api._get('/test')).rejects.toThrow('Twitter API error: Bad request');
    });
  });

  describe('_post', () => {
    it('makes POST request with Bearer token and JSON body', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1' } }),
      });

      await api._post('/accounts/123/campaigns', { name: 'Test' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'twitter',
        expect.stringContaining('/accounts/123/campaigns'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-twitter-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });

    it('throws PlatformError on API errors', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ code: 'FORBIDDEN', message: 'Not allowed' }],
        }),
      });

      await expect(api._post('/test', {})).rejects.toThrow('Twitter API error: Not allowed');
    });
  });

  describe('_put', () => {
    it('makes PUT request with Bearer token and JSON body', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1' } }),
      });

      await api._put('/accounts/123/campaigns/456', { name: 'Updated' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'twitter',
        expect.stringContaining('/accounts/123/campaigns/456'),
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-twitter-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Updated' }),
        })
      );
    });

    it('throws PlatformError on API errors', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ code: 'NOT_FOUND', message: 'Campaign not found' }],
        }),
      });

      await expect(api._put('/test', {})).rejects.toThrow('Twitter API error: Campaign not found');
    });
  });

  describe('getAccounts', () => {
    it('returns mapped account list', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'abc123', name: 'My Account', business_name: 'My Biz', currency: 'USD', timezone: 'America/New_York' },
          ],
        }),
      });

      const accounts = await api.getAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toEqual({
        id: 'abc123',
        name: 'My Account',
        business_name: 'My Biz',
        currency: 'USD',
        timezone: 'America/New_York',
      });
    });

    it('returns empty array when no data', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const accounts = await api.getAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('fetches campaigns for an account', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'c1', name: 'Campaign 1', funding_instrument_id: 'fi1',
              daily_budget_amount_local: '50.00', entity_status: 'ACTIVE',
              started_at: '2024-01-01T00:00:00Z', ended_at: null,
            },
          ],
        }),
      });

      const campaigns = await api.getCampaigns('abc123');

      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].id).toBe('c1');
      expect(campaigns[0].name).toBe('Campaign 1');
      expect(campaigns[0].entity_status).toBe('ACTIVE');
      expect(campaigns[0].daily_budget_amount_local).toBe('50.00');
    });

    it('passes cursor and count params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.getCampaigns('abc123', { cursor: 'next123', count: 50 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('cursor=next123');
      expect(url).toContain('count=50');
    });

    it('returns empty array when no data', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const campaigns = await api.getCampaigns('abc123');
      expect(campaigns).toEqual([]);
    });
  });

  describe('getCampaignStats', () => {
    it('fetches engagement stats with default date range', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'c1',
              impressions: '10000',
              clicks: '500',
              spend_local_micro: '50000000',
              conversions: '25',
              follows: '10',
              impressions_organic: '8000',
              billed_charge_local_micro: '45000000',
            },
          ],
        }),
      });

      const stats = await api.getCampaignStats('abc123', { campaignIds: ['c1'] });

      expect(stats).toHaveLength(1);
      expect(stats[0].impressions).toBe(10000);
      expect(stats[0].clicks).toBe(500);
      expect(stats[0].spend).toBe(50);
      expect(stats[0].conversions).toBe(25);
      expect(stats[0].follows).toBe(10);
      expect(stats[0].impressions_organic).toBe(8000);
      expect(stats[0].billed_charge_local_micro).toBe(45);
    });

    it('passes metric_groups, date range, and granularity', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.getCampaignStats('abc123', {
        campaignIds: ['c1'],
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        granularity: 'DAY',
      });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('metric_groups=ENGAGEMENT');
      expect(url).toContain('start_time=2024-01-01');
      expect(url).toContain('end_time=2024-01-31');
      expect(url).toContain('granularity=DAY');
      expect(url).toContain('entity_ids=c1');
    });

    it('converts micro-spend to currency units', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'c1', spend_local_micro: '1000000', billed_charge_local_micro: '500000' }],
        }),
      });

      const stats = await api.getCampaignStats('abc123', {});
      expect(stats[0].spend).toBe(1);
      expect(stats[0].billed_charge_local_micro).toBe(0.5);
    });
  });

  describe('getLineItems', () => {
    it('fetches line items for an account and campaign', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'li1', name: 'Line Item 1', campaign_id: 'c1' }],
        }),
      });

      const lineItems = await api.getLineItems('abc123', 'c1');

      expect(lineItems).toHaveLength(1);
      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('campaign_ids=c1');
    });

    it('returns empty array when no data', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const lineItems = await api.getLineItems('abc123');
      expect(lineItems).toEqual([]);
    });
  });

  describe('createCampaign', () => {
    it('creates a campaign with all fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'new1', name: 'New Campaign', entity_status: 'ACTIVE' },
        }),
      });

      const result = await api.createCampaign('abc123', {
        name: 'New Campaign',
        fundingInstrumentId: 'fi1',
        dailyBudget: 100,
        status: 'ACTIVE',
        startedAt: '2024-06-01T00:00:00Z',
      });

      expect(result).toEqual({
        campaignId: 'new1',
        name: 'New Campaign',
        entity_status: 'ACTIVE',
      });

      const callBody = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(callBody.name).toBe('New Campaign');
      expect(callBody.funding_instrument_id).toBe('fi1');
      expect(callBody.daily_budget_amount_local).toBe('100');
      expect(callBody.entity_status).toBe('ACTIVE');
      expect(callBody.started_at).toBe('2024-06-01T00:00:00Z');
    });

    it('creates a campaign with minimal fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'new2', name: 'Minimal', entity_status: 'ACTIVE' },
        }),
      });

      const result = await api.createCampaign('abc123', { name: 'Minimal' });

      expect(result.campaignId).toBe('new2');
      const callBody = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(callBody.name).toBe('Minimal');
      expect(callBody.entity_status).toBe('ACTIVE');
      expect(callBody.funding_instrument_id).toBeUndefined();
      expect(callBody.daily_budget_amount_local).toBeUndefined();
    });
  });

  describe('updateCampaign', () => {
    it('updates campaign fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'c1', name: 'Updated', entity_status: 'PAUSED' },
        }),
      });

      const result = await api.updateCampaign('abc123', 'c1', {
        name: 'Updated',
        status: 'PAUSED',
        dailyBudget: 200,
      });

      expect(result).toEqual({
        campaignId: 'c1',
        name: 'Updated',
        entity_status: 'PAUSED',
      });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'twitter',
        expect.stringContaining('/accounts/abc123/campaigns/c1'),
        expect.objectContaining({ method: 'PUT' })
      );

      const callBody = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(callBody.name).toBe('Updated');
      expect(callBody.entity_status).toBe('PAUSED');
      expect(callBody.daily_budget_amount_local).toBe('200');
    });

    it('sends only provided fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { id: 'c1', name: 'Renamed', entity_status: 'ACTIVE' },
        }),
      });

      await api.updateCampaign('abc123', 'c1', { name: 'Renamed' });

      const callBody = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(callBody).toEqual({ name: 'Renamed' });
      expect(callBody.entity_status).toBeUndefined();
      expect(callBody.daily_budget_amount_local).toBeUndefined();
    });
  });

  describe('getTargetingCriteria', () => {
    it('fetches targeting criteria for an account', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'tc1', name: 'Location', targeting_type: 'LOCATION' }],
        }),
      });

      const criteria = await api.getTargetingCriteria('abc123');

      expect(criteria).toHaveLength(1);
      expect(criteria[0].targeting_type).toBe('LOCATION');
      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('account_id=abc123');
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs data for all accounts', async () => {
      // First call: getAccounts
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'abc123', name: 'Account 1', business_name: 'Biz', currency: 'USD', timezone: 'UTC' }],
        }),
      });
      // Second call: getCampaigns
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'c1', name: 'Campaign 1', entity_status: 'ACTIVE' }],
        }),
      });
      // Third call: getCampaignStats
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'c1', impressions: '1000', clicks: '50', spend_local_micro: '10000000', conversions: '5' }],
        }),
      });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('abc123');
      expect(results[0].campaigns).toHaveLength(1);
      expect(results[0].campaigns[0].id).toBe('c1');
      expect(results[0].insights).toHaveLength(1);
      expect(results[0].insights[0].spend).toBe(10);
      expect(results[0].syncedAt).toBeDefined();
    });

    it('handles empty accounts list', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const results = await api.syncAllAccounts();
      expect(results).toEqual([]);
    });

    it('handles errors gracefully for individual accounts', async () => {
      // getAccounts returns one account
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'abc123', name: 'Account 1', business_name: 'Biz', currency: 'USD', timezone: 'UTC' }],
        }),
      });
      // getCampaigns throws
      mockSafeFetch.mockRejectedValueOnce(new Error('API Error'));

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('abc123');
      expect(results[0].error).toBe('API Error');
      expect(results[0].syncedAt).toBeDefined();
    });

    it('skips insights when no campaigns exist', async () => {
      // getAccounts
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'abc123', name: 'Account 1', business_name: 'Biz', currency: 'USD', timezone: 'UTC' }],
        }),
      });
      // getCampaigns returns empty
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].campaigns).toEqual([]);
      expect(results[0].insights).toEqual([]);
      // Only 2 calls made (accounts + campaigns), no stats call
      expect(mockSafeFetch).toHaveBeenCalledTimes(2);
    });
  });
});
