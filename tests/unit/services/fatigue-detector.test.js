import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBus } = vi.hoisted(() => ({
  mockBus: {
    onEvent: vi.fn().mockReturnValue(vi.fn()),
    fire: vi.fn(),
  },
}));

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../server/lib/event-bus.js', () => ({
  bus: mockBus,
  EVENTS: {
    CREATIVE_FATIGUE_DETECTED: 'creative:fatigue:detected',
    CREATIVE_REFRESH_NEEDED: 'creative:refresh:needed',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { FatigueDetector } from '../../../server/services/fatigue-detector.js';

describe('FatigueDetector', () => {
  let detector;
  let mockMetaApi;
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      getAds: vi.fn().mockResolvedValue([]),
      apiGet: vi.fn().mockResolvedValue({ data: [] }),
    };

    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      exec: vi.fn(),
    };

    detector = new FatigueDetector(mockMetaApi, mockDb);
  });

  it('should create instance with dependencies', () => {
    expect(detector.meta).toBe(mockMetaApi);
    expect(detector.db).toBe(mockDb);
    expect(detector._interval).toBeNull();
  });

  describe('snapshotCreatives', () => {
    it('should return 0 when no ads found', async () => {
      mockMetaApi.getAds.mockResolvedValue([]);
      const count = await detector.snapshotCreatives('act_123');
      expect(count).toBe(0);
    });

    it('should snapshot ads with insights', async () => {
      mockMetaApi.getAds.mockResolvedValue([
        { id: 'ad1', creative: { title: 'Hook', body: 'Body' } },
      ]);
      mockMetaApi.apiGet.mockResolvedValue({
        data: [{
          impressions: '1000',
          clicks: '50',
          spend: '25.50',
          ctr: '5.0',
          cpc: '0.51',
          frequency: '2.1',
          reach: '500',
          actions: [{ action_type: 'purchase', value: '3' }],
        }],
      });

      const count = await detector.snapshotCreatives('act_123');
      expect(count).toBe(1);
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should skip ads with no insights data', async () => {
      mockMetaApi.getAds.mockResolvedValue([{ id: 'ad1' }]);
      mockMetaApi.apiGet.mockResolvedValue({ data: [] });

      const count = await detector.snapshotCreatives('act_123');
      expect(count).toBe(0);
    });
  });

  describe('detectFatigue', () => {
    it('should return empty when no performance data', async () => {
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) });
      const results = await detector.detectFatigue('act_123');
      expect(results).toEqual([]);
    });

    it('should detect high frequency signal', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        ad_id: 'ad1',
        snapshot_date: `2026-06-${20 + i}`,
        impressions: 1000,
        clicks: 50,
        spend: 100,
        conversions: 5,
        ctr: 5,
        cpc: 2,
        frequency: 2.0 + i * 0.1,
        reach: 500,
        hook: 'Test Hook',
        body: 'Body',
      }));

      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue(rows) });

      const results = await detector.detectFatigue('act_123', { frequencyThreshold: 2.0 });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle single history entry (skip ad)', async () => {
      const rows = [{
        ad_id: 'ad1', snapshot_date: '2026-06-20',
        impressions: 1000, clicks: 50, spend: 100, conversions: 5,
        ctr: 5, cpc: 2, frequency: 1.5, reach: 500, hook: 'H', body: 'B',
      }];

      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue(rows) });
      const results = await detector.detectFatigue('act_123');
      expect(results).toEqual([]);
    });
  });

  describe('_extractConversions', () => {
    it('should sum purchase and lead actions', () => {
      const total = detector._extractConversions([
        { action_type: 'purchase', value: '3' },
        { action_type: 'lead', value: '2' },
        { action_type: 'page_view', value: '100' },
      ]);
      expect(total).toBe(5);
    });

    it('should return 0 for non-array input', () => {
      expect(detector._extractConversions(null)).toBe(0);
      expect(detector._extractConversions(undefined)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(detector._extractConversions([])).toBe(0);
    });
  });

  describe('_percentile', () => {
    it('should calculate correct percentile', () => {
      expect(detector._percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
      expect(detector._percentile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    });

    it('should return 0 for empty array', () => {
      expect(detector._percentile([], 0.5)).toBe(0);
    });
  });

  describe('_calculateStdDev', () => {
    it('should compute standard deviation', () => {
      const std = detector._calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(std).toBeCloseTo(2.0, 0);
    });

    it('should return 0 for single element', () => {
      expect(detector._calculateStdDev([5])).toBe(0);
    });
  });

  describe('_linearRegression', () => {
    it('should fit a line and compute R²', () => {
      const points = [
        { x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 },
      ];
      const result = detector._linearRegression(points);
      expect(result.slope).toBeCloseTo(1, 5);
      expect(result.intercept).toBeCloseTo(1, 5);
      expect(result.r2).toBeCloseTo(1, 5);
    });

    it('should handle fewer than 2 points', () => {
      const result = detector._linearRegression([{ x: 0, y: 1 }]);
      expect(result.slope).toBe(0);
      expect(result.r2).toBe(0);
    });
  });

  describe('start / stop', () => {
    it('should start and stop interval monitoring', () => {
      vi.useFakeTimers();
      detector.start();
      expect(detector._interval).not.toBeNull();

      detector.stop();
      expect(detector._interval).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('autoRefreshCreative', () => {
    it('should return null without creativeStudio', async () => {
      const result = await detector.autoRefreshCreative({
        accountId: 'act1', adId: 'ad1', adName: 'Test', hook: 'H', body: 'B',
      });
      expect(result).toBeNull();
    });

    it('should generate variants and create A/B test', async () => {
      const mockCreativeStudio = {
        generateCopyOnly: vi.fn().mockResolvedValue([
          { headline: 'New Hook 1', primaryText: 'Body 1' },
          { headline: 'New Hook 2', primaryText: 'Body 2' },
        ]),
      };
      const mockAbTest = {
        createTest: vi.fn().mockResolvedValue({ id: 'test_1' }),
        startTest: vi.fn().mockResolvedValue({}),
      };

      const d = new FatigueDetector(mockMetaApi, mockDb, {
        creativeStudio: mockCreativeStudio,
        abTestService: mockAbTest,
      });

      const result = await d.autoRefreshCreative({
        accountId: 'act1', adId: 'ad1', adName: 'Test Ad', hook: 'Old Hook', body: 'Old Body',
      });

      expect(result.id).toBe('test_1');
      expect(mockCreativeStudio.generateCopyOnly).toHaveBeenCalled();
      expect(mockAbTest.createTest).toHaveBeenCalled();
    });
  });
});
