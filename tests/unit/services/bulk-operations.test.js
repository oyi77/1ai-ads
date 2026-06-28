import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { BulkOperations } from '../../../server/services/bulk-operations.js';

describe('BulkOperations', () => {
  let ops;
  let mockMetaApi;
  let mockCampaignsRepo;
  let mockAdsRepo;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      createAdCreative: vi.fn().mockResolvedValue({ id: 'creative_1' }),
      createAd: vi.fn().mockResolvedValue({ id: 'ad_1' }),
      updateCampaign: vi.fn().mockResolvedValue({}),
      createCampaign: vi.fn().mockResolvedValue({ id: 'new_camp_1' }),
      createAdSet: vi.fn().mockResolvedValue({ id: 'new_adset_1' }),
      _get: vi.fn().mockResolvedValue({ data: [] }),
    };

    mockCampaignsRepo = {
      findById: vi.fn().mockReturnValue({ id: 'c1', name: 'Test', budget: 100, objective: 'OUTCOME_TRAFFIC' }),
    };

    mockAdsRepo = {};

    ops = new BulkOperations(mockMetaApi, mockCampaignsRepo, mockAdsRepo);
  });

  it('should create instance with dependencies', () => {
    expect(ops.meta).toBe(mockMetaApi);
    expect(ops.campaignsRepo).toBe(mockCampaignsRepo);
    expect(ops.adsRepo).toBe(mockAdsRepo);
  });

  describe('getOperation', () => {
    it('should return null for unknown operation', () => {
      expect(ops.getOperation('nonexistent')).toBeNull();
    });
  });

  describe('bulkCreateAds', () => {
    it('should throw if no accountId', async () => {
      await expect(ops.bulkCreateAds('', { template: {}, variants: [{}] }))
        .rejects.toThrow('accountId is required');
    });

    it('should throw if no variants', async () => {
      await expect(ops.bulkCreateAds('act_1', { template: {}, variants: [] }))
        .rejects.toThrow('variants array is required');
    });

    it('should create ads for each variant', async () => {
      const template = { name: 'Test', pageId: 'p1', body: 'Body', hook: 'Hook', linkUrl: 'http://x.com', ctaType: 'LEARN_MORE' };
      const variants = [
        { hook: 'V1', body: 'B1', image: 'img1' },
        { hook: 'V2', body: 'B2', image: 'img2' },
      ];

      const results = await ops.bulkCreateAds('act_1', { template, variants });
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(mockMetaApi.createAdCreative).toHaveBeenCalledTimes(2);
      expect(mockMetaApi.createAd).toHaveBeenCalledTimes(2);
    });

    it('should return completed results and track via getOperation for unknown ID', async () => {
      const template = { name: 'Test' };
      const variants = [{ hook: 'V1' }];

      const results = await ops.bulkCreateAds('act_1', { template, variants });
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      // getOperation returns null for random unknown ID (module-internal Map)
      expect(ops.getOperation('nonexistent-id')).toBeNull();
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should throw if no campaignIds', async () => {
      await expect(ops.bulkUpdateStatus([], 'ACTIVE')).rejects.toThrow('campaignIds is required');
    });

    it('should throw if no status', async () => {
      await expect(ops.bulkUpdateStatus(['c1'], '')).rejects.toThrow('status is required');
    });

    it('should update status for each campaign', async () => {
      const results = await ops.bulkUpdateStatus(['c1', 'c2'], 'PAUSED');
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(mockMetaApi.updateCampaign).toHaveBeenCalledTimes(2);
      expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('c1', { status: 'PAUSED' });
    });

    it('should handle individual update failures', async () => {
      mockMetaApi.updateCampaign.mockRejectedValueOnce(new Error('Rate limited'));

      const results = await ops.bulkUpdateStatus(['c1', 'c2'], 'ACTIVE');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Rate limited');
      expect(results[1].success).toBe(true);
    });
  });

  describe('bulkScaleBudget', () => {
    it('should throw if no campaignIds', async () => {
      await expect(ops.bulkScaleBudget([], { action: 'multiply', value: 1.5 }))
        .rejects.toThrow('campaignIds is required');
    });

    it('should throw if missing action or value', async () => {
      await expect(ops.bulkScaleBudget(['c1'], { action: 'multiply' }))
        .rejects.toThrow('action and value are required');
    });

    it('should multiply budget', async () => {
      mockCampaignsRepo.findById.mockReturnValue({ id: 'c1', budget: 200 });

      const results = await ops.bulkScaleBudget(['c1'], { action: 'multiply', value: 1.5 });
      expect(results[0].newBudget).toBe(300);
      expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('c1', { dailyBudget: 300 });
    });

    it('should set budget to fixed value', async () => {
      mockCampaignsRepo.findById.mockReturnValue({ id: 'c1', budget: 200 });

      const results = await ops.bulkScaleBudget(['c1'], { action: 'set', value: 500 });
      expect(results[0].newBudget).toBe(500);
    });
  });

  describe('cloneCampaign', () => {
    it('should throw if missing source or target', async () => {
      await expect(ops.cloneCampaign('', 'target')).rejects.toThrow('sourceCampaignId is required');
      await expect(ops.cloneCampaign('source', '')).rejects.toThrow('targetAccountId is required');
    });

    it('should clone a campaign to target account', async () => {
      const result = await ops.cloneCampaign('source_1', 'target_1');
      expect(result.campaignId).toBe('new_camp_1');
      expect(mockMetaApi.createCampaign).toHaveBeenCalledWith('target_1', expect.objectContaining({
        status: 'PAUSED',
        objective: 'OUTCOME_TRAFFIC',
      }));
    });

    it('should use custom rename if provided', async () => {
      await ops.cloneCampaign('source_1', 'target_1', { rename: 'My Copy' });
      expect(mockMetaApi.createCampaign).toHaveBeenCalledWith('target_1', expect.objectContaining({
        name: 'My Copy',
      }));
    });
  });
});
