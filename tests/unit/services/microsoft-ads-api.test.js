import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MicrosoftAdsAPI } from '../../../server/services/microsoft/index.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('MicrosoftAdsAPI', () => {
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
    });

    api = new MicrosoftAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('sets platform name to microsoft', () => {
      expect(api.platformName).toBe('microsoft');
    });

    it('sets base URL', () => {
      expect(api._baseUrl).toBe('https://ads.microsoft.com/api/v13');
    });
  });

  describe('_getToken', () => {
    it('returns oauth_token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-oauth-token');
    });

    it('returns explicit token when set', () => {
      api.setActiveAccount('123', 'explicit-token');
      expect(api._getToken()).toBe('explicit-token');
    });

    it('throws when oauth_token not configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({
        developer_token: 'test-dev-token',
      });

      expect(() => api._getToken()).toThrow('Microsoft Ads OAuth token not configured');
    });

    it('throws when settingsRepo has no credentials', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);

      expect(() => api._getToken()).toThrow('Microsoft Ads OAuth token not configured');
    });
  });

  describe('_getDevToken', () => {
    it('returns developer_token from settings repo', () => {
      const token = api._getDevToken();
      expect(token).toBe('test-dev-token');
    });

    it('throws when developer_token not configured', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({
        oauth_token: 'test-oauth-token',
      });

      expect(() => api._getDevToken()).toThrow('Microsoft Ads developer token not configured');
    });
  });

  describe('_buildHeaders', () => {
    it('includes Authorization and developer token headers', () => {
      const headers = api._buildHeaders('12345');
      expect(headers['Authorization']).toBe('Bearer test-oauth-token');
      expect(headers['Microsoft-Ads-Developer-Token']).toBe('test-dev-token');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('includes CustomerId header when accountId provided', () => {
      const headers = api._buildHeaders('99999');
      expect(headers['CustomerId']).toBe('99999');
    });

    it('uses activeAccountId when no explicit accountId', () => {
      api._activeAccountId = '77777';
      const headers = api._buildHeaders();
      expect(headers['CustomerId']).toBe('77777');
    });

    it('explicit accountId overrides activeAccountId', () => {
      api._activeAccountId = '77777';
      const headers = api._buildHeaders('99999');
      expect(headers['CustomerId']).toBe('99999');
    });
  });

  describe('listAccounts', () => {
    it('returns list of accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AccountInfo: [
            { Id: '111', Name: 'Account One', Number: 'F111', AccountLifeCycleStatus: 'Active' },
            { Id: '222', Name: 'Account Two', Number: 'F222', AccountLifeCycleStatus: 'Active' },
          ],
        }),
      });

      const result = await api.listAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('111');
      expect(result[0].name).toBe('Account One');
      expect(result[1].id).toBe('222');
    });

    it('handles empty AccountInfo', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AccountInfo: [] }),
      });

      const result = await api.listAccounts();
      expect(result).toEqual([]);
    });

    it('calls correct endpoint', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AccountInfo: [] }),
      });

      await api.listAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('/CustomerManagement/GetAccountsInfo'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getCampaigns', () => {
    it('returns campaigns for an account', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          Campaigns: [
            { Id: '100', Name: 'Search Campaign', Status: 'Active', DailyBudget: 50, CampaignType: 'Search', BidStrategyType: 'ManualCpc' },
            { Id: '200', Name: 'Shopping Campaign', Status: 'Paused', DailyBudget: 100, CampaignType: 'Shopping' },
          ],
        }),
      });

      const result = await api.getCampaigns('111');

      expect(result).toHaveLength(2);
      expect(result[0].Id).toBe('100');
      expect(result[0].Name).toBe('Search Campaign');
      expect(result[1].Id).toBe('200');
    });

    it('sends CustomerId header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Campaigns: [] }),
      });

      await api.getCampaigns('555');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'CustomerId': '555',
          }),
        })
      );
    });

    it('posts to correct endpoint', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Campaigns: [] }),
      });

      await api.getCampaigns('111');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('/Campaigns/GetByCondition'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('filters out Deleted campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Campaigns: [] }),
      });

      await api.getCampaigns('111');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.Predicates).toContainEqual(
        expect.objectContaining({ Field: 'Status', Operator: 'NotEquals', Values: ['Deleted'] })
      );
    });

    it('handles CampaignValues fallback', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          CampaignValues: [{ Id: '300', Name: 'Alt Format' }],
        }),
      });

      const result = await api.getCampaigns('111');
      expect(result).toHaveLength(1);
      expect(result[0].Id).toBe('300');
    });
  });

  describe('getCampaignPerformance', () => {
    it('returns performance data from inline rows', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          Rows: [
            { CampaignId: '100', CampaignName: 'Search', Impressions: '5000', Clicks: '250', Spend: '125.50', Conversions: '10', Ctr: '5.0', AverageCpc: '0.50' },
          ],
        }),
      });

      const result = await api.getCampaignPerformance('111');

      expect(result).toHaveLength(1);
      expect(result[0].CampaignId).toBe('100');
      expect(result[0].Impressions).toBe('5000');
    });

    it('submits report request with custom days', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Rows: [] }),
      });

      await api.getCampaignPerformance('111', { days: 7 });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.ReportRequest.ReportType).toBe('CampaignPerformanceReport');
      expect(body.ReportRequest.Scope.AccountIds).toEqual(['111']);
    });

    it('defaults to 30 days', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Rows: [] }),
      });

      await api.getCampaignPerformance('111');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      const { CustomDateRangeEnd: end, CustomDateRangeStart: start } = body.ReportRequest.Time;
      const diff = new Date(end.Year, end.Month - 1, end.Day) - new Date(start.Year, start.Month - 1, start.Day);
      expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('follows download URL when ReportDownloadUrl present', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ReportDownloadUrl: 'https://report.download/data.json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Rows: [{ CampaignId: '100', Impressions: '999' }] }),
        });

      const result = await api.getCampaignPerformance('111');

      expect(mockSafeFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].Impressions).toBe('999');
    });
  });

  describe('createCampaign', () => {
    it('creates a campaign and returns id', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ CampaignIds: ['500'] }),
      });

      const result = await api.createCampaign('111', {
        name: 'New Campaign',
        dailyBudget: 75,
        campaignType: 'SEARCH',
        status: 'Paused',
      });

      expect(result.campaignId).toBe('500');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.Campaigns[0].Name).toBe('New Campaign');
      expect(body.Campaigns[0].DailyBudget).toBe(75);
      expect(body.Campaigns[0].CampaignType).toBe('SEARCH');
      expect(body.Campaigns[0].Status).toBe('Paused');
    });

    it('posts to Campaigns/Add with CustomerId header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ CampaignIds: ['501'] }),
      });

      await api.createCampaign('222', { name: 'Test' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('/Campaigns/Add'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'CustomerId': '222' }),
        })
      );
    });

    it('defaults campaignType to SEARCH', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ CampaignIds: ['502'] }),
      });

      await api.createCampaign('111', { name: 'Default Type' });

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.Campaigns[0].CampaignType).toBe('SEARCH');
    });
  });

  describe('updateCampaign', () => {
    it('sends update with merged fields', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await api.updateCampaign('111', '100', { Name: 'Renamed', Status: 'Paused' });

      expect(result.campaignId).toBe('100');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.Campaigns[0].Id).toBe('100');
      expect(body.Campaigns[0].Name).toBe('Renamed');
      expect(body.Campaigns[0].Status).toBe('Paused');
    });

    it('posts to Campaigns/Update', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.updateCampaign('111', '100', { Name: 'X' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('/Campaigns/Update'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getAdGroups', () => {
    it('returns ad groups for a campaign', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AdGroups: [
            { Id: '10', Name: 'Ad Group 1', Status: 'Active', CpcBid: 0.75 },
          ],
        }),
      });

      const result = await api.getAdGroups('111', '100');

      expect(result).toHaveLength(1);
      expect(result[0].Id).toBe('10');
      expect(result[0].Name).toBe('Ad Group 1');
    });

    it('filters by campaign id', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AdGroups: [] }),
      });

      await api.getAdGroups('111', '100');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.Predicates).toContainEqual(
        expect.objectContaining({ Field: 'CampaignId', Operator: 'Equals', Values: ['100'] })
      );
    });
  });

  describe('getKeywords', () => {
    it('returns keywords for an ad group', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          Keywords: [
            { Id: '1', Text: 'buy shoes', Status: 'Active', Bid: 1.5, MatchType: 'Broad' },
            { Id: '2', Text: 'running shoes', Status: 'Active', Bid: 2.0, MatchType: 'Phrase' },
          ],
        }),
      });

      const result = await api.getKeywords('111', '10');

      expect(result).toHaveLength(2);
      expect(result[0].Text).toBe('buy shoes');
      expect(result[1].MatchType).toBe('Phrase');
    });

    it('posts to Keywords/GetByAdGroupId', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Keywords: [] }),
      });

      await api.getKeywords('111', '10');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('/Keywords/GetByAdGroupId'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"AdGroupId":"10"'),
        })
      );
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all accounts with campaigns and performance', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            AccountInfo: [{ Id: '111', Name: 'Account One', Number: 'F111' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            Campaigns: [
              { Id: '100', Name: 'Search', Status: 'Active', DailyBudget: 50, CampaignType: 'Search' },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            Rows: [
              { CampaignId: '100', Impressions: '10000', Clicks: '500', Spend: '250', Conversions: '10', Ctr: '5.0', AverageCpc: '0.50' },
            ],
          }),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('111');
      expect(result[0].campaigns).toHaveLength(1);
      expect(result[0].campaigns[0].id).toBe('100');
      expect(result[0].campaigns[0].name).toBe('Search');
      expect(result[0].campaigns[0].budget).toBe(50);
      expect(result[0].insights).toHaveLength(1);
      expect(result[0].insights[0].campaign_id).toBe('100');
      expect(result[0].insights[0].impressions).toBe(10000);
      expect(result[0].insights[0].clicks).toBe(500);
      expect(result[0].insights[0].spend).toBe(250);
      expect(result[0].insights[0].conversions).toBe(10);
      expect(result[0].syncedAt).toBeDefined();
    });

    it('handles errors for individual accounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            AccountInfo: [{ Id: '111', Name: 'Account One' }],
          }),
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('111');
      expect(result[0].error).toBe('API Error');
      expect(result[0].syncedAt).toBeDefined();
    });

    it('returns empty array when no accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AccountInfo: [] }),
      });

      const result = await api.syncAllAccounts();
      expect(result).toEqual([]);
    });
  });

  describe('_mapCampaign', () => {
    it('maps raw campaign to normalized format', () => {
      const mapped = api._mapCampaign({
        Id: '100', Name: 'Test', Status: 'Active', DailyBudget: 50, CampaignType: 'Search', BidStrategyType: 'ManualCpc',
      });
      expect(mapped.id).toBe('100');
      expect(mapped.name).toBe('Test');
      expect(mapped.status).toBe('active');
      expect(mapped.budget).toBe(50);
      expect(mapped.campaignType).toBe('Search');
      expect(mapped.bidStrategyType).toBe('ManualCpc');
    });

    it('lowercases status', () => {
      const mapped = api._mapCampaign({ Status: 'Paused' });
      expect(mapped.status).toBe('paused');
    });

    it('handles missing status', () => {
      const mapped = api._mapCampaign({});
      expect(mapped.status).toBe('');
    });
  });

  describe('_mapPerformance', () => {
    it('maps raw performance to numeric values', () => {
      const mapped = api._mapPerformance({
        CampaignId: '100', Impressions: '5000', Clicks: '250', Spend: '125.50', Conversions: '10', Ctr: '5.0', AverageCpc: '0.50',
      });
      expect(mapped.campaign_id).toBe('100');
      expect(mapped.impressions).toBe(5000);
      expect(mapped.clicks).toBe(250);
      expect(mapped.spend).toBe(125.5);
      expect(mapped.conversions).toBe(10);
      expect(mapped.ctr).toBe(5.0);
      expect(mapped.cpc).toBe(0.5);
    });

    it('defaults to 0 for missing values', () => {
      const mapped = api._mapPerformance({});
      expect(mapped.impressions).toBe(0);
      expect(mapped.clicks).toBe(0);
      expect(mapped.spend).toBe(0);
      expect(mapped.conversions).toBe(0);
    });
  });

  describe('API call structure', () => {
    it('uses correct base URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AccountInfo: [] }),
      });

      await api.listAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.stringContaining('https://ads.microsoft.com/api/v13'),
        expect.any(Object)
      );
    });

    it('includes Authorization header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ AccountInfo: [] }),
      });

      await api.listAccounts();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'microsoft',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-oauth-token',
            'Microsoft-Ads-Developer-Token': 'test-dev-token',
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

    it('throws ConfigurationError when credentials missing', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);

      expect(() => api._getToken()).toThrow();
      expect(() => api._getDevToken()).toThrow();
    });
  });
});
