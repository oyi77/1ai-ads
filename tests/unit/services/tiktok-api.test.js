import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TikTokAdsAPI } from '../../../server/services/tiktok-api.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('TikTokAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;

    mockSettingsRepo = {
      getCredentials: vi.fn(),
    };

    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test-tiktok-token',
    });

    api = new TikTokAdsAPI(mockSettingsRepo);

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
      expect(token).toBe('test-tiktok-token');
      expect(mockSettingsRepo.getCredentials).toHaveBeenCalledWith('tiktok');
    });

    it('throws error when no access token configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({});
      expect(() => api._getToken()).toThrow('TikTok access token not configured');
    });

    it('throws error when credentials are null', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('TikTok access token not configured');
    });
  });

  describe('_get', () => {
    it('makes GET request with access token header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api._get('/test', { param1: 'value1' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'tiktok',
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: { 'Access-Token': 'test-tiktok-token' },
        })
      );
    });

    it('includes query parameters in URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api._get('/campaign/get/', {
        advertiser_id: '123',
        page: 1,
        page_size: 50,
      });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('advertiser_id=123');
      expect(url).toContain('page=1');
      expect(url).toContain('page_size=50');
    });

    it('converts object parameters to JSON strings', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api._get('/test', { filter: { type: 'active' } });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('filter=');
    });

    it('returns data from response', async () => {
      const mockData = { list: [{ id: '1', name: 'Campaign 1' }] };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockData }),
      });

      const result = await api._get('/test');

      expect(result).toEqual(mockData);
    });

    it('handles empty response', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });

      const result = await api._get('/test');

      expect(result).toBeNull();
    });
  });

  describe('getAdvertiserInfo', () => {
    it('includes advertiser_id and fields in query', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getAdvertiserInfo('123456');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('advertiser_ids=%5B%22123456%22%5D'); // URL encoded array
      expect(url).toContain('fields=');
    });

    it('returns advertiser info', async () => {
      const mockAdvertiser = { advertiser_id: '123456', name: 'Test Advertiser', status: 'ACTIVE' };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [mockAdvertiser] } }),
      });

      const result = await api.getAdvertiserInfo('123456');

      expect(result).toEqual({ list: [mockAdvertiser] });
    });
  });

  describe('getCampaigns', () => {
    it('includes advertiser_id and fields in query', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaigns('123');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('advertiser_id=123');
      expect(url).toContain('fields=');
    });

    it('uses default pagination', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaigns('123');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('page=1');
      expect(url).toContain('page_size=50');
    });

    it('uses custom pagination when provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaigns('123', { page: 2, pageSize: 100 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=100');
    });

    it('returns campaigns list', async () => {
      const mockCampaigns = {
        list: [
          { campaign_id: '1', campaign_name: 'Campaign 1', status: 'ENABLED' },
          { campaign_id: '2', campaign_name: 'Campaign 2', status: 'DISABLED' },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaigns }),
      });

      const result = await api.getCampaigns('123');

      expect(result).toEqual(mockCampaigns);
    });
  });

  describe('getCampaignInsights', () => {
    it('includes campaign_ids filter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaignInsights('123', ['1', '2']);

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('campaign_ids');
    });

    it('uses default date range (last 30 days)', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaignInsights('123', ['1']);

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('start_date=');
      expect(url).toContain('end_date=');
    });

    it('uses custom date range when provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getCampaignInsights('123', ['1'], {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('start_date=2024-01-01');
      expect(url).toContain('end_date=2024-01-31');
    });

    it('returns insights list', async () => {
      const mockInsights = {
        list: [
          {
            dimensions: { campaign_id: '1' },
            metrics: { spend: 100, impressions: 1000, clicks: 50, conversions: 5 },
          },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockInsights }),
      });

      const result = await api.getCampaignInsights('123', ['1']);

      expect(result).toEqual(mockInsights);
    });
  });

  describe('getAds', () => {
    it('includes all required fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getAds('123');

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('fields=');
    });

    it('includes advertiser_id and pagination', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { list: [] } }),
      });

      await api.getAds('123', { page: 2, pageSize: 100 });

      const url = mockSafeFetch.mock.calls[0][1];
      expect(url).toContain('advertiser_id=123');
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=100');
    });

    it('returns ads list', async () => {
      const mockAds = {
        list: [
          { ad_id: '1', ad_name: 'Ad 1', status: 'ENABLED' },
          { ad_id: '2', ad_name: 'Ad 2', status: 'DISABLED' },
        ],
      };
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockAds }),
      });

      const result = await api.getAds('123');

      expect(result).toEqual(mockAds);
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs data for multiple advertisers', async () => {
      const mockCampaigns = { list: [{ campaign_id: '1', campaign_name: 'Campaign 1', status: 'ENABLED' }] };
      const mockInsights = { list: [{ dimensions: { campaign_id: '1' }, metrics: { spend: 100, impressions: 1000, clicks: 50, conversions: 5 } }] };

      mockSafeFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: mockCampaigns }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: mockInsights }) });

      const results = await api.syncAllAccounts(['123']);

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('123');
      expect(results[0].campaigns).toHaveLength(1);
      expect(results[0].insights).toHaveLength(1);
    });

    it('handles errors gracefully', async () => {
      mockSafeFetch.mockRejectedValue(new Error('API Error'));

      const results = await api.syncAllAccounts(['123']);

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('123');
      expect(results[0].error).toBe('API Error');
    });
  });
});
