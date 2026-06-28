import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnapchatAdsAPI } from '../../../server/services/snapchat/index.js';

// Mock the safeFetch function
vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('SnapchatAdsAPI', () => {
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
      access_token: 'test-access-token',
    });

    api = new SnapchatAdsAPI(mockSettingsRepo);
  });

  describe('constructor', () => {
    it('accepts settingsRepo', () => {
      expect(api.settingsRepo).toBe(mockSettingsRepo);
    });

    it('sets platform name to snapchat', () => {
      expect(api.platformName).toBe('snapchat');
    });

    it('sets correct base URL', () => {
      expect(api._baseUrl).toBe('https://adsapi.snapchat.com/v1');
    });
  });

  describe('_getToken', () => {
    it('returns access_token from settings repo', () => {
      const token = api._getToken();
      expect(token).toBe('test-access-token');
    });

    it('returns explicit token when set', () => {
      api.setActiveAccount('acc1', 'explicit-token');
      expect(api._getToken()).toBe('explicit-token');
    });

    it('prefers explicit token over settings repo', () => {
      api.setActiveAccount('acc1', 'explicit-token');
      expect(api._getToken()).toBe('explicit-token');
      expect(mockSettingsRepo.getCredentials).not.toHaveBeenCalled();
    });

    it('throws ConfigurationError when no token available', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      expect(() => api._getToken()).toThrow('Snapchat access token not configured');
    });

    it('throws ConfigurationError when credentials missing access_token', () => {
      mockSettingsRepo.getCredentials.mockReturnValue({ refresh_token: 'abc' });
      expect(() => api._getToken()).toThrow('Snapchat access token not configured');
    });
  });

  describe('_authHeaders', () => {
    it('returns Bearer token header', () => {
      expect(api._authHeaders()).toEqual({ 'Authorization': 'Bearer test-access-token' });
    });
  });

  describe('getOrganizations', () => {
    it('returns mapped organizations', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          organizations: [
            { id: 'org-1', name: 'Acme Corp' },
            { id: 'org-2', name: 'Beta Inc' },
          ],
        }),
      });

      const result = await api.getOrganizations();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'org-1', name: 'Acme Corp' });
      expect(result[1]).toEqual({ id: 'org-2', name: 'Beta Inc' });
    });

    it('handles empty organizations', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ organizations: [] }),
      });

      const result = await api.getOrganizations();
      expect(result).toEqual([]);
    });

    it('handles missing organizations key', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await api.getOrganizations();
      expect(result).toEqual([]);
    });

    it('calls correct endpoint with auth', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ organizations: [] }),
      });

      await api.getOrganizations();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        'https://adsapi.snapchat.com/v1/me/organizations',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token',
          }),
        })
      );
    });
  });

  describe('getAdAccounts', () => {
    it('returns mapped ad accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ad_accounts: [
            { id: 'acc-1', name: 'Account 1', currency: 'USD', status: 'ACTIVE' },
            { id: 'acc-2', name: 'Account 2', currency: 'EUR', status: 'PAUSED' },
          ],
        }),
      });

      const result = await api.getAdAccounts('org-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'acc-1', name: 'Account 1', currency: 'USD', status: 'ACTIVE' });
    });

    it('includes orgId in request URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ad_accounts: [] }),
      });

      await api.getAdAccounts('org-123');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        'https://adsapi.snapchat.com/v1/organizations/org-123/adaccounts',
        expect.any(Object)
      );
    });

    it('handles empty ad accounts', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ad_accounts: [] }),
      });

      const result = await api.getAdAccounts('org-1');
      expect(result).toEqual([]);
    });
  });

  describe('getCampaigns', () => {
    it('returns mapped campaigns', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          campaigns: [
            {
              campaign: {
                id: 'camp-1',
                name: 'Summer Sale',
                status: 'ACTIVE',
                daily_budget_micro: 50000000,
                type: 'SNAP_ADS',
              },
            },
          ],
        }),
      });

      const result = await api.getCampaigns('acc-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('camp-1');
      expect(result[0].name).toBe('Summer Sale');
      expect(result[0].status).toBe('ACTIVE');
      expect(result[0].daily_budget_micro).toBe(50000000);
    });

    it('uses default fields parameter', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaigns: [] }),
      });

      await api.getCampaigns('acc-1');

      const callUrl = mockSafeFetch.mock.calls[0][1];
      expect(callUrl).toContain('fields=id%2Cname%2Cstatus%2Cdaily_budget_micro%2Ctype');
    });

    it('uses custom fields when provided', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaigns: [] }),
      });

      await api.getCampaigns('acc-1', { fields: ['id', 'name'] });

      const callUrl = mockSafeFetch.mock.calls[0][1];
      expect(callUrl).toContain('fields=id%2Cname');
    });
  });

  describe('getCampaignStats', () => {
    it('returns campaign stats', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          stats: {
            impressions: 50000,
            swipes: 2500,
            spend: 1500000,
            conversions: 120,
          },
        }),
      });

      const result = await api.getCampaignStats('acc-1', 'camp-1');

      expect(result.impressions).toBe(50000);
      expect(result.swipes).toBe(2500);
      expect(result.spend).toBe(1500000);
      expect(result.conversions).toBe(120);
    });

    it('defaults missing stats to zero', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ stats: {} }),
      });

      const result = await api.getCampaignStats('acc-1', 'camp-1');

      expect(result.impressions).toBe(0);
      expect(result.swipes).toBe(0);
      expect(result.spend).toBe(0);
      expect(result.conversions).toBe(0);
    });

    it('passes date range parameters', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ stats: {} }),
      });

      await api.getCampaignStats('acc-1', 'camp-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        granularity: 'DAY',
      });

      const callUrl = mockSafeFetch.mock.calls[0][1];
      expect(callUrl).toContain('start_time=2026-01-01');
      expect(callUrl).toContain('end_time=2026-01-31');
      expect(callUrl).toContain('granularity=DAY');
    });

    it('calls correct endpoint', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ stats: {} }),
      });

      await api.getCampaignStats('acc-1', 'camp-1');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        expect.stringContaining('/adaccounts/acc-1/campaigns/camp-1/stats'),
        expect.any(Object)
      );
    });
  });

  describe('getAdSquads', () => {
    it('returns ad squads', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          adsquads: [
            { id: 'sq-1', name: 'Squad 1', status: 'ACTIVE' },
            { id: 'sq-2', name: 'Squad 2', status: 'PAUSED' },
          ],
        }),
      });

      const result = await api.getAdSquads('acc-1', 'camp-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sq-1');
    });

    it('returns empty array when no ad squads', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await api.getAdSquads('acc-1', 'camp-1');
      expect(result).toEqual([]);
    });
  });

  describe('createCampaign', () => {
    it('creates a campaign with required params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          campaigns: [{ id: 'new-camp-1', name: 'New Campaign' }],
        }),
      });

      const result = await api.createCampaign('acc-1', { name: 'New Campaign' });

      expect(result.id).toBe('new-camp-1');
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        'https://adsapi.snapchat.com/v1/adaccounts/acc-1/campaigns',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            campaigns: [{
              name: 'New Campaign',
              status: 'PAUSED',
              daily_budget_micro: undefined,
              objective_type: 'SWIPES',
            }],
          }),
        })
      );
    });

    it('creates a campaign with all params', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          campaigns: [{ id: 'new-camp-2' }],
        }),
      });

      const result = await api.createCampaign('acc-1', {
        name: 'Install Campaign',
        status: 'ACTIVE',
        daily_budget_micro: 100000000,
        objective: 'APP_INSTALLS',
      });

      expect(result.id).toBe('new-camp-2');

      const body = JSON.parse(mockSafeFetch.mock.calls[0][2].body);
      expect(body.campaigns[0].status).toBe('ACTIVE');
      expect(body.campaigns[0].daily_budget_micro).toBe(100000000);
      expect(body.campaigns[0].objective_type).toBe('APP_INSTALLS');
    });

    it('includes auth headers', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ campaigns: [{}] }),
      });

      await api.createCampaign('acc-1', { name: 'Test' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('updateCampaign', () => {
    it('sends PUT request with updates', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          campaigns: [{ id: 'camp-1', name: 'Updated' }],
        }),
      });

      const result = await api.updateCampaign('acc-1', 'camp-1', { name: 'Updated', status: 'ACTIVE' });

      expect(result.id).toBe('camp-1');
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        'https://adsapi.snapchat.com/v1/adaccounts/acc-1/campaigns/camp-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ campaigns: [{ name: 'Updated', status: 'ACTIVE' }] }),
        })
      );
    });
  });

  describe('getAudiences', () => {
    it('returns audiences', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          audiences: [
            { id: 'aud-1', name: 'Lookalike 1%' },
            { id: 'aud-2', name: 'Retargeting' },
          ],
        }),
      });

      const result = await api.getAudiences('acc-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('aud-1');
    });

    it('returns empty array when no audiences', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await api.getAudiences('acc-1');
      expect(result).toEqual([]);
    });
  });

  describe('syncAllAccounts', () => {
    it('syncs all orgs and accounts with campaigns and stats', async () => {
      mockSafeFetch
        // getOrganizations
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            organizations: [{ id: 'org-1', name: 'Acme' }],
          }),
        })
        // getAdAccounts
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acc-1', name: 'Main', currency: 'USD', status: 'ACTIVE' }],
          }),
        })
        // getCampaigns
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            campaigns: [
              { campaign: { id: 'camp-1', name: 'Summer', status: 'ACTIVE', daily_budget_micro: 50000000, type: 'SNAP_ADS' } },
            ],
          }),
        })
        // getCampaignStats
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            stats: { impressions: 10000, swipes: 500, spend: 1000000, conversions: 25 },
          }),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('acc-1');
      expect(result[0].account.name).toBe('Main');
      expect(result[0].campaigns).toHaveLength(1);
      expect(result[0].campaigns[0].id).toBe('camp-1');
      expect(result[0].insights).toHaveLength(1);
      expect(result[0].insights[0].campaign_id).toBe('camp-1');
      expect(result[0].insights[0].impressions).toBe(10000);
      expect(result[0].insights[0].spend).toBe(1000000);
      expect(result[0].syncedAt).toBeDefined();
    });

    it('handles errors for individual accounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            organizations: [{ id: 'org-1', name: 'Acme' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acc-1', name: 'Main', currency: 'USD', status: 'ACTIVE' }],
          }),
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('acc-1');
      expect(result[0].error).toBe('API Error');
    });

    it('skips orgs where getAdAccounts fails', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            organizations: [{ id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Beta' }],
          }),
        })
        .mockRejectedValueOnce(new Error('Org error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acc-2', name: 'Beta Acc', currency: 'EUR', status: 'ACTIVE' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ campaigns: [] }),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].account.id).toBe('acc-2');
    });

    it('continues syncing when individual campaign stats fail', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            organizations: [{ id: 'org-1', name: 'Acme' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acc-1', name: 'Main', currency: 'USD', status: 'ACTIVE' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            campaigns: [
              { campaign: { id: 'camp-1', name: 'A', status: 'ACTIVE' } },
              { campaign: { id: 'camp-2', name: 'B', status: 'ACTIVE' } },
            ],
          }),
        })
        .mockRejectedValueOnce(new Error('Stats error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ stats: { impressions: 100 } }),
        });

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].insights).toHaveLength(1);
      expect(result[0].insights[0].campaign_id).toBe('camp-2');
    });

    it('returns empty results when no organizations', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ organizations: [] }),
      });

      const result = await api.syncAllAccounts();

      expect(result).toEqual([]);
    });
  });

  describe('API call structure', () => {
    it('uses correct base URL', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ organizations: [] }),
      });

      await api.getOrganizations();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        expect.stringContaining('https://adsapi.snapchat.com/v1'),
        expect.any(Object)
      );
    });

    it('includes Bearer authorization header', async () => {
      mockSafeFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ organizations: [] }),
      });

      await api.getOrganizations();

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'snapchat',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors from safeFetch', async () => {
      mockSafeFetch.mockRejectedValue(new Error('Network error'));

      await expect(api.getOrganizations()).rejects.toThrow('Network error');
    });

    it('propagates ConfigurationError when token missing', async () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      const noTokenApi = new SnapchatAdsAPI(mockSettingsRepo);

      await expect(noTokenApi.getOrganizations()).rejects.toThrow('Snapchat access token not configured');
    });

    it('propagates errors from getAdAccounts during sync', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            organizations: [{ id: 'org-1', name: 'Acme' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ad_accounts: [{ id: 'acc-1', name: 'Main', currency: 'USD', status: 'ACTIVE' }],
          }),
        })
        .mockRejectedValueOnce(new Error('Campaign fetch failed'));

      const result = await api.syncAllAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].error).toBe('Campaign fetch failed');
    });
  });
});
