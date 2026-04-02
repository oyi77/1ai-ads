import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { seedDemoData } from '../../db/seed.js';

// Mock MCP client
const mockMCP = {
  clients: new Map(),
  async connect() { return { connected: true, tools: ['get_campaigns'], toolCount: 1 }; },
  async disconnect() {},
  async callTool() { return { data: [] }; },
  getStatus() { return { meta: { connected: false }, google: { connected: false } }; },
  getTools() { return []; },
};

// Mock LLM client
const mockLLM = {
  async call(systemPrompt) {
    if (systemPrompt.includes('Ads Copywriter')) {
      return JSON.stringify({
        format: 'single_image',
        ads: [
          { model: '1', model_name: 'P.A.S', hook: 'Test', body: 'Body', cta: 'CTA' },
          { model: '2', model_name: 'Efek Gravitasi', hook: 'H2', body: 'B2', cta: 'C2' },
          { model: '3', model_name: 'Hasil x3', hook: 'H3', body: 'B3', cta: 'C3' },
          { model: '4', model_name: 'P2P', hook: 'H4', body: 'B4', cta: 'C4' },
        ]
      });
    }
    return '```html\n<h1>Generated LP</h1>\n```';
  }
};

describe('App Integration', () => {
  let app;
  let db;
  let authToken;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    // Register and get token
    const res = await request(app).post('/api/auth/register').send({
      username: 'testuser',
      password: 'testpass123',
    });
    authToken = res.body.data.token;
  });

  afterAll(() => {
    db.close();
  });

  // Helper for authenticated requests
  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  // --- Auth ---
  describe('Auth API', () => {
    it('POST /api/auth/register creates user and returns token', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'newuser',
        password: 'newpass123',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.username).toBe('newuser');
    });

    it('POST /api/auth/register rejects duplicate username', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        password: 'anotherpass',
      });
      expect(res.status).toBe(409);
    });

    it('POST /api/auth/register rejects short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'shortpw',
        password: '123',
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/auth/login returns token for valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'testuser',
        password: 'testpass123',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });

    it('POST /api/auth/login rejects wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'testuser',
        password: 'wrongpass',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/auth/login rejects nonexistent user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: 'nobody',
        password: 'nope',
      });
      expect(res.status).toBe(401);
    });

    it('protected routes return 401 without token', async () => {
      const res = await request(app).get('/api/ads');
      expect(res.status).toBe(401);
    });

    it('protected routes return 401 with bad token', async () => {
      const res = await request(app).get('/api/ads').set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(401);
    });
  });

  // --- Ads ---
  describe('Ads API', () => {
    let createdAdId;

    it('GET /api/ads returns seeded ads', async () => {
      const res = await auth(request(app).get('/api/ads'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/ads with valid data returns 200', async () => {
      const res = await auth(request(app).post('/api/ads')).send({
        name: 'Integration Test Ad',
        product: 'Widget',
        platform: 'meta',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBeDefined();
      createdAdId = res.body.data.id;
    });

    it('POST /api/ads with missing name returns 400', async () => {
      const res = await auth(request(app).post('/api/ads')).send({ product: 'Widget' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('POST /api/ads with invalid platform returns 400', async () => {
      const res = await auth(request(app).post('/api/ads')).send({ name: 'Test', platform: 'linkedin' });
      expect(res.status).toBe(400);
    });

    it('GET /api/ads/:id returns the ad', async () => {
      const res = await auth(request(app).get(`/api/ads/${createdAdId}`));
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Integration Test Ad');
    });

    it('PUT /api/ads/:id updates and returns 200', async () => {
      const res = await auth(request(app).put(`/api/ads/${createdAdId}`)).send({ name: 'Updated Ad' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Ad');
    });

    it('PUT /api/ads/:id with nonexistent id returns 404', async () => {
      const res = await auth(request(app).put('/api/ads/nonexistent')).send({ name: 'Nope' });
      expect(res.status).toBe(404);
    });

    it('GET /api/ads/search?q=Updated filters results', async () => {
      const res = await auth(request(app).get('/api/ads/search?q=Updated'));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('DELETE /api/ads/:id returns 200', async () => {
      const res = await auth(request(app).delete(`/api/ads/${createdAdId}`));
      expect(res.status).toBe(200);
    });

    it('DELETE /api/ads/:id with nonexistent id returns 404', async () => {
      const res = await auth(request(app).delete('/api/ads/nonexistent'));
      expect(res.status).toBe(404);
    });

    it('POST /api/ads/generate returns 4 variations', async () => {
      const res = await auth(request(app).post('/api/ads/generate')).send({
        product: 'Kursus DM',
        target: 'UMKM',
        keunggulan: 'Praktis',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.ads).toHaveLength(4);
    });

    it('POST /api/ads/generate with missing product returns 400', async () => {
      const res = await auth(request(app).post('/api/ads/generate')).send({ target: 'UMKM' });
      expect(res.status).toBe(400);
    });
  });

  // --- Landing Pages ---
  describe('Landing API', () => {
    let createdLpId;

    it('GET /api/landing returns list', async () => {
      const res = await auth(request(app).get('/api/landing'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/landing with valid data returns 200', async () => {
      const res = await auth(request(app).post('/api/landing')).send({
        name: 'Test LP',
        template: 'dark',
        theme: 'dark',
        product_name: 'Widget',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBeDefined();
      createdLpId = res.body.data.id;
    });

    it('POST /api/landing with missing name returns 400', async () => {
      const res = await auth(request(app).post('/api/landing')).send({ template: 'dark' });
      expect(res.status).toBe(400);
    });

    it('POST /api/landing with invalid theme returns 400', async () => {
      const res = await auth(request(app).post('/api/landing')).send({ name: 'Test', theme: 'neon' });
      expect(res.status).toBe(400);
    });

    it('PUT /api/landing/:id updates and returns 200', async () => {
      const res = await auth(request(app).put(`/api/landing/${createdLpId}`)).send({ name: 'Updated LP' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated LP');
    });

    it('DELETE /api/landing/:id returns 200', async () => {
      const res = await auth(request(app).delete(`/api/landing/${createdLpId}`));
      expect(res.status).toBe(200);
    });

    it('DELETE /api/landing/:id with nonexistent id returns 404', async () => {
      const res = await auth(request(app).delete('/api/landing/nonexistent'));
      expect(res.status).toBe(404);
    });

    it('GET /api/landing/:id/export returns HTML', async () => {
      const createRes = await auth(request(app).post('/api/landing')).send({
        name: 'Export Test',
        template: 'dark',
      });
      const id = createRes.body.data.id;

      await auth(request(app).post('/api/landing/render')).send({
        id,
        theme: 'dark',
        product_name: 'Test Product',
        benefits: ['Fast'],
        pain_points: ['Slow'],
      });

      const res = await auth(request(app).get(`/api/landing/${id}/export`));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  // --- Analytics ---
  describe('Analytics API', () => {
    it('GET /api/analytics/dashboard returns real metrics from seeded data', async () => {
      const res = await auth(request(app).get('/api/analytics/dashboard'));
      expect(res.status).toBe(200);
      expect(res.body.data.total_spend).toBeGreaterThan(0);
      expect(res.body.data.total_revenue).toBeGreaterThan(0);
      expect(res.body.data.avg_roas).toBeGreaterThan(0);
    });
  });

  // --- MCP ---
  describe('MCP API', () => {
    it('GET /api/mcp/status returns connection status', async () => {
      const res = await auth(request(app).get('/api/mcp/status'));
      expect(res.status).toBe(200);
      expect(res.body.data.meta).toBeDefined();
    });
  });

  // --- Error handling ---
  describe('Error handling', () => {
    it('invalid JSON body returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid json');
      expect(res.status).toBe(400);
    });
  });
});
