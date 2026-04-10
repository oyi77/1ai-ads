/**
 * Unit tests for Ad Intelligence Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AdIntelligenceService } from '../../../server/services/ad-intelligence.js';

describe('AdIntelligenceService', () => {
  let db;
  let service;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE competitor_snapshots (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        platform TEXT,
        ad_data TEXT DEFAULT '{}',
        snapshot_type TEXT DEFAULT 'auto',
        captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    service = new AdIntelligenceService(db);
  });

  describe('getCompetitorAds', () => {
    it('should return mock data when no API key is configured', async () => {
      const result = await service.getCompetitorAds('example.com', { platform: 'google' });

      expect(result).toHaveProperty('domain', 'example.com');
      expect(result).toHaveProperty('platform', 'google');
      expect(result).toHaveProperty('ads');
      expect(result).toHaveProperty('total', 2);
      expect(result).toHaveProperty('fetchedAt');
      expect(result).toHaveProperty('mock', true);
    });

    it('should apply limit to results', async () => {
      const result = await service.getCompetitorAds('example.com', { limit: 1 });

      expect(result.ads).toHaveLength(1);
    });

    it('should handle platform filter', async () => {
      const result = await service.getCompetitorAds('example.com', { platform: 'facebook' });

      expect(result.platform).toBe('facebook');
      expect(result.ads.every(ad => ad.platform === 'facebook')).toBe(true);
    });
  });

  describe('getCompetitorMetrics', () => {
    it('should return mock metrics when no API key is configured', async () => {
      const result = await service.getCompetitorMetrics('example.com');

      expect(result).toHaveProperty('domain', 'example.com');
      expect(result).toHaveProperty('totalVisits');
      expect(result).toHaveProperty('avgVisitDuration');
      expect(result).toHaveProperty('bounceRate');
      expect(result).toHaveProperty('trafficSources');
      expect(result).toHaveProperty('adMetrics');
      expect(result).toHaveProperty('fetchedAt');
      expect(result).toHaveProperty('mock', true);
    });

    it('should include all traffic source percentages', async () => {
      const result = await service.getCompetitorMetrics('example.com');

      expect(result.trafficSources).toHaveProperty('organic');
      expect(result.trafficSources).toHaveProperty('paid');
      expect(result.trafficSources).toHaveProperty('referral');
      expect(result.trafficSources).toHaveProperty('social');
      expect(result.trafficSources).toHaveProperty('direct');
    });

    it('should include ad performance metrics', async () => {
      const result = await service.getCompetitorMetrics('example.com');

      expect(result.adMetrics).toHaveProperty('estimatedAdSpend');
      expect(result.adMetrics).toHaveProperty('adImpressions');
      expect(result.adMetrics).toHaveProperty('adClicks');
    });
  });

  describe('analyzeCompetitorStrategy', () => {
    it('should analyze platform usage', async () => {
      const result = await service.analyzeCompetitorStrategy('example.com');

      expect(result).toHaveProperty('domain', 'example.com');
      expect(result).toHaveProperty('platforms');
      expect(result).toHaveProperty('contentPatterns');
      expect(result).toHaveProperty('biddingBehavior');
      expect(result).toHaveProperty('estimatedBudget');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('analyzedAt');
    });

    it('should generate recommendations', async () => {
      const result = await service.analyzeCompetitorStrategy('example.com');

      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);

      result.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('message');
        expect(rec).toHaveProperty('priority');
      });
    });

    it('should estimate budget', async () => {
      const result = await service.analyzeCompetitorStrategy('example.com');

      expect(result.estimatedBudget).toHaveProperty('daily');
      expect(result.estimatedBudget).toHaveProperty('monthly');
      expect(result.estimatedBudget).toHaveProperty('currency', 'USD');
      expect(result.estimatedBudget).toHaveProperty('confidence');
    });
  });

  describe('saveSnapshot', () => {
    it('should save ad data snapshot to database', () => {
      const data = {
        domain: 'example.com',
        platform: 'google',
        ads: [],
        total: 0,
        fetchedAt: new Date().toISOString(),
      };

      const snapshot = service.saveSnapshot(data);

      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('url', 'example.com');
      expect(snapshot).toHaveProperty('platform', 'google');
      expect(snapshot).toHaveProperty('snapshot_type', 'api');
      expect(snapshot).toHaveProperty('captured_at');
    });

    it('should store and return parsed ad_data', () => {
      const data = {
        domain: 'example.com',
        platform: 'google',
        ads: [{ id: '1', headline: 'Test' }],
        total: 1,
        fetchedAt: new Date().toISOString(),
      };

      const snapshot = service.saveSnapshot(data);

      expect(snapshot.ad_data).toBeTruthy();
      expect(snapshot.ad_data).toEqual(data);
    });
  });

  describe('_extractAdData', () => {
    it('should extract ad data from API response', () => {
      const mockData = {
        ads: [
          {
            id: '1',
            headline: 'Test Ad',
            description: 'Test Description',
            platform: 'google',
            impressions: 1000,
            clicks: 50,
          },
        ],
      };

      const ads = service._extractAdData(mockData, 'example.com', 'google');

      expect(ads).toHaveLength(1);
      expect(ads[0]).toHaveProperty('id', '1');
      expect(ads[0]).toHaveProperty('headline', 'Test Ad');
      expect(ads[0]).toHaveProperty('description', 'Test Description');
      expect(ads[0]).toHaveProperty('platform', 'google');
      expect(ads[0].metrics).toHaveProperty('impressions', 1000);
      expect(ads[0].metrics).toHaveProperty('clicks', 50);
    });

    it('should handle empty response', () => {
      const ads = service._extractAdData(null, 'example.com');
      expect(ads).toHaveLength(0);
    });

    it('should handle response without ads array', () => {
      const ads = service._extractAdData({}, 'example.com');
      expect(ads).toHaveLength(0);
    });
  });

  describe('_analyzePlatformUsage', () => {
    it('should calculate platform usage percentages', () => {
      const ads = [
        { platform: 'google' },
        { platform: 'google' },
        { platform: 'facebook' },
      ];

      const usage = service._analyzePlatformUsage(ads);

      expect(usage).toHaveProperty('google');
      expect(usage).toHaveProperty('facebook');
      expect(usage.google.count).toBe(2);
      expect(usage.google.percentage).toBe('66.67');
      expect(usage.facebook.count).toBe(1);
      expect(usage.facebook.percentage).toBe('33.33');
    });

    it('should handle empty array', () => {
      const usage = service._analyzePlatformUsage([]);
      expect(usage).toEqual({});
    });
  });

  describe('_analyzeBiddingBehavior', () => {
    it('should calculate CTR and CPC', () => {
      const metrics = {
        adMetrics: {
          adImpressions: 10000,
          adClicks: 200,
          estimatedAdSpend: 100,
        },
      };

      const behavior = service._analyzeBiddingBehavior(metrics);

      expect(behavior.estimatedCTR).toBe('2.00');
      expect(behavior.estimatedCPC).toBe('0.50');
    });

    it('should handle zero values', () => {
      const metrics = {
        adMetrics: {
          adImpressions: 0,
          adClicks: 0,
          estimatedAdSpend: 0,
        },
      };

      const behavior = service._analyzeBiddingBehavior(metrics);

      expect(behavior.estimatedCTR).toBe('0.00');
      expect(behavior.estimatedCPC).toBe('0.00');
    });
  });

  describe('_isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(service._isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(service._isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
      expect(service._isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      expect(service._isRetryableError(new Error('timeout'))).toBe(true);
    });

    it('should not identify non-retryable errors', () => {
      expect(service._isRetryableError(new Error('404 Not Found'))).toBe(false);
      expect(service._isRetryableError(new Error('401 Unauthorized'))).toBe(false);
      expect(service._isRetryableError(new Error('Invalid API key'))).toBe(false);
    });
  });
});
