import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrendingService } from '../../../server/services/trending.js';

describe('TrendingService', () => {
  let service;
  let mockCampaignsRepo;

  beforeEach(() => {
    mockCampaignsRepo = {
      findAll: vi.fn(),
    };
    service = new TrendingService(mockCampaignsRepo);
  });

  describe('getInternalTrends', () => {
    it('returns empty array when no campaigns', () => {
      mockCampaignsRepo.findAll.mockReturnValue({ data: [] });
      return service.getInternalTrends().then(result => {
        expect(result).toEqual([]);
      });
    });

    it('returns empty array when campaigns data is null', () => {
      mockCampaignsRepo.findAll.mockReturnValue({ data: null });
      return service.getInternalTrends().then(result => {
        expect(result).toEqual([]);
      });
    });

    it('returns top 5 campaigns by ROAS', () => {
      const campaigns = [
        { id: 1, name: 'Campaign A', platform: 'meta', status: 'active', roas: 3.5, spend: 100, revenue: 350, impressions: 1000, clicks: 50, conversions: 10 },
        { id: 2, name: 'Campaign B', platform: 'google', status: 'active', roas: 5.2, spend: 200, revenue: 1040, impressions: 2000, clicks: 100, conversions: 20 },
        { id: 3, name: 'Campaign C', platform: 'tiktok', status: 'paused', roas: 2.8, spend: 150, revenue: 420, impressions: 1500, clicks: 75, conversions: 15 },
        { id: 4, name: 'Campaign D', platform: 'meta', status: 'active', roas: 4.1, spend: 120, revenue: 492, impressions: 1200, clicks: 60, conversions: 12 },
        { id: 5, name: 'Campaign E', platform: 'google', status: 'active', roas: 1.5, spend: 80, revenue: 120, impressions: 800, clicks: 40, conversions: 8 },
        { id: 6, name: 'Campaign F', platform: 'tiktok', status: 'active', roas: 6.0, spend: 300, revenue: 1800, impressions: 3000, clicks: 150, conversions: 30 },
      ];

      mockCampaignsRepo.findAll.mockReturnValue({ data: campaigns });
      return service.getInternalTrends().then(result => {
        expect(result).toHaveLength(5);
        expect(result[0].roas).toBe(6.0);
        expect(result[1].roas).toBe(5.2);
        expect(result[2].roas).toBe(4.1);
        expect(result[3].roas).toBe(3.5);
        expect(result[4].roas).toBe(2.8);
        expect(result.every(c => c.trend === 'up')).toBe(true);
      });
    });
  });

  describe('getExternalTrends', () => {
    it('returns empty array when trendingExternalSource is mock', async () => {
      global.fetch = vi.fn();
      const result = await service.getExternalTrends();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('handles fetch error with fallback to empty array', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.getExternalTrends();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('handles non-OK response with fallback to empty array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await service.getExternalTrends();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('returns empty array for invalid API response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await service.getExternalTrends();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });
});
