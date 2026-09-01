import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CapiMonitor } from '../../../server/services/capi-monitor.js';

describe('CapiMonitor', () => {
  let monitor;
  let mockMetaApi;
  let mockDb;
  let mockPrepare;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrepare = {
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    };

    mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue(mockPrepare),
    };

    mockMetaApi = {
      apiGet: vi.fn(),
      getAccountInsights: vi.fn(),
      _getToken: vi.fn().mockReturnValue('test_token'),
    };

    monitor = new CapiMonitor(mockMetaApi, mockDb);
  });

  it('should create instance and ensure table', () => {
    expect(monitor.meta).toBe(mockMetaApi);
    expect(monitor.db).toBe(mockDb);
    expect(mockDb.exec).toHaveBeenCalledTimes(1);
  });

  describe('checkHealth', () => {
    it('should throw if no accountId', async () => {
      await expect(monitor.checkHealth('')).rejects.toThrow('accountId is required');
    });

    it('should return active status when CAPI is enabled', async () => {
      mockMetaApi.apiGet
        .mockResolvedValueOnce({ data: [{ event: 'purchase' }] })
        .mockResolvedValueOnce({ capi_config: { enabled: true }, activity_status: 'ACTIVE' });

      const result = await monitor.checkHealth('act_123', { datasetId: 'ds_1' });
      expect(result.accountId).toBe('act_123');
      expect(result.status).toBe('active');
      expect(result.eventCount).toBeGreaterThan(0);
    });

    it('should return likely_active when conversions exist but CAPI endpoint fails', async () => {
      mockMetaApi.apiGet
        .mockResolvedValueOnce({ data: [] })
        .mockRejectedValueOnce(new Error('Not available'));
      mockMetaApi.getAccountInsights.mockResolvedValueOnce({ conversions: 5 });

      const result = await monitor.checkHealth('act_123', { datasetId: 'ds_1' });
      expect(result.status).toBe('likely_active');
    });

    it('should return no_data when nothing available', async () => {
      mockMetaApi.apiGet.mockRejectedValue(new Error('fail'));
      mockMetaApi.getAccountInsights.mockRejectedValue(new Error('fail'));

      const result = await monitor.checkHealth('act_123', { datasetId: 'ds_1' });
      expect(result.status).toBe('no_data');
    });

    it('should persist snapshot to DB', async () => {
      mockMetaApi.apiGet.mockRejectedValue(new Error('fail'));
      mockMetaApi.getAccountInsights.mockRejectedValue(new Error('fail'));

      await monitor.checkHealth('act_123', { datasetId: 'ds_1' });
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockPrepare.run).toHaveBeenCalled();
    });
  });

  describe('getHealthHistory', () => {
    it('should query historical data', () => {
      mockPrepare.all.mockReturnValue([{ id: '1', status: 'active' }]);

      const results = monitor.getHealthHistory('act_123', 7);
      expect(results).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('capi_health'));
    });

    it('should use default 30 day lookback', () => {
      monitor.getHealthHistory('act_123');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('checked_at >= DATE'));
      expect(mockPrepare.all).toHaveBeenCalledWith('act_123', '-30 days');
    });
  });

  describe('start / stop', () => {
    it('should start periodic monitoring', () => {
      vi.useFakeTimers();
      monitor.start(() => ['act_1']);
      expect(monitor._interval).not.toBeNull();

      monitor.stop();
      expect(monitor._interval).toBeNull();
      vi.useRealTimers();
    });

    it('should not start twice', () => {
      vi.useFakeTimers();
      monitor.start(() => ['act_1']);
      const firstInterval = monitor._interval;
      monitor.start(() => ['act_1']);
      expect(monitor._interval).toBe(firstInterval);
      monitor.stop();
      vi.useRealTimers();
    });
  });

  describe('_checkAll', () => {
    it('should check all accounts', async () => {
      mockMetaApi.apiGet.mockRejectedValue(new Error('fail'));
      mockMetaApi.getAccountInsights.mockRejectedValue(new Error('fail'));

      // Entries carry a datasetId so checkHealth exercises the dataset endpoints.
      await monitor._checkAll(() => [{ accountId: 'act_1', datasetId: 'ds_1' }, { accountId: 'act_2', datasetId: 'ds_2' }]);
      // Each account calls checkHealth which calls apiGet twice + getAccountInsights once
      expect(mockMetaApi.apiGet).toHaveBeenCalled();
    });

    it('should handle empty account list', async () => {
      await monitor._checkAll(() => []);
      expect(mockMetaApi.apiGet).not.toHaveBeenCalled();
    });

    it('should handle getAccountIds throwing', async () => {
      await monitor._checkAll(() => { throw new Error('DB fail'); });
      expect(mockMetaApi.apiGet).not.toHaveBeenCalled();
    });
  });
});
