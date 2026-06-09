import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignMonitorService } from '../../../server/services/campaign-monitor.js';

describe('CampaignMonitorService', () => {
  let mockMetaApi;
  let mockCampaignsRepo;
  let mockSettingsRepo;
  let service;

  const sampleCampaigns = [
    { id: 'c1', name: 'Campaign A', status: 'active', objective: 'OUTCOME_TRAFFIC', dailyBudget: 10000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-06-01' },
    { id: 'c2', name: 'Campaign B', status: 'active', objective: 'OUTCOME_ENGAGEMENT', dailyBudget: 5000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-06-01' },
    { id: 'c3', name: 'Campaign C', status: 'paused', objective: 'OUTCOME_TRAFFIC', dailyBudget: 8000, lifetimeBudget: 0, createdTime: '2026-01-01', updatedTime: '2026-05-01' },
  ];

  const sampleInsights = {
    spend: 150,
    impressions: 10000,
    clicks: 200,
    ctr: 2.0,
    cpc: 0.75,
    linkClicks: 180,
    landingPageViews: 120,
    videoViews: 0,
    conversions: 5,
    postEngagement: 300,
    costPerLinkClick: 0.83,
    costPerLandingPageView: 1.25,
    dateStart: '2026-06-09',
    dateStop: '2026-06-09',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      getCampaigns: vi.fn().mockResolvedValue(sampleCampaigns),
      getCampaignInsights: vi.fn().mockResolvedValue(sampleInsights),
      getAccountInsights: vi.fn().mockResolvedValue(sampleInsights),
      _get: vi.fn(),
    };

    mockCampaignsRepo = {};
    mockSettingsRepo = {};

    service = new CampaignMonitorService(mockMetaApi, mockCampaignsRepo, mockSettingsRepo);
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
      expect(result.grade).toMatch(/^[ABCD]$/);
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
      // dailyBudget is 10000 cents = 100 currency units, spend > 100
      mockMetaApi.getCampaignInsights.mockResolvedValue({
        ...sampleInsights,
        spend: 150, // exceeds 10000 cents / 100 = 100
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
      // c1: dailyBudget 10000 cents, threshold = 20000 cents = 200 currency
      // spend = 250 > 200, conversions = 0
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
      // Single campaign with dailyBudget=10000 cents = 100 currency
      // spend=150 → spendCents=15000, threshold=10000*2=20000 → NOT over threshold
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
});
