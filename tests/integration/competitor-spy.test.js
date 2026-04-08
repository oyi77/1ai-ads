import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock competitor spy service
vi.mock('../../server/services/competitor-spy.js', () => ({
  getCompetitorData: vi.fn(async (url) => {
    return {
      platform: 'meta',
      ads: [
        { id: 'ad1', text: 'Great offer', image: 'image1.jpg' },
        { id: 'ad2', text: 'Limited time', image: 'image2.jpg' }
      ]
    };
  })
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

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/competitor-spy').set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
    });
  });
});
