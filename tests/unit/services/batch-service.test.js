import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { BatchService } from '../../../server/services/batch-service.js';

describe('BatchService', () => {
  let service;
  let mockMetaApi;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      _post: vi.fn().mockResolvedValue({ data: [{ code: 200 }] }),
    };

    service = new BatchService(mockMetaApi);
  });

  it('should create instance with meta api', () => {
    expect(service.meta).toBe(mockMetaApi);
  });

  describe('batchRequest', () => {
    it('should send batch requests to meta API', async () => {
      const requests = [
        { method: 'POST', relative_url: '/c1', body: 'status=PAUSED' },
      ];

      const result = await service.batchRequest(requests);
      expect(mockMetaApi._post).toHaveBeenCalledWith('/', { batch: requests });
      expect(result).toEqual({ data: [{ code: 200 }] });
    });
  });

  describe('batchPause', () => {
    it('should create PAUSED requests for each entity', async () => {
      await service.batchPause(['c1', 'c2', 'c3']);

      expect(mockMetaApi._post).toHaveBeenCalledWith('/', {
        batch: [
          { method: 'POST', relative_url: '/c1', body: 'status=PAUSED' },
          { method: 'POST', relative_url: '/c2', body: 'status=PAUSED' },
          { method: 'POST', relative_url: '/c3', body: 'status=PAUSED' },
        ],
      });
    });

    it('should handle empty array', async () => {
      await service.batchPause([]);
      expect(mockMetaApi._post).toHaveBeenCalledWith('/', { batch: [] });
    });
  });

  describe('batchActivate', () => {
    it('should create ACTIVE requests for each entity', async () => {
      await service.batchActivate(['c1', 'c2']);

      expect(mockMetaApi._post).toHaveBeenCalledWith('/', {
        batch: [
          { method: 'POST', relative_url: '/c1', body: 'status=ACTIVE' },
          { method: 'POST', relative_url: '/c2', body: 'status=ACTIVE' },
        ],
      });
    });
  });

  describe('batchUpdateBudget', () => {
    it('should create budget update requests', async () => {
      await service.batchUpdateBudget([
        { id: 'c1', daily_budget: 5000 },
        { id: 'c2', daily_budget: 10000 },
      ]);

      expect(mockMetaApi._post).toHaveBeenCalledWith('/', {
        batch: [
          { method: 'POST', relative_url: '/c1', body: 'daily_budget=5000' },
          { method: 'POST', relative_url: '/c2', body: 'daily_budget=10000' },
        ],
      });
    });

    it('should handle empty updates', async () => {
      await service.batchUpdateBudget([]);
      expect(mockMetaApi._post).toHaveBeenCalledWith('/', { batch: [] });
    });
  });
});
