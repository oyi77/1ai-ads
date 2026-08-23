import { describe, it, expect } from 'vitest';

import { MetricsNormalizer, PLATFORM_KEYS } from '../../../server/services/metrics-normalizer.js';

describe('MetricsNormalizer', () => {
  const normalizer = new MetricsNormalizer();

  describe('platformKeys', () => {
    it('should expose all 8 platform keys', () => {
      expect(normalizer.platformKeys()).toHaveLength(8);
      expect(PLATFORM_KEYS).toEqual([
        'meta', 'google', 'tiktok', 'linkedin', 'twitter', 'microsoft', 'snapchat', 'pinterest',
      ]);
    });
  });

  describe('normalizePlatformStats', () => {
    it('meta: should coerce direct string fields with defaults', () => {
      const row = normalizer.normalizePlatformStats('meta', {
        spend: '100.5',
        revenue: '250',
        impressions: '5000',
        clicks: '120',
        conversions: '8',
      });
      expect(row).toEqual({ spend: 100.5, revenue: 250, impressions: 5000, clicks: 120, conversions: 8 });
    });

    it('meta: should default missing fields to zero', () => {
      expect(normalizer.normalizePlatformStats('meta', {})).toEqual({
        spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0,
      });
    });

    it('google: should convert costMicros to spend and pass counts through', () => {
      const row = normalizer.normalizePlatformStats('google', {
        costMicros: 50_000_000,
        impressions: 10000,
        clicks: 300,
        conversions: 5,
      });
      expect(row).toEqual({ spend: 50, revenue: 0, impressions: 10000, clicks: 300, conversions: 5 });
    });

    it('tiktok: should fall back to cost when spend is absent', () => {
      const row = normalizer.normalizePlatformStats('tiktok', {
        cost: '75.25',
        impressions: '2000',
        clicks: '40',
        conversions: '2',
      });
      expect(row).toEqual({ spend: 75.25, revenue: 0, impressions: 2000, clicks: 40, conversions: 2 });
    });

    it('linkedin: should fall back to costInLocalCurrency when spend is absent', () => {
      const row = normalizer.normalizePlatformStats('linkedin', {
        costInLocalCurrency: '33.33',
        impressions: '900',
        clicks: '18',
        conversions: '1',
      });
      expect(row).toEqual({ spend: 33.33, revenue: 0, impressions: 900, clicks: 18, conversions: 1 });
    });

    it('unknown platform: should return all zeros', () => {
      expect(normalizer.normalizePlatformStats('unknown', { spend: '9', impressions: '9' })).toEqual({
        spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0,
      });
    });
  });

  describe('aggregate', () => {
    it('should sum all fields and compute roas', () => {
      const totals = normalizer.aggregate([
        { spend: 100, revenue: 300, impressions: 5000, clicks: 120, conversions: 8 },
        { spend: 50, revenue: 150, impressions: 2000, clicks: 60, conversions: 4 },
      ]);
      expect(totals).toEqual({
        spend: 150, revenue: 450, impressions: 7000, clicks: 180, conversions: 12, roas: 3,
      });
    });

    it('should return zero roas when spend is zero', () => {
      const totals = normalizer.aggregate([{ spend: 0, revenue: 100, impressions: 0, clicks: 0, conversions: 0 }]);
      expect(totals.roas).toBe(0);
    });

    it('should return empty totals for no entries', () => {
      expect(normalizer.aggregate()).toEqual({
        spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, roas: 0,
      });
    });
  });
});
