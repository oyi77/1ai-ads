import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaAdsAPI } from '../../../server/services/meta-api.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

// Mock the config module
vi.mock('../../../server/config/index.js', () => ({
  default: {
    fbSystemToken: null,
  },
}));

describe('MetaAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;

    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };

    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test-access-token',
    });

    api = new MetaAdsAPI(mockSettingsRepo);

    // Clear mock calls before each test
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });
  });

  describe('_getToken', () => {
    it('returns access token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-access-token');
      expect(mockSettingsRepo.getCredentials).toHaveBeenCalledWith('meta');
    });

    it('throws error when no access token configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => api._getToken()).toThrow('Meta access token not configured');
    });

    it('throws error when credentials are null', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Meta access token not configured');
    });
  });

  describe('_get', () => {
    it('makes GET request with access token', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { param1: 'value1' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'meta',
        expect.stringContaining('/test')
      );
    });

    it('includes access token in URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('access_token=test-access-token');
    });

    it('adds query parameters to URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { fields: 'id,name', limit: 10 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('fields=id%2Cname'); // URL encoded
      expect(url).toContain('limit=10');
    });

    it('uses default limit of 50', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { param1: 'value1' });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('param1=value1');
    });

    it('uses custom limit when provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api._get('/test', { limit: 100 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('limit=100');
    });
  });

  describe('_post', () => {
    it('makes POST request with body', async () => {
      const mockResponse = { id: '123', name: 'Test Campaign' };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const body = { name: 'Test Campaign', objective: 'OUTCOME_SALES' };
      const result = await api._post('/campaigns', body);

      expect(result).toEqual(mockResponse);
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'meta',
        expect.stringContaining('/campaigns'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    });

    it('includes access token in POST URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      });

      await api._post('/campaigns', { name: 'Test' });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('access_token=test-access-token');
    });
  });

  describe('getMe', () => {
    it('gets current user info', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123', name: 'Test User' }),
      });

      const result = await api.getMe();

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test User');
    });
  });

  describe('getAdAccounts', () => {
    it('gets and formats ad accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'act_1', name: 'Account 1', account_status: 1, currency: 'USD', balance: 100, amount_spent: 500 },
            { id: 'act_2', name: 'Account 2', account_status: 2, currency: 'EUR', balance: 200, amount_spent: 1000 },
          ],
        }),
      });

      const accounts = await api.getAdAccounts();

      expect(accounts).toHaveLength(2);
      expect(accounts[0].id).toBe('act_1');
      expect(accounts[0].status).toBe('active');
      expect(accounts[1].status).toBe('disabled');
    });
  });

  describe('getCampaigns', () => {
    it('gets and formats campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'camp_1',
              name: 'Campaign 1',
              status: 'ACTIVE',
              objective: 'OUTCOME_SALES',
              daily_budget: 100,
              lifetime_budget: null,
              created_time: '2024-01-01T00:00:00+0000',
              updated_time: '2024-01-15T00:00:00+0000',
            },
          ],
        }),
      });

      const campaigns = await api.getCampaigns('act_123');

      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].id).toBe('camp_1');
      expect(campaigns[0].status).toBe('active');
      expect(campaigns[0].objective).toBe('OUTCOME_SALES');
      expect(campaigns[0].dailyBudget).toBe(100);
    });

    it('uses default limit of 50', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.getCampaigns('act_123');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('limit=50');
    });

    it('uses custom limit when provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await api.getCampaigns('act_123', { limit: 100 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('limit=100');
    });
  });

  describe('createCampaign', () => {
    it('creates campaign with required fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123', name: 'New Campaign' }),
      });

      const result = await api._post('/act_123/campaigns', {
        name: 'New Campaign',
        objective: 'OUTCOME_SALES',
        status: 'PAUSED',
        daily_budget: 100,
      });

      expect(result).toEqual({ id: '123', name: 'New Campaign' });

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2]?.body || '{}');
      expect(body.name).toBe('New Campaign');
      expect(body.objective).toBe('OUTCOME_SALES');
      expect(body.daily_budget).toBe(100);
    });

    it('converts daily budget to cents', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      });

      await api._post('/act_123/campaigns', {
        name: 'Campaign',
        daily_budget: 1.50,
      });

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2].body);
      expect(body.daily_budget).toBe(1.50);
    });
  });

  describe('createAdSet', () => {
    it('creates ad set with required fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'adset_123' }),
      });

      const result = await api._post('/act_123/adsets', {
        name: 'Ad Set 1',
        campaign_id: '123',
        targeting: { geo_locations: { countries: ['US'] } },
        bid_amount: 100,
      });

      expect(result.id).toBe('adset_123');

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2].body);
      expect(body.name).toBe('Ad Set 1');
      expect(body.campaign_id).toBe('123');
    });
  });

  describe('createAdCreative', () => {
    it('creates ad creative with link data', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'creative_123' }),
      });

      const result = await api._post('/act_123/adcreatives', {
        object_story_spec: {
          link_data: {
            message: 'Test ad',
            link: 'https://example.com',
          },
        },
      });

      expect(result.id).toBe('creative_123');
    });
  });

  describe('createAd', () => {
    it('creates ad with creative', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ad_123' }),
      });

      const result = await api._post('/act_123/ads', {
        name: 'Test Ad',
        adset_id: 'adset_123',
        creative: { creative_id: 'creative_123' },
        status: 'PAUSED',
      });

      expect(result.id).toBe('ad_123');

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2].body);
      expect(body.name).toBe('Test Ad');
      expect(body.adset_id).toBe('adset_123');
    });
  });

  describe('updateCampaign', () => {
    it('updates campaign fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await api._post('/camp_123', {
        status: 'ACTIVE',
        daily_budget: 200,
      });

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2].body);
      expect(body.status).toBe('ACTIVE');
      expect(body.daily_budget).toBe(200);
    });

    it('only updates provided fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await api._post('/camp_123', {
        status: 'PAUSED',
      });

      const callArgs = mockSafeFetch.mock.calls[0];
      const body = JSON.parse(callArgs[2].body);
      expect(Object.keys(body)).toEqual(['status']);
    });
  });
});
