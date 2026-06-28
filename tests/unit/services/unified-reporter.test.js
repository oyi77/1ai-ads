import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { UnifiedReporter } from '../../../server/services/unified-reporter.js';

describe('UnifiedReporter', () => {
  let reporter;
  let mockApis;
  let mockCampaignsRepo;
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApis = {
      meta: {
        getAdAccounts: vi.fn().mockResolvedValue([{ id: 'act_1' }]),
        getAccountInsights: vi.fn().mockResolvedValue({
          spend: 100, revenue: 300, impressions: 5000, clicks: 200, conversions: 10,
        }),
        getCampaignInsights: vi.fn().mockResolvedValue({
          spend: 50, revenue: 150, impressions: 2000, clicks: 100, conversions: 5,
        }),
      },
      google: {
        listAccounts: vi.fn().mockResolvedValue(['cust_1']),
        getCampaignPerformance: vi.fn().mockResolvedValue([
          { campaignId: 'g-camp-1', costMicros: 50000000, impressions: 3000, clicks: 150, conversions: 8 },
        ]),
      },
    };

    mockCampaignsRepo = {
      findById: vi.fn().mockImplementation((id) => ({
        id, platform: id.startsWith('g-') ? 'google' : 'meta',
        name: `Campaign ${id}`, spend: 10, revenue: 30,
        impressions: 500, clicks: 25, conversions: 2,
      })),
    };

    mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([
          { platform: 'meta', spend: 100, revenue: 300, impressions: 5000, clicks: 200, conversions: 10 },
        ]),
        get: vi.fn(),
      }),
    };

    reporter = new UnifiedReporter(mockApis, mockCampaignsRepo, mockDb);
  });

  it('should create instance with dependencies', () => {
    expect(reporter.apis).toBe(mockApis);
    expect(reporter.campaignsRepo).toBe(mockCampaignsRepo);
    expect(reporter.db).toBe(mockDb);
  });

  describe('getUnifiedDashboard', () => {
    it('should aggregate platform insights', async () => {
      const result = await reporter.getUnifiedDashboard('user-1');
      expect(result.totals.spend).toBeGreaterThan(0);
      expect(result.byPlatform.length).toBeGreaterThan(0);
      expect(result.days).toBe(7);
    });

    it('should handle different date ranges', async () => {
      const result = await reporter.getUnifiedDashboard('user-1', { dateRange: 'last_30d' });
      expect(result.days).toBe(30);
    });

    it('should default to 7 days for unknown range', async () => {
      const result = await reporter.getUnifiedDashboard('user-1', { dateRange: 'unknown' });
      expect(result.days).toBe(7);
    });

    it('should compute per-platform ROAS', async () => {
      const result = await reporter.getUnifiedDashboard('user-1');
      const metaPlatform = result.byPlatform.find(p => p.platform === 'meta');
      expect(metaPlatform.roas).toBeCloseTo(3);
    });

    it('should merge DB-only platforms', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { platform: 'snapchat', spend: 50, revenue: 100, impressions: 1000, clicks: 50, conversions: 3 },
        ]),
      });

      const result = await reporter.getUnifiedDashboard('user-1');
      const snap = result.byPlatform.find(p => p.platform === 'snapchat');
      expect(snap).toBeDefined();
      expect(snap.connected).toBe(false);
    });

    it('should handle platform API failures gracefully', async () => {
      mockApis.meta.getAdAccounts.mockRejectedValue(new Error('API error'));
      const result = await reporter.getUnifiedDashboard('user-1');
      expect(result.byPlatform).toBeDefined();
    });
  });

  describe('compareCampaigns', () => {
    it('should compare campaigns and sort by ROAS', async () => {
      const result = await reporter.compareCampaigns(['meta-camp-1', 'meta-camp-2']);
      expect(result.length).toBe(2);
      // Should be sorted descending by roas
      if (result.length >= 2) {
        expect(result[0].roas).toBeGreaterThanOrEqual(result[1].roas);
      }
    });

    it('should return empty for empty input', async () => {
      expect(await reporter.compareCampaigns([])).toEqual([]);
      expect(await reporter.compareCampaigns(null)).toEqual([]);
    });

    it('should skip missing campaigns', async () => {
      mockCampaignsRepo.findById.mockReturnValueOnce(null);
      const result = await reporter.compareCampaigns(['missing']);
      expect(result).toHaveLength(0);
    });

    it('should handle API errors for individual campaigns', async () => {
      mockApis.meta.getCampaignInsights.mockRejectedValue(new Error('API error'));
      const result = await reporter.compareCampaigns(['meta-camp-1']);
      expect(result[0].error).toBeDefined();
    });
  });

  describe('recommendBudgetAllocation', () => {
    it('should allocate based on historical ROAS', async () => {
      const result = await reporter.recommendBudgetAllocation('user-1', 1000);
      expect(result.totalBudget).toBe(1000);
      expect(result.allocations.length).toBeGreaterThan(0);
      const totalAlloc = result.allocations.reduce((s, a) => s + a.recommendedBudget, 0);
      expect(totalAlloc).toBeCloseTo(1000, 0);
    });

    it('should throw for invalid budget', async () => {
      await expect(reporter.recommendBudgetAllocation('user-1', 0)).rejects.toThrow('totalBudget must be a positive number');
      await expect(reporter.recommendBudgetAllocation('user-1', -100)).rejects.toThrow('totalBudget must be a positive number');
    });

    it('should split equally if no historical data', async () => {
      mockApis.meta.getAdAccounts.mockResolvedValue([]);
      mockApis.google.listAccounts.mockResolvedValue([]);
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) });

      const result = await reporter.recommendBudgetAllocation('user-1', 1000);
      expect(result.allocations[0].reasoning).toContain('No historical data');
    });
  });

  describe('getTimeSeries', () => {
    it('should return time series from DB', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { date: '2026-06-20', platform: 'meta', value: 100 },
          { date: '2026-06-21', platform: 'meta', value: 120 },
        ]),
      });
      const result = await reporter.getTimeSeries({ metric: 'spend', days: 30 });
      expect(result).toHaveLength(2);
    });

    it('should default to spend metric', async () => {
      const spy = mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) });
      await reporter.getTimeSeries({});
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('spend'));
    });

    it('should sanitize metric names', async () => {
      await reporter.getTimeSeries({ metric: 'DROP TABLE' });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('spend'));
    });

    it('should return empty on query failure', async () => {
      mockDb.prepare.mockImplementation(() => { throw new Error('Table missing'); });
      const result = await reporter.getTimeSeries();
      expect(result).toEqual([]);
    });
  });
});
