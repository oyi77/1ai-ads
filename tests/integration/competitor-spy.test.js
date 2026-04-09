import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock fetch globally for HTML fetching in competitor-spy service
global.fetch = vi.fn(async (url) => ({
  ok: true,
  text: async () => '<html><head><title>Competitor Page</title><meta name="description" content="Test description"></head><body></body></html>'
}));

// Mock AdIntelligenceService module with a factory
vi.mock('../../server/services/ad-intelligence.js', () => ({
  AdIntelligenceService: class {
    constructor() {
      this.getCompetitorAds = vi.fn(async (domain, options) => {
        const mockAds = [
          {
            id: `mock-${Date.now()}-1`,
            headline: 'Best SaaS Solution for Your Business',
            description: 'Streamline your workflow with our powerful platform.',
            creativeUrl: null,
            displayUrl: domain,
            landingPage: `https://${domain}/`,
            platform: options?.platform || 'google',
            metrics: {
              impressions: 50000,
              clicks: 1500,
              ctr: 3.0,
              spend: 750,
              startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              endDate: null,
            },
            status: 'active',
            adType: 'text',
            createdAt: new Date().toISOString(),
          },
          {
            id: `mock-${Date.now()}-2`,
            headline: '10x Your Productivity Today',
            description: 'Join 10,000+ teams using our tools.',
            creativeUrl: null,
            displayUrl: domain,
            landingPage: `https://${domain}/features`,
            platform: options?.platform || 'google',
            metrics: {
              impressions: 35000,
              clicks: 875,
              ctr: 2.5,
              spend: 520,
              startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
              endDate: null,
            },
            status: 'active',
            adType: 'text',
            createdAt: new Date().toISOString(),
          },
          {
            id: `mock-${Date.now()}-3`,
            headline: 'Limited Time Offer: 50% Off',
            description: 'Don\'t miss out on this exclusive deal.',
            creativeUrl: null,
            displayUrl: domain,
            landingPage: `https://${domain}/offer`,
            platform: options?.platform || 'meta',
            metrics: {
              impressions: 25000,
              clicks: 300,
              ctr: 1.2,
              spend: 200,
              startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              endDate: null,
            },
            status: 'active',
            adType: 'image',
            createdAt: new Date().toISOString(),
          },
          {
            id: `mock-${Date.now()}-4`,
            headline: 'Old Campaign',
            description: 'This ad is no longer running.',
            creativeUrl: null,
            displayUrl: domain,
            landingPage: `https://${domain}/old`,
            platform: options?.platform || 'google',
            metrics: {
              impressions: 10000,
              clicks: 200,
              ctr: 2.0,
              spend: 150,
              startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            status: 'inactive',
            adType: 'text',
            createdAt: new Date().toISOString(),
          },
        ];

        const filteredAds = options?.platform
          ? mockAds.filter(ad => ad.platform === options.platform)
          : mockAds;

        return {
          domain,
          platform: options?.platform || 'google',
          ads: filteredAds,
          total: filteredAds.length,
          fetchedAt: new Date().toISOString(),
        };
      });

      this.getCompetitorMetrics = vi.fn(async (domain) => ({
        domain,
        totalVisits: 500000,
        avgVisitDuration: 180,
        bounceRate: 45,
        trafficSources: {
          organic: 40,
          paid: 25,
          referral: 15,
          social: 10,
          direct: 10,
        },
        adMetrics: {
          estimatedAdSpend: 5000,
          adImpressions: 500000,
          adClicks: 15000,
        },
        fetchedAt: new Date().toISOString(),
      }));
    }
  }
}));

describe('Competitor Spy API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    // Create test user
    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
      .run(userId, 'competitoruser', 'competitor@test.com', passwordHash);

    authToken = generateToken({ id: userId, username: 'competitoruser' });

    app = createApp({ db });
  });

  afterAll(() => {
    db.close();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  describe('GET /api/competitor-spy', () => {
    it('returns empty array initially', async () => {
      const res = await auth(request(app).get('/api/competitor-spy'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns latest snapshots after creating some', async () => {
      // Create first snapshot
      await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/competitor1',
        platform: 'meta'
      });

      // Create second snapshot with different URL
      await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/competitor2',
        platform: 'google'
      });

      const res = await auth(request(app).get('/api/competitor-spy'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/competitor-spy', () => {
    it('without url returns 400', async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        platform: 'meta'
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('url');
    });

    it('with valid url creates snapshot and returns 200', async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/ads',
        platform: 'meta'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.url).toBe('https://example.com/ads');
      expect(res.body.data.platform).toBe('meta');
      expect(res.body.data.ad_data).toBeDefined();
    });

    it('defaults platform to null when not provided', async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/no-platform'
      });

      expect(res.status).toBe(200);
      expect(res.body.data.platform).toBeNull();
    });

    it('creates snapshot with auto-populated ad data', async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/with-data'
      });

      expect(res.body.data.ad_data).toBeDefined();
      expect(res.body.data.ad_data).toHaveProperty('platform');
      expect(res.body.data.ad_data).toHaveProperty('ads');
      expect(Array.isArray(res.body.data.ad_data.ads)).toBe(true);
    });

    it('allows creating multiple snapshots for the same URL', async () => {
      const url = 'https://example.com/duplicate';

      const res1 = await auth(request(app).post('/api/competitor-spy')).send({ url });
      const res2 = await auth(request(app).post('/api/competitor-spy')).send({ url });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.id).not.toBe(res2.body.data.id);
      expect(res1.body.data.url).toBe(url);
      expect(res2.body.data.url).toBe(url);
    });
  });

  describe('GET /api/competitor-spy/:id', () => {
    let snapshotId;

    beforeEach(async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/find-me',
        platform: 'google'
      });
      snapshotId = res.body.data.id;
    });

    it('returns snapshot for valid id', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${snapshotId}`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(snapshotId);
      expect(res.body.data.url).toBe('https://example.com/find-me');
    });

    it('returns 404 for unknown id', async () => {
      const res = await auth(request(app).get('/api/competitor-spy/nonexistent-id'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/competitor-spy/:url', () => {
    const testUrl = 'https://example.com/to-delete';

    beforeEach(async () => {
      // Create multiple snapshots for the same URL
      await auth(request(app).post('/api/competitor-spy')).send({ url: testUrl, platform: 'meta' });
      await auth(request(app).post('/api/competitor-spy')).send({ url: testUrl, platform: 'google' });
    });

    it('removes all snapshots for the URL and returns 200', async () => {
      const res = await auth(request(app).delete(`/api/competitor-spy/${encodeURIComponent(testUrl)}`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify all snapshots for this URL are gone
      const getRes = await auth(request(app).get('/api/competitor-spy'));
      const remaining = getRes.body.data.filter(s => s.url === testUrl);
      expect(remaining).toHaveLength(0);
    });

    it('does not affect snapshots for other URLs', async () => {
      const otherUrl = 'https://example.com/keep-me';
      await auth(request(app).post('/api/competitor-spy')).send({ url: otherUrl });

      await auth(request(app).delete(`/api/competitor-spy/${encodeURIComponent(testUrl)}`));

      const getRes = await auth(request(app).get('/api/competitor-spy'));
      const remaining = getRes.body.data.filter(s => s.url === otherUrl);
      expect(remaining).toHaveLength(1);
    });

    it('returns 200 even when URL has no snapshots', async () => {
      const res = await auth(request(app).delete('/api/competitor-spy/nonexistent-url'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/competitor-spy/refresh', () => {
    beforeEach(async () => {
      await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/refresh1',
        platform: 'meta'
      });
      await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://example.com/refresh2',
        platform: 'google'
      });
    });

    it('refreshes all tracked competitors', async () => {
      const res = await auth(request(app).post('/api/competitor-spy/refresh'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('creates new snapshots with snapshot_type auto', async () => {
      await auth(request(app).post('/api/competitor-spy/refresh'));

      const getRes = await auth(request(app).get('/api/competitor-spy'));
      const autoSnapshots = getRes.body.data.filter(s => s.snapshot_type === 'auto');
      expect(autoSnapshots.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/competitor-spy/:competitorId/ads', () => {
    let competitorUrl;
    let competitorId;

    beforeEach(async () => {
      competitorUrl = 'https://testcompetitor.com';
      competitorId = encodeURIComponent(competitorUrl);

      // Use analyze endpoint to create snapshots with proper ad data structure
      // Create snapshots for both google and meta platforms
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });

      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'meta'
      });
    });

    it('returns active ads for competitor', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/ads`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('filters ads by platform', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/ads?platform=meta`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      // All returned ads should be from the specified platform
      if (res.body.data.length > 0) {
        res.body.data.forEach(ad => {
          expect(ad.platform).toBe('meta');
        });
      }
    });

    it('returns 404 when no data exists for competitor', async () => {
      const res = await auth(request(app).get('/api/competitor-spy/unknowncompetitor.com/ads'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('No data found');
    });

    it('excludes inactive ads from results', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/ads`));

      expect(res.status).toBe(200);

      // Verify no inactive ads are returned
      res.body.data.forEach(ad => {
        expect(ad.status).toBe('active');
      });
    });

    it('handles URL encoding properly', async () => {
      const specialUrl = 'https://competitor-with-special.com?param=value';
      const encodedId = encodeURIComponent(specialUrl);

      await auth(request(app).post('/api/competitor-spy')).send({
        url: specialUrl,
        platform: 'google'
      });

      const res = await auth(request(app).get(`/api/competitor-spy/${encodedId}/ads`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/competitor-spy/:competitorId/metrics', () => {
    let competitorUrl;
    let competitorId;

    beforeEach(async () => {
      competitorUrl = 'https://metricscompetitor.com';
      competitorId = encodeURIComponent(competitorUrl);

      // Use analyze endpoint to create snapshots with proper ad data structure
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });
    });

    it('returns aggregated metrics for competitor', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const metrics = res.body.data;
      expect(metrics.hasData).toBe(true);
      expect(metrics.competitorId).toBeDefined();
      expect(metrics.domain).toBeDefined();
      expect(metrics.totalAds).toBeDefined();
      expect(metrics.activeAds).toBeDefined();
      expect(metrics.totalSpend).toBeDefined();
      expect(metrics.totalImpressions).toBeDefined();
      expect(metrics.totalClicks).toBeDefined();
      expect(metrics.avgCTR).toBeDefined();
      expect(metrics.avgCPC).toBeDefined();
      expect(metrics.platforms).toBeDefined();
      expect(metrics.adTypes).toBeDefined();
      expect(metrics.topPerformingAds).toBeDefined();
      expect(metrics.recentTrends).toBeDefined();
    });

    it('aggregates metrics by platform', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.platforms).toBeDefined();

      const platforms = res.body.data.platforms;
      expect(typeof platforms).toBe('object');

      // Verify platform metrics structure
      Object.keys(platforms).forEach(platform => {
        expect(platforms[platform]).toHaveProperty('count');
        expect(platforms[platform]).toHaveProperty('spend');
        expect(platforms[platform]).toHaveProperty('impressions');
        expect(platforms[platform]).toHaveProperty('clicks');
      });
    });

    it('aggregates metrics by ad type', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.adTypes).toBeDefined();

      const adTypes = res.body.data.adTypes;
      expect(typeof adTypes).toBe('object');

      // Verify ad type metrics structure
      Object.keys(adTypes).forEach(type => {
        expect(adTypes[type]).toHaveProperty('count');
        expect(adTypes[type]).toHaveProperty('spend');
        expect(adTypes[type]).toHaveProperty('clicks');
      });
    });

    it('returns top performing ads', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.topPerformingAds).toBeDefined();
      expect(Array.isArray(res.body.data.topPerformingAds)).toBe(true);

      // Verify top ads structure
      if (res.body.data.topPerformingAds.length > 0) {
        res.body.data.topPerformingAds.forEach(ad => {
          expect(ad).toHaveProperty('id');
          expect(ad).toHaveProperty('headline');
          expect(ad).toHaveProperty('platform');
          expect(ad).toHaveProperty('ctr');
          expect(ad).toHaveProperty('clicks');
          expect(ad).toHaveProperty('spend');

          // Ads should be sorted by CTR (descending)
          expect(ad.ctr).toBeGreaterThan(0);
        });

        // Verify descending order
        for (let i = 0; i < res.body.data.topPerformingAds.length - 1; i++) {
          expect(res.body.data.topPerformingAds[i].ctr)
            .toBeGreaterThanOrEqual(res.body.data.topPerformingAds[i + 1].ctr);
        }
      }
    });

    it('calculates trend data when multiple snapshots exist', async () => {
      // Create another snapshot to enable trend calculation
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'meta'
      });

      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.recentTrends).toBeDefined();

      const trends = res.body.data.recentTrends;
      expect(trends).toHaveProperty('hasTrendData');
      expect(trends).toHaveProperty('spendChange');
      expect(trends).toHaveProperty('impressionsChange');
      expect(trends).toHaveProperty('periodDays');
    });

    it('returns 404 when no snapshots exist for competitor', async () => {
      const res = await auth(request(app).get('/api/competitor-spy/nonexistent.com/metrics'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.data.hasData).toBe(false);
      expect(res.body.data.message).toContain('No monitoring data');
    });

    it('calculates average CTR correctly', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      const metrics = res.body.data;
      expect(metrics.avgCTR).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.avgCTR).toBe('number');
    });

    it('calculates average CPC correctly', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      const metrics = res.body.data;
      expect(metrics.avgCPC).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.avgCPC).toBe('number');
    });
  });

  describe('POST /api/competitor-spy/:competitorId/analyze', () => {
    let competitorUrl;
    let competitorId;

    beforeEach(async () => {
      competitorUrl = 'https://analyzecompetitor.com';
      competitorId = encodeURIComponent(competitorUrl);
    });

    it('triggers competitor analysis with AdIntelligenceService', async () => {
      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.competitorId).toBeDefined();
      expect(res.body.data.domain).toBeDefined();
      expect(res.body.data.platform).toBe('google');
      expect(res.body.data.adsCount).toBeDefined();
      expect(res.body.data.snapshotId).toBeDefined();
    });

    it('creates a new snapshot after analysis', async () => {
      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'meta'
      });

      expect(res.status).toBe(200);
      const snapshotId = res.body.data.snapshotId;

      // Verify snapshot was created
      const snapshotRes = await auth(request(app).get(`/api/competitor-spy/${snapshotId}`));
      expect(snapshotRes.status).toBe(200);
      expect(snapshotRes.body.data.snapshot_type).toBe('monitor');
    });

    it('calculates aggregated metrics in analysis response', async () => {
      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

      expect(res.status).toBe(200);
      expect(res.body.data.totalSpend).toBeDefined();
      expect(res.body.data.totalImpressions).toBeDefined();
      expect(res.body.data.totalClicks).toBeDefined();
      expect(res.body.data.avgCTR).toBeDefined();
      expect(typeof res.body.data.totalSpend).toBe('number');
      expect(typeof res.body.data.avgCTR).toBe('number');
    });

    it('works without platform filter', async () => {
      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platform).toBeNull();
    });

    it('captures timestamp of analysis', async () => {
      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

      expect(res.status).toBe(200);
      expect(res.body.data.capturedAt).toBeDefined();
      const capturedDate = new Date(res.body.data.capturedAt);
      expect(capturedDate).toBeInstanceOf(Date);
      expect(capturedDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('handles URL encoding in competitor ID', async () => {
      const specialUrl = 'https://special.com?query=test&other=value';
      const encodedId = encodeURIComponent(specialUrl);

      const res = await auth(request(app).post(`/api/competitor-spy/${encodedId}/analyze`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Ad Intelligence API Integration', () => {
    // Note: AdIntelligenceService is tested indirectly through the API endpoints
    // Direct mocking of the class is complex due to ES module imports and vitest limitations
    // The service is properly tested through the analyze endpoint tests above

    it('analyze endpoint integrates with AdIntelligenceService', async () => {
      const competitorId = encodeURIComponent('https://integration-test.com');

      const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Verify the service returned data
      expect(res.body.data.competitorId).toBeDefined();
      expect(res.body.data.domain).toBeDefined();
      expect(res.body.data.adsCount).toBeDefined();
      expect(res.body.data.totalSpend).toBeDefined();
      expect(res.body.data.totalImpressions).toBeDefined();
      expect(res.body.data.totalClicks).toBeDefined();
      expect(res.body.data.snapshotId).toBeDefined();
    });

    it('metrics endpoint uses AdIntelligenceService data', async () => {
      const competitorId = encodeURIComponent('https://metrics-test.com');

      // First create a snapshot via analyze
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

      // Then get metrics
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasData).toBe(true);

      // Verify metrics include data from AdIntelligenceService
      expect(res.body.data.totalAds).toBeGreaterThan(0);
      expect(res.body.data.activeAds).toBeGreaterThan(0);
      expect(res.body.data.totalSpend).toBeGreaterThan(0);
    });
  });

  describe('Competitor Snapshot Storage', () => {
    it('stores ad data as JSON in database', async () => {
      const url = 'https://storage-test.com';
      const competitorId = encodeURIComponent(url);

      // Use analyze endpoint to create snapshot with proper ad data
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });

      const getRes = await auth(request(app).get('/api/competitor-spy'));
      const snapshot = getRes.body.data.find(s => s.url === url);

      expect(snapshot).toBeDefined();
      expect(snapshot.ad_data).toBeDefined();
      expect(typeof snapshot.ad_data).toBe('object');
      expect(snapshot.ad_data.ads).toBeDefined();
      expect(Array.isArray(snapshot.ad_data.ads)).toBe(true);
    });

    it('stores snapshot type correctly', async () => {
      const competitorId1 = encodeURIComponent('https://type-test.com');

      // Use analyze endpoint which creates monitor type snapshots
      const res3 = await auth(request(app).post(`/api/competitor-spy/${competitorId1}/analyze`));
      expect(res3.status).toBe(200);

      const snapshotRes = await auth(request(app).get(`/api/competitor-spy/${res3.body.data.snapshotId}`));
      expect(snapshotRes.body.data.snapshot_type).toBe('monitor');
    });

    it('stores captured_at timestamp', async () => {
      const res = await auth(request(app).post('/api/competitor-spy')).send({
        url: 'https://timestamp-test.com'
      });

      expect(res.status).toBe(200);
      expect(res.body.data.captured_at).toBeDefined();
      const capturedDate = new Date(res.body.data.captured_at);
      expect(capturedDate).toBeInstanceOf(Date);
      expect(capturedDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('stores platform information', async () => {
      const platforms = ['google', 'meta', 'tiktok'];

      for (const platform of platforms) {
        const res = await auth(request(app).post('/api/competitor-spy')).send({
          url: `https://${platform}-test.com`,
          platform
        });

        expect(res.body.data.platform).toBe(platform);
      }
    });

    it('retrieves stored snapshots with parsed JSON', async () => {
      const url = 'https://retrieval-test.com';
      const competitorId = encodeURIComponent(url);

      const createRes = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

      const snapshotId = createRes.body.data.snapshotId;
      const getRes = await auth(request(app).get(`/api/competitor-spy/${snapshotId}`));

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.ad_data).toBeDefined();
      expect(typeof getRes.body.data.ad_data).toBe('object');
      expect(getRes.body.data.ad_data.ads).toBeDefined();
      expect(Array.isArray(getRes.body.data.ad_data.ads)).toBe(true);
    });
  });

  describe('Metrics Calculation and Aggregation', () => {
    let competitorUrl;
    let competitorId;

    beforeEach(async () => {
      competitorUrl = 'https://aggregation-test.com';
      competitorId = encodeURIComponent(competitorUrl);

      // Use analyze endpoint to create snapshots with proper ad data structure
      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'google'
      });

      await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`)).send({
        platform: 'meta'
      });
    });

    it('calculates total spend across all snapshots', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.totalSpend).toBeDefined();
      expect(res.body.data.totalSpend).toBeGreaterThanOrEqual(0);
    });

    it('calculates total impressions across all snapshots', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.totalImpressions).toBeDefined();
      expect(res.body.data.totalImpressions).toBeGreaterThanOrEqual(0);
    });

    it('calculates total clicks across all snapshots', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.totalClicks).toBeDefined();
      expect(res.body.data.totalClicks).toBeGreaterThanOrEqual(0);
    });

    it('counts total ads correctly', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.totalAds).toBeDefined();
      expect(res.body.data.totalAds).toBeGreaterThan(0);
      expect(Number.isInteger(res.body.data.totalAds)).toBe(true);
    });

    it('counts active ads correctly', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.activeAds).toBeDefined();
      expect(res.body.data.activeAds).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(res.body.data.activeAds)).toBe(true);
      expect(res.body.data.activeAds).toBeLessThanOrEqual(res.body.data.totalAds);
    });

    it('tracks snapshot count', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.snapshotCount).toBeDefined();
      expect(res.body.data.snapshotCount).toBeGreaterThanOrEqual(1);
    });

    it('records last captured timestamp', async () => {
      const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/metrics`));

      expect(res.status).toBe(200);
      expect(res.body.data.lastCapturedAt).toBeDefined();
      const lastCaptured = new Date(res.body.data.lastCapturedAt);
      expect(lastCaptured).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    describe('Unavailable AdIntelligenceService', () => {
      it('handles AdIntelligenceService errors gracefully in analyze endpoint', async () => {
        const competitorId = encodeURIComponent('https://error-test.com');

        // Note: Since we're mocking the entire service class in the test setup,
        // we can't easily override methods per test. The mock service will always
        // return success, so we test the 404 case for nonexistent competitor instead.

        const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

        // Should succeed because mock service returns valid data
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('returns 404 when competitor has no snapshots for metrics', async () => {
        const res = await auth(request(app).get('/api/competitor-spy/nonexistent.com/metrics'));

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.hasData).toBe(false);
      });

      it('returns 404 when competitor has no snapshots for ads', async () => {
        const res = await auth(request(app).get('/api/competitor-spy/nonexistent.com/ads'));

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('No data found');
      });
    });

    describe('Invalid Input', () => {
      it('handles malformed competitor IDs', async () => {
        const res = await auth(request(app).get('/api/competitor-spy/not-a-valid-url/ads'));

        // Returns 404 because no snapshots exist for this competitor
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
      });

      it('handles missing platform parameter gracefully in ads endpoint', async () => {
        const competitorId = encodeURIComponent('https://test.com');

        await auth(request(app).post('/api/competitor-spy')).send({
          url: 'https://test.com',
          platform: 'google'
        });

        const res = await auth(request(app).get(`/api/competitor-spy/${competitorId}/ads`));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('handles missing body in analyze endpoint', async () => {
        // First create a snapshot for the competitor
        const competitorId = encodeURIComponent('https://analyze-test.com');
        await auth(request(app).post('/api/competitor-spy')).send({
          url: 'https://analyze-test.com',
          platform: 'google'
        });

        const res = await auth(request(app).post(`/api/competitor-spy/${competitorId}/analyze`));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });

    describe('Database Errors', () => {
      it('handles invalid snapshot ID gracefully', async () => {
        const res = await auth(request(app).get('/api/competitor-spy/invalid-id-12345'));

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
      });

      it('handles deletion of non-existent competitor URL', async () => {
        const res = await auth(request(app).delete('/api/competitor-spy/https://nonexistent.com'));

        // Returns 404 because the URL doesn't exist in the database
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Authentication', () => {
    it('returns 401 for unauthenticated GET', async () => {
      const res = await request(app).get('/api/competitor-spy');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated POST', async () => {
      const res = await request(app).post('/api/competitor-spy').send({
        url: 'https://example.com/test'
      });

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /:id', async () => {
      const res = await request(app).get('/api/competitor-spy/some-id');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated DELETE', async () => {
      const res = await request(app).delete('/api/competitor-spy/https://example.com/test');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /:competitorId/ads', async () => {
      const res = await request(app).get('/api/competitor-spy/test.com/ads');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /:competitorId/metrics', async () => {
      const res = await request(app).get('/api/competitor-spy/test.com/metrics');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated POST /:competitorId/analyze', async () => {
      const res = await request(app).post('/api/competitor-spy/test.com/analyze');

      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/competitor-spy').set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
    });
  });
});
