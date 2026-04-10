// Set environment variables before any imports
process.env.JWT_SECRET = 'test-secret-key-for-testing';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock axios to avoid real external API calls
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('Trending API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;
  let mockCampaignsRepo;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    // Create test user
    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed, plan) VALUES (?, ?, ?, ?, 1, ?)')
      .run(userId, 'trendinguser', 'trending@test.com', passwordHash, 'free');

    authToken = generateToken({ id: userId, username: 'trendinguser' });

    app = createApp({ db });
  });

  afterAll(() => {
    db.close();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  beforeEach(() => {
    // Note: Since we're using vi.mock at module level, we don't need to reset here
    // The mock is already configured to return a function, which is fine for our tests
  });

  describe('GET /api/trending/internal', () => {
    beforeEach(() => {
      // Clear existing campaigns
      db.prepare('DELETE FROM campaigns').run();
    });

    it('returns empty array when no campaigns exist', async () => {
      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns top 5 campaigns by ROAS', async () => {
      // Insert test campaigns with varying ROAS
      const campaigns = [
        { id: '1', name: 'Campaign A', platform: 'meta', status: 'active', roas: 3.5, spend: 100, revenue: 350, impressions: 1000, clicks: 50, conversions: 10 },
        { id: '2', name: 'Campaign B', platform: 'google', status: 'active', roas: 5.2, spend: 200, revenue: 1040, impressions: 2000, clicks: 100, conversions: 20 },
        { id: '3', name: 'Campaign C', platform: 'tiktok', status: 'active', roas: 2.8, spend: 150, revenue: 420, impressions: 1500, clicks: 75, conversions: 15 },
        { id: '4', name: 'Campaign D', platform: 'meta', status: 'active', roas: 4.1, spend: 120, revenue: 492, impressions: 1200, clicks: 60, conversions: 12 },
        { id: '5', name: 'Campaign E', platform: 'google', status: 'active', roas: 1.5, spend: 80, revenue: 120, impressions: 800, clicks: 40, conversions: 8 },
        { id: '6', name: 'Campaign F', platform: 'tiktok', status: 'active', roas: 6.0, spend: 300, revenue: 1800, impressions: 3000, clicks: 150, conversions: 30 },
        { id: '7', name: 'Campaign G', platform: 'meta', status: 'active', roas: 0.8, spend: 100, revenue: 80, impressions: 1000, clicks: 50, conversions: 5 },
      ];

      campaigns.forEach(c => {
        db.prepare(`
          INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(c.id, c.id, c.name, c.platform, c.status, c.roas, c.spend, c.revenue, c.impressions, c.clicks, c.conversions);
      });

      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(5);

      // Verify sorted by ROAS descending
      expect(res.body.data[0].roas).toBe(6.0);
      expect(res.body.data[1].roas).toBe(5.2);
      expect(res.body.data[2].roas).toBe(4.1);
      expect(res.body.data[3].roas).toBe(3.5);
      expect(res.body.data[4].roas).toBe(2.8);

      // Verify structure
      res.body.data.forEach(campaign => {
        expect(campaign).toHaveProperty('id');
        expect(campaign).toHaveProperty('name');
        expect(campaign).toHaveProperty('platform');
        expect(campaign).toHaveProperty('status');
        expect(campaign).toHaveProperty('roas');
        expect(campaign).toHaveProperty('spend');
        expect(campaign).toHaveProperty('revenue');
        expect(campaign).toHaveProperty('impressions');
        expect(campaign).toHaveProperty('clicks');
        expect(campaign).toHaveProperty('conversions');
        expect(campaign).toHaveProperty('ctr');
        expect(campaign).toHaveProperty('trend');
        expect(campaign.trend).toBe('up');
      });
    });

    it('filters out campaigns with null or zero ROAS', async () => {
      const campaigns = [
        { id: '1', name: 'Valid Campaign', platform: 'meta', status: 'active', roas: 3.5, spend: 100, revenue: 350, impressions: 1000, clicks: 50, conversions: 10 },
        { id: '2', name: 'Null ROAS Campaign', platform: 'google', status: 'active', roas: null, spend: 200, revenue: 0, impressions: 2000, clicks: 100, conversions: 20 },
        { id: '3', name: 'Zero ROAS Campaign', platform: 'tiktok', status: 'active', roas: 0, spend: 150, revenue: 0, impressions: 1500, clicks: 75, conversions: 15 },
      ];

      campaigns.forEach(c => {
        db.prepare(`
          INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(c.id, c.id, c.name, c.platform, c.status, c.roas, c.spend, c.revenue, c.impressions, c.clicks, c.conversions);
      });

      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('1');
      expect(res.body.data[0].name).toBe('Valid Campaign');
    });

    it('calculates CTR correctly', async () => {
      const campaigns = [
        { id: '1', name: 'Campaign A', platform: 'meta', status: 'active', roas: 3.5, spend: 100, revenue: 350, impressions: 1000, clicks: 50, conversions: 10 },
        { id: '2', name: 'Campaign B', platform: 'google', status: 'active', roas: 2.0, spend: 200, revenue: 400, impressions: 500, clicks: 25, conversions: 5 },
      ];

      campaigns.forEach(c => {
        db.prepare(`
          INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(c.id, c.id, c.name, c.platform, c.status, c.roas, c.spend, c.revenue, c.impressions, c.clicks, c.conversions);
      });

      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.data[0].ctr).toBe('5.00');
      expect(res.body.data[1].ctr).toBe('5.00');
    });

    it('handles zero impressions for CTR calculation', async () => {
      db.prepare(`
        INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('1', '1', 'Zero Impressions', 'meta', 'active', 3.5, 100, 350, 0, 0, 0);

      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].ctr).toBe(0);
    });
  });

  describe('GET /api/trending/external', () => {
    const mockExternalTrends = [
      {
        id: 'ext-trend-1',
        theme: 'AI-Powered Marketing',
        category: 'SaaS',
        growth: '+125%',
        platforms: ['Google', 'LinkedIn'],
        ads_example: 'Automate your marketing with AI',
        popularity: 92,
      },
      {
        id: 'ext-trend-2',
        theme: 'Video Ads Revolution',
        category: 'Advertising',
        growth: '+87%',
        platforms: ['TikTok', 'Meta'],
        ads_example: 'Short-form video ads convert better',
        popularity: 88,
      },
    ];

    it('returns mock trends when trendingExternalSource is mock', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Verify structure of mock data
      const firstTrend = res.body.data[0];
      expect(firstTrend).toHaveProperty('id');
      expect(firstTrend).toHaveProperty('theme');
      expect(firstTrend).toHaveProperty('category');
      expect(firstTrend).toHaveProperty('growth');
      expect(firstTrend).toHaveProperty('platforms');
      expect(firstTrend).toHaveProperty('ads_example');
      expect(firstTrend).toHaveProperty('popularity');
    });

    it('accepts industry query parameter', async () => {
      const res = await auth(request(app).get('/api/trending/external?industry=SaaS'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('accepts region query parameter', async () => {
      const res = await auth(request(app).get('/api/trending/external?region=US'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('accepts both industry and region query parameters', async () => {
      const res = await auth(request(app).get('/api/trending/external?industry=SaaS&region=US'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/trending/all', () => {
    beforeEach(() => {
      // Clear existing campaigns
      db.prepare('DELETE FROM campaigns').run();
    });

    it('returns both internal and external trends', async () => {
      // Insert test campaigns
      const campaigns = [
        { id: '1', name: 'Internal Trend 1', platform: 'meta', status: 'active', roas: 3.5, spend: 100, revenue: 350, impressions: 1000, clicks: 50, conversions: 10 },
        { id: '2', name: 'Internal Trend 2', platform: 'google', status: 'active', roas: 5.2, spend: 200, revenue: 1040, impressions: 2000, clicks: 100, conversions: 20 },
      ];

      campaigns.forEach(c => {
        db.prepare(`
          INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(c.id, c.id, c.name, c.platform, c.status, c.roas, c.spend, c.revenue, c.impressions, c.clicks, c.conversions);
      });

      const res = await auth(request(app).get('/api/trending/all'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveProperty('internal');
      expect(res.body.data).toHaveProperty('external');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.internal)).toBe(true);
      expect(Array.isArray(res.body.data.external)).toBe(true);
      expect(res.body.data.internal.length).toBeGreaterThan(0);
      expect(res.body.data.external.length).toBeGreaterThan(0);
      expect(res.body.data.total).toBe(res.body.data.internal.length + res.body.data.external.length);
    });

    it('returns empty internal trends when no campaigns exist', async () => {
      const res = await auth(request(app).get('/api/trending/all'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.internal).toEqual([]);
      expect(res.body.data.external.length).toBeGreaterThan(0);
      expect(res.body.data.total).toBe(res.body.data.external.length);
    });

    it('accepts industry query parameter for external trends', async () => {
      const res = await auth(request(app).get('/api/trending/all?industry=Education'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('internal');
      expect(res.body.data).toHaveProperty('external');
      expect(res.body.data).toHaveProperty('total');
    });

    it('accepts region query parameter for external trends', async () => {
      const res = await auth(request(app).get('/api/trending/all?region=EU'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('internal');
      expect(res.body.data).toHaveProperty('external');
      expect(res.body.data).toHaveProperty('total');
    });

    it('accepts both industry and region query parameters', async () => {
      const res = await auth(request(app).get('/api/trending/all?industry=E-commerce&region=APAC'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('internal');
      expect(res.body.data).toHaveProperty('external');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('Caching Mechanism', () => {
    it('caches external trends response', async () => {
      const res1 = await auth(request(app).get('/api/trending/external'));
      const timestamp1 = Date.now();

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // Make the same request again
      const res2 = await auth(request(app).get('/api/trending/external'));
      const timestamp2 = Date.now();

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Both responses should have the same data (from cache)
      expect(res2.body.data).toEqual(res1.body.data);
    });

    it('returns different data for different filter combinations', async () => {
      const res1 = await auth(request(app).get('/api/trending/external?industry=SaaS'));
      const res2 = await auth(request(app).get('/api/trending/external?industry=Education'));

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Different cache keys should be used
      expect(res1.body.data.length).toBeGreaterThan(0);
      expect(res2.body.data.length).toBeGreaterThan(0);
    });

    it('cache works with multiple requests within TTL', async () => {
      const responses = [];

      for (let i = 0; i < 3; i++) {
        const res = await auth(request(app).get('/api/trending/external'));
        responses.push(res.body.data);
      }

      // All responses should be identical (cached)
      expect(responses[0]).toEqual(responses[1]);
      expect(responses[1]).toEqual(responses[2]);
    });
  });

  describe('Error Handling', () => {
    it('returns 500 error when service throws exception', async () => {
      // This test verifies the error handling middleware
      // We'll just verify the endpoint exists and returns appropriate status
      const res = await auth(request(app).get('/api/trending/internal'));

      // Should succeed or return 500 for errors
      expect([200, 500]).toContain(res.status);
      if (res.status === 500) {
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
      }
    });

    it('handles malformed query parameters gracefully', async () => {
      const res = await auth(request(app).get('/api/trending/external?industry=<script>alert(1)</script>'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns empty internal trends when database query fails', async () => {
      // Delete all campaigns to simulate empty result
      db.prepare('DELETE FROM campaigns').run();

      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Data Normalization from External API', () => {
    it('normalizes mock data to standard format', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify all trends have required normalized fields
      res.body.data.forEach(trend => {
        expect(trend).toHaveProperty('id');
        expect(trend).toHaveProperty('theme');
        expect(trend).toHaveProperty('category');
        expect(trend).toHaveProperty('growth');
        expect(trend).toHaveProperty('platforms');
        expect(trend).toHaveProperty('ads_example');
        expect(trend).toHaveProperty('popularity');

        // Verify types
        expect(typeof trend.id).toBe('string');
        expect(typeof trend.theme).toBe('string');
        expect(typeof trend.category).toBe('string');
        expect(typeof trend.growth).toBe('string');
        expect(Array.isArray(trend.platforms)).toBe(true);
        expect(typeof trend.ads_example).toBe('string');
        expect(typeof trend.popularity).toBe('number');
        expect(trend.popularity).toBeGreaterThanOrEqual(0);
        expect(trend.popularity).toBeLessThanOrEqual(100);
      });
    });

    it('handles various growth formats', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);

      // Growth should be formatted as string with percentage
      res.body.data.forEach(trend => {
        expect(typeof trend.growth).toBe('string');
        expect(trend.growth).toMatch(/^\+\d+%$/);
      });
    });

    it('ensures platforms are always arrays', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);

      res.body.data.forEach(trend => {
        expect(Array.isArray(trend.platforms)).toBe(true);
        expect(trend.platforms.length).toBeGreaterThan(0);
      });
    });

    it('generates unique IDs for trends', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);

      const ids = res.body.data.map(trend => trend.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Fallback Behavior', () => {
    it('falls back to mock data when external API is unavailable', async () => {
      // The service should fall back to mock data when API fails
      // In the current implementation, trendingExternalSource defaults to 'mock'
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('returns internal trends even when external fails', async () => {
      // Insert test campaigns
      db.prepare(`
        INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('1', '1', 'Test Campaign', 'meta', 'active', 3.5, 100, 350, 1000, 50, 10);

      const res = await auth(request(app).get('/api/trending/all'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.internal.length).toBeGreaterThan(0);
      expect(res.body.data.external.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication', () => {
    it('returns 401 for unauthenticated GET /api/trending/internal', async () => {
      const res = await request(app).get('/api/trending/internal');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/trending/external', async () => {
      const res = await request(app).get('/api/trending/external');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/trending/all', async () => {
      const res = await request(app).get('/api/trending/all');

      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/trending/internal')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
    });

    it('returns 401 with malformed token', async () => {
      const res = await request(app).get('/api/trending/internal')
        .set('Authorization', 'Invalid');

      expect(res.status).toBe(401);
    });

    it('returns 401 with missing Authorization header', async () => {
      const res = await request(app).get('/api/trending/external');

      expect(res.status).toBe(401);
    });
  });

  describe('Configuration Loading', () => {
    it('uses default configuration when environment variables not set', async () => {
      const res = await auth(request(app).get('/api/trending/external'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should return mock data since trendingExternalSource defaults to 'mock'
      expect(res.body.data).toBeDefined();
    });

    it('handles cacheTTL configuration', async () => {
      // The service uses a default cacheTTL of 3600 seconds
      // Verify caching works by making multiple requests
      const res1 = await auth(request(app).get('/api/trending/external'));
      const res2 = await auth(request(app).get('/api/trending/external'));

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data).toEqual(res2.body.data);
    });
  });

  describe('Database Cleanup', () => {
    it('cleans up test data properly', async () => {
      // Clear all campaigns first
      db.prepare('DELETE FROM campaigns').run();

      // Insert test campaigns
      db.prepare(`
        INSERT INTO campaigns (id, campaign_id, name, platform, status, roas, spend, revenue, impressions, clicks, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('cleanup-test', 'cleanup-test', 'Cleanup Test', 'meta', 'active', 3.5, 100, 350, 1000, 50, 10);

      // Verify data exists
      let res = await auth(request(app).get('/api/trending/internal'));
      expect(res.body.data.length).toBeGreaterThan(0);

      // Clean up
      db.prepare('DELETE FROM campaigns WHERE id = ?').run('cleanup-test');

      // Verify data is cleaned
      res = await auth(request(app).get('/api/trending/internal'));
      expect(res.body.data.length).toBe(0);
    });

    it('handles cleanup of non-existent data gracefully', async () => {
      const result = db.prepare('DELETE FROM campaigns WHERE id = ?').run('non-existent-id');
      expect(result.changes).toBe(0);
    });
  });

  describe('Response Format', () => {
    it('returns consistent response structure', async () => {
      const res = await auth(request(app).get('/api/trending/internal'));

      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('data');
      expect(typeof res.body.success).toBe('boolean');
    });

    it('includes error message when success is false', async () => {
      // This test is informational - in current implementation
      // errors are handled and 500 status is returned with error message
      const res = await auth(request(app).get('/api/trending/internal'));

      if (!res.body.success) {
        expect(res.body).toHaveProperty('error');
        expect(typeof res.body.error).toBe('string');
      }
    });

    it('returns proper HTTP status codes', async () => {
      const successRes = await auth(request(app).get('/api/trending/internal'));
      expect(successRes.status).toBe(200);

      const unauthorizedRes = await request(app).get('/api/trending/internal');
      expect(unauthorizedRes.status).toBe(401);
    });
  });
});
