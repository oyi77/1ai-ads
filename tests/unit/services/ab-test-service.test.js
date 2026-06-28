import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/lib/event-bus.js', () => ({
  bus: { fire: vi.fn() },
  EVENTS: {
    AB_TEST_STARTED: 'ab_test_started',
    AB_TEST_COMPLETED: 'ab_test_completed',
    AB_TEST_WINNER_SELECTED: 'ab_test_winner_selected',
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 8)),
}));

import { ABTestService } from '../../../server/services/ab-test-service.js';
import { bus } from '../../../server/lib/event-bus.js';

describe('ABTestService', () => {
  let service;
  let mockDb;
  let mockMeta;
  let mockRepo;

  const makeTest = (overrides = {}) => ({
    id: 'test-1', name: 'Test 1', campaign_id: 'camp-1', status: 'draft',
    metric: 'ctr', confidence: 0.95, winner_id: null,
    config: '{"accountId":"act1","adsetId":"adset1","pageId":"page1","linkUrl":"https://example.com"}',
    started_at: null, stopped_at: null, ...overrides,
  });

  const makeVariant = (overrides = {}) => ({
    id: 'var-1', test_id: 'test-1', ad_id: null, creative_id: null,
    name: 'Variant 1', hook: 'Hook', body: 'Body', variant_index: 0,
    impressions: 0, clicks: 0, spend: 0, conversions: 0, ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      createTest: vi.fn(),
      createVariant: vi.fn(),
      getTest: vi.fn().mockReturnValue(makeTest()),
      getTests: vi.fn().mockReturnValue([makeTest()]),
      getVariants: vi.fn().mockReturnValue([makeVariant(), makeVariant({ id: 'var-2', name: 'Variant 2', variant_index: 1 })]),
      updateTest: vi.fn(),
      updateVariant: vi.fn(),
      getVariant: vi.fn(),
    };

    mockMeta = {
      createAdCreative: vi.fn().mockResolvedValue({ id: 'creative-1' }),
      createAd: vi.fn().mockResolvedValue({ id: 'ad-1' }),
      apiGet: vi.fn().mockResolvedValue({ data: [{ impressions: '1000', clicks: '50', spend: '10.00', actions: [] }] }),
      apiPost: vi.fn().mockResolvedValue({}),
    };

    mockDb = {};

    service = new ABTestService(mockMeta, mockDb);
    service.repo = mockRepo;
  });

  it('should create instance with dependencies', () => {
    expect(service.meta).toBe(mockMeta);
    expect(service.db).toBe(mockDb);
    expect(service.repo).toBeDefined();
  });

  describe('createTest', () => {
    it('should create a test with variants', async () => {
      const result = await service.createTest({
        name: 'My Test', campaignId: 'camp-1',
        variants: [{ name: 'A', adId: 'ad-a', hook: 'Hook A', body: 'Body A' }, { name: 'B', adId: 'ad-b' }],
        metric: 'ctr', confidence: 0.95,
      });

      expect(mockRepo.createTest).toHaveBeenCalledTimes(1);
      expect(mockRepo.createVariant).toHaveBeenCalledTimes(2);
      expect(result.variants).toHaveLength(2);
      expect(result.results).toBeDefined();
    });

    it('should handle empty variants array', async () => {
      const result = await service.createTest({ name: 'No Variants', variants: [] });
      expect(mockRepo.createVariant).not.toHaveBeenCalled();
      expect(result.variants).toBeDefined();
    });

    it('should default metric to ctr', async () => {
      await service.createTest({ name: 'Test', variants: [] });
      const call = mockRepo.createTest.mock.calls[0][0];
      expect(call.metric).toBe('ctr');
      expect(call.status).toBe('draft');
    });
  });

  describe('startTest', () => {
    it('should start a test and create Meta ads for variants without ad_id', async () => {
      mockRepo.getVariants.mockReturnValue([
        makeVariant({ ad_id: null }),
        makeVariant({ id: 'var-2', ad_id: null, name: 'Variant 2' }),
      ]);

      const result = await service.startTest('test-1');

      expect(mockMeta.createAdCreative).toHaveBeenCalledTimes(2);
      expect(mockMeta.createAd).toHaveBeenCalledTimes(2);
      expect(mockRepo.updateTest).toHaveBeenCalledWith('test-1', expect.objectContaining({ status: 'running' }));
      expect(bus.fire).toHaveBeenCalledWith('ab_test_started', expect.any(Object));
    });

    it('should not create Meta ads if variants already have ad_id', async () => {
      mockRepo.getVariants.mockReturnValue([
        makeVariant({ ad_id: 'existing-ad-1' }),
      ]);

      await service.startTest('test-1');

      expect(mockMeta.createAdCreative).not.toHaveBeenCalled();
    });

    it('should throw if test not found', async () => {
      mockRepo.getTest.mockReturnValue(null);
      await expect(service.startTest('nonexistent')).rejects.toThrow('not found');
    });

    it('should handle Meta ad creation failure gracefully', async () => {
      mockRepo.getVariants.mockReturnValue([makeVariant({ ad_id: null })]);
      mockMeta.createAdCreative.mockRejectedValueOnce(new Error('API error'));

      const result = await service.startTest('test-1');
      expect(result).toBeDefined();
      expect(mockRepo.updateTest).toHaveBeenCalledWith('test-1', expect.objectContaining({ status: 'running' }));
    });
  });

  describe('stopTest', () => {
    it('should stop test and fire event', async () => {
      mockRepo.getVariants.mockReturnValue([
        makeVariant({ impressions: 1000, clicks: 50, ad_id: 'ad-1' }),
        makeVariant({ id: 'var-2', impressions: 1000, clicks: 30, ad_id: 'ad-2' }),
      ]);

      const result = await service.stopTest('test-1');

      expect(mockRepo.updateTest).toHaveBeenCalledWith('test-1', expect.objectContaining({ status: 'completed' }));
      expect(bus.fire).toHaveBeenCalledWith('ab_test_completed', expect.any(Object));
    });

    it('should throw if test not found', async () => {
      mockRepo.getTest.mockReturnValue(null);
      await expect(service.stopTest('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('syncTest', () => {
    it('should fetch insights and update variants', async () => {
      mockRepo.getVariants.mockReturnValue([
        makeVariant({ ad_id: 'ad-1', impressions: 0, clicks: 0, spend: 0 }),
      ]);

      const result = await service.syncTest('test-1');

      expect(mockMeta.apiGet).toHaveBeenCalledWith('/ad-1/insights', expect.any(Object));
      expect(mockRepo.updateVariant).toHaveBeenCalled();
    });

    it('should skip variants without ad_id', async () => {
      mockRepo.getVariants.mockReturnValue([makeVariant({ ad_id: null })]);

      await service.syncTest('test-1');
      expect(mockMeta.apiGet).not.toHaveBeenCalled();
    });

    it('should throw if test not found', async () => {
      mockRepo.getTest.mockReturnValue(null);
      await expect(service.syncTest('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getTest', () => {
    it('should return enriched test with variants', () => {
      const result = service.getTest('test-1');
      expect(result.variants).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.results.overallCtr).toBeDefined();
    });

    it('should throw if test not found', () => {
      mockRepo.getTest.mockReturnValue(null);
      expect(() => service.getTest('nonexistent')).toThrow('not found');
    });
  });

  describe('getTests', () => {
    it('should return all tests enriched', () => {
      const results = service.getTests();
      expect(results).toHaveLength(1);
      expect(results[0].variants).toBeDefined();
    });

    it('should filter by status', () => {
      service.getTests({ status: 'running' });
      expect(mockRepo.getTests).toHaveBeenCalledWith({ status: 'running' });
    });
  });

  describe('updateWinner', () => {
    it('should update winner and fire event', () => {
      const result = service.updateWinner('test-1', 'var-1');
      expect(mockRepo.updateTest).toHaveBeenCalledWith('test-1', expect.objectContaining({
        winner_id: 'var-1', status: 'winner_selected',
      }));
      expect(bus.fire).toHaveBeenCalled();
    });

    it('should throw if test not found', () => {
      mockRepo.getTest.mockReturnValue(null);
      expect(() => service.updateWinner('nonexistent', 'var-1')).toThrow('not found');
    });
  });

  describe('allocateTraffic', () => {
    it('should return traffic shares for variants', () => {
      mockRepo.getVariants.mockReturnValue([
        makeVariant({ impressions: 1000, clicks: 50 }),
        makeVariant({ id: 'var-2', impressions: 1000, clicks: 80 }),
      ]);

      const result = service.allocateTraffic('test-1');
      expect(result).toHaveLength(2);
      expect(result[0].trafficShare).toBeDefined();
      const totalShare = result.reduce((s, r) => s + r.trafficShare, 0);
      expect(totalShare).toBeCloseTo(1, 1);
    });

    it('should return empty for no variants', () => {
      mockRepo.getVariants.mockReturnValue([]);
      expect(service.allocateTraffic('test-1')).toEqual([]);
    });
  });

  describe('_extractConversions', () => {
    it('should extract purchase conversions', () => {
      const actions = [
        { action_type: 'purchase', value: '3' },
        { action_type: 'lead', value: '2' },
        { action_type: 'like', value: '100' },
      ];
      expect(service._extractConversions(actions)).toBe(5);
    });

    it('should return 0 for non-array input', () => {
      expect(service._extractConversions(null)).toBe(0);
      expect(service._extractConversions(undefined)).toBe(0);
    });
  });
});
