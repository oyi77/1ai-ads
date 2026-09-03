import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/platforms/index.js', () => ({
  getPlatformSync: vi.fn(),
  listPlatformKeys: vi.fn(() => ['meta', 'google', 'tiktok']),
}));

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

vi.mock('../../../server/lib/resolve-owner-platform.js', () => ({
  resolveOwnerPlatformToken: vi.fn((platform, ownerId, repos) => {
    if (platform === 'meta') return null; // use system metaApi for Meta
    if (ownerId && repos?.platformAccountsRepo?.getByPlatform) {
      const acct = repos.platformAccountsRepo.getByPlatform(ownerId, platform);
      return acct?.access_token || null;
    }
    return null;
  }),
}));

import { CampaignMonitorService } from '../../../server/services/campaign-monitor.js';
import { getPlatformSync } from '../../../server/platforms/index.js';

describe('CampaignMonitorService', () => {
  let service;
  let mockMetaApi;
  let mockCampaignsRepo;
  let mockSettingsRepo;
  let mockPlatformAccountsRepo;
  let sampleCampaigns;
  let sampleInsights;

  beforeEach(() => {
    vi.clearAllMocks();

    sampleCampaigns = [
      { id: 'c1', name: 'Campaign A', status: 'active', objective: 'OUTCOME_TRAFFIC', dailyBudget: 10000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-06-01' },
      { id: 'c2', name: 'Campaign B', status: 'active', objective: 'OUTCOME_ENGAGEMENT', dailyBudget: 5000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-06-01' },
      { id: 'c3', name: 'Campaign C', status: 'paused', objective: 'OUTCOME_TRAFFIC', dailyBudget: 8000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-05-01' },
    ];

    sampleInsights = {
      spend: 150, impressions: 10000, clicks: 200, ctr: 2.0, cpc: 0.75, linkClicks: 180,
      landingPageViews: 120, videoViews: 0, conversions: 5, postEngagement: 300,
      costPerLinkClick: 0.83, costPerLandingPageView: 1.25, dateStart: '2026-06-09', dateStop: '2026-06-09',
    };

    mockMetaApi = {
      getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      getCampaignInsights: vi.fn().mockResolvedValue(sampleInsights),
      getAccountInsights: vi.fn().mockResolvedValue(sampleInsights),
      _get: vi.fn(),
    };

    mockCampaignsRepo = {};
    mockSettingsRepo = {};

    mockPlatformAccountsRepo = {
      getDistinctUserPlatforms: vi.fn().mockResolvedValue([{ user_id: 'user1', platform: 'tiktok' }]),
      getByPlatform: vi.fn().mockResolvedValue({ id: 'pa_123', access_token: 'tok', user_id: 'user1' }),
      findAllActiveByUserAndPlatform: vi.fn().mockResolvedValue([{ id: 'pa_123', access_token: 'tok', user_id: 'user1' }]),
    };

    // Configure the platform mock to return sample data
    getPlatformSync.mockImplementation((platform) => {
      return class MockPlatform {
        constructor() {}
        setActiveAccount() {}
        getCampaigns = vi.fn().mockResolvedValue(sampleCampaigns);
        getAccountInsights = vi.fn().mockResolvedValue(sampleInsights);
        getCampaignInsights = vi.fn().mockResolvedValue(sampleInsights);
        _get = vi.fn().mockResolvedValue({ data: [] });
      };
    });

    service = new CampaignMonitorService(mockMetaApi, mockCampaignsRepo, mockSettingsRepo, mockPlatformAccountsRepo);
  });

  it('should create instance with dependencies', () => {
    expect(service.metaApi).toBe(mockMetaApi);
    expect(service.campaignsRepo).toBe(mockCampaignsRepo);
    expect(service.settingsRepo).toBe(mockSettingsRepo);
  });

  describe('getAccountStatus', () => {
    it('should return account status with campaign counts and spend', async () => {
      const result = await service.getAccountStatus('act_123');

      expect(result.accountId).toBe('act_123');
      expect(result.activeCampaigns).toBe(2);
      expect(result.pausedCampaigns).toBe(1);
      expect(result.totalCampaigns).toBe(3);
      expect(result.campaigns).toHaveLength(3);
      expect(result.spendToday).toBe(150);
      expect(result.spendThisWeek).toBe(150);
      expect(result.fetchedAt).toBeDefined();
    });

    it('should include alerts for no active campaigns', async () => {
      mockMetaApi.getCampaigns.mockResolvedValue([
        { id: 'c1', name: 'Paused', status: 'paused', objective: 'OUTCOME_TRAFFIC' },
      ]);

      const result = await service.getAccountStatus('act_123');
      expect(result.activeCampaigns).toBe(0);
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'no_active_campaigns' }),
        ])
      );
    });

    it('should return empty status when API fails', async () => {
      mockMetaApi.getCampaigns.mockRejectedValue(new Error('API down'));

      const result = await service.getAccountStatus('act_123');
      expect(result.activeCampaigns).toBe(0);
      expect(result.totalCampaigns).toBe(0);
      expect(result.alerts[0].type).toBe('api_unavailable');
    });
  });

  describe('getAccountHealth', () => {
    it('should return health score between 0 and 100', async () => {
      const result = await service.getAccountHealth('act_123');

      expect(result.accountId).toBe('act_123');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['A','B','C','D','N/A']).toContain(result.grade);
      expect(result.fetchedAt).toBeDefined();
    });

    it('should penalize when no conversions with spend', async () => {
      mockMetaApi.getAccountInsights.mockResolvedValue({
        ...sampleInsights,
        conversions: 0,
        spend: 200,
      });

      const result = await service.getAccountHealth('act_123');
      expect(result.factors.some(f => f.name.includes('No conversions'))).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('should penalize low CTR', async () => {
      mockMetaApi.getAccountInsights.mockResolvedValue({
        ...sampleInsights,
        ctr: 0.2,
      });

      const result = await service.getAccountHealth('act_123');
      expect(result.factors.some(f => f.name.includes('CTR') || f.name.includes('ctr'))).toBe(true);
    });

    it('should return N/A grade when API fails', async () => {
      mockMetaApi.getCampaigns.mockRejectedValue(new Error('API down'));

      const result = await service.getAccountHealth('act_123');
      expect(result.grade).toBe('N/A');
      expect(result.score).toBe(0);
    });
  });

  describe('getAlerts', () => {
    it('should return alerts array with severity', async () => {
      const result = await service.getAlerts('act_123');

      expect(result.accountId).toBe('act_123');
      expect(Array.isArray(result.alerts)).toBe(true);
      expect(result.count).toBe(result.alerts.length);
      expect(result.fetchedAt).toBeDefined();
    });

    it('should detect zero impressions alert', async () => {
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        impressions: 0,
      });

      const result = await service.getAlerts('act_123');
      const zeroAlerts = result.alerts.filter(a => a.type === 'zero_impressions');
      expect(zeroAlerts.length).toBeGreaterThan(0);
      expect(zeroAlerts[0].severity).toBe('warning');
    });

    it('should detect low CTR alert', async () => {
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        ctr: 0.1,
      });

      const result = await service.getAlerts('act_123');
      const lowCtrAlerts = result.alerts.filter(a => a.type === 'low_ctr');
      expect(lowCtrAlerts.length).toBeGreaterThan(0);
    });

    it('should detect budget exceeded alert', async () => {
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        spend: 150,
      });

      const result = await service.getAlerts('act_123');
      const budgetAlerts = result.alerts.filter(a => a.type === 'budget_exceeded');
      expect(budgetAlerts.length).toBeGreaterThan(0);
      expect(budgetAlerts[0].severity).toBe('critical');
    });

    it('should return empty alerts when API fails', async () => {
      mockMetaApi.getCampaigns.mockRejectedValue(new Error('API down'));

      const result = await service.getAlerts('act_123');
      expect(result.alerts).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should not alert on paused campaigns', async () => {
      mockMetaApi.getCampaigns.mockResolvedValue([
        { id: 'c3', name: 'Paused', status: 'paused', dailyBudget: 10000 },
      ]);

      const result = await service.getAlerts('act_123');
      expect(result.alerts).toEqual([]);
    });
  });

  describe('getPerformanceTrend', () => {
    it('should return daily performance data', async () => {
      mockMetaApi._get.mockResolvedValue({
        data: [
          { date_start: '2026-06-08', spend: '100', impressions: '5000', clicks: '100', ctr: '2.0', cpc: '1.0', actions: [] },
          { date_start: '2026-06-09', spend: '150', impressions: '8000', clicks: '160', ctr: '2.0', cpc: '0.94', actions: [{ action_type: 'purchase', value: '3' }] },
        ],
      });

      const result = await service.getPerformanceTrend('act_123', 7);

      expect(result.accountId).toBe('act_123');
      expect(result.days).toBe(7);
      expect(result.daily).toHaveLength(2);
      expect(result.daily[0].date).toBe('2026-06-08');
      expect(result.daily[1].conversions).toBe(3);
    });

    it('should return empty daily on API failure', async () => {
      mockMetaApi._get.mockRejectedValue(new Error('fail'));

      const result = await service.getPerformanceTrend('act_123');
      expect(result.daily).toEqual([]);
      expect(result.error).toBeDefined();
    });
  });

  describe('autoPauseCheck', () => {
    it('should identify campaigns to auto-pause', async () => {
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        spend: 250,
        conversions: 0,
      });

      const result = await service.autoPauseCheck('act_123');

      expect(result.shouldPause).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(result.campaigns[0]).toHaveProperty('campaignId');
      expect(result.campaigns[0]).toHaveProperty('reason');
    });

    it('should not flag campaigns with conversions', async () => {
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        spend: 250,
        conversions: 3,
      });

      const result = await service.autoPauseCheck('act_123');

      expect(result.shouldPause).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should not flag campaigns within budget', async () => {
      mockMetaApi.getCampaigns.mockResolvedValue([
        { id: 'c1', name: 'Campaign A', status: 'active', dailyBudget: 10000 },
      ]);
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        spend: 150,
        conversions: 0,
      });

      const result = await service.autoPauseCheck('act_123');

      expect(result.shouldPause).toBe(false);
    });

    it('should skip paused campaigns', async () => {
      mockMetaApi.getCampaigns.mockResolvedValue([
        { id: 'c3', name: 'Paused', status: 'paused', dailyBudget: 10000 },
      ]);

      const result = await service.autoPauseCheck('act_123');

      expect(result.shouldPause).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should return empty on API failure', async () => {
      mockMetaApi.getCampaigns.mockRejectedValue(new Error('fail'));

      const result = await service.autoPauseCheck('act_123');
      expect(result.shouldPause).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('platform-aware methods', () => {
    it('getAccountStatus returns empty for platform without getAccountInsights', async () => {
      const googleApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      };
      const svc = new CampaignMonitorService(googleApi, mockCampaignsRepo, mockSettingsRepo);
      const result = await svc.getAccountStatus('act_123', 'user1', 'google');

      expect(result.accountId).toBe('act_123');
      expect(result.platform).toBe('google');
      expect(result.activeCampaigns).toBe(0);
      expect(result.alerts[0].type).toBe('api_unavailable');
    });

    it('getAccountHealth returns N/A for platform without getAccountInsights', async () => {
      const googleApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      };
      const svc = new CampaignMonitorService(googleApi, mockCampaignsRepo, mockSettingsRepo);
      const result = await svc.getAccountHealth('act_123', 'user1', 'google');

      expect(result.accountId).toBe('act_123');
      expect(result.platform).toBe('google');
      expect(result.score).toBe(0);
      expect(result.grade).toBe('N/A');
    });

    it('getAlerts returns unsupported for platform without getCampaignInsights', async () => {
      const googleApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      };
      const svc = new CampaignMonitorService(googleApi, mockCampaignsRepo, mockSettingsRepo);
      const result = await svc.getAlerts('act_123', 'user1', 'google');

      expect(result.accountId).toBe('act_123');
      expect(result.platform).toBe('google');
      expect(result.alerts).toEqual([]);
      expect(result.error).toBe('Platform campaign insights not supported');
    });

    it('getPerformanceTrend returns unsupported for platform without _get', async () => {
      const googleApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      };
      const svc = new CampaignMonitorService(googleApi, mockCampaignsRepo, mockSettingsRepo);
      const result = await svc.getPerformanceTrend('act_123', 7, 'user1', 'google');

      expect(result.accountId).toBe('act_123');
      expect(result.platform).toBe('google');
      expect(result.daily).toEqual([]);
      expect(result.error).toBe('Platform performance trend not supported');
    });

    it('autoPauseCheck returns unsupported for platform without getCampaignInsights', async () => {
      const googleApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      };
      const svc = new CampaignMonitorService(googleApi, mockCampaignsRepo, mockSettingsRepo);
      });

    it('works with non-meta platform that implements getAccountInsights', async () => {
      // Test via the constructor that gets a fresh platform from getPlatformSync
      const svc = new CampaignMonitorService(mockMetaApi, mockCampaignsRepo, mockSettingsRepo, mockPlatformAccountsRepo);
      
      // Manually override _ownerApi to return our test api for this specific test
      const testApi = {
        getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
        getAccountInsights: vi.fn().mockResolvedValue(sampleInsights),
        getCampaignInsights: vi.fn().mockResolvedValue(sampleInsights),
        _get: vi.fn().mockResolvedValue({ data: [] }),
        setActiveAccount: vi.fn(),
      };
      svc._ownerApi = vi.fn().mockReturnValue(testApi);
      
      const result = await svc.getAccountStatus('act_123', 'user1', 'tiktok');

      expect(result.accountId).toBe('act_123');
      expect(result.platform).toBe('tiktok');
      expect(result.activeCampaigns).toBe(2);
      expect(result.spendToday).toBe(150);
    });
  });
});