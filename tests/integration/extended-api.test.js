import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { seedDemoData } from '../../db/seed.js';

global.fetch = vi.fn();

const mockMCP = {
  clients: new Map(),
  async connect() { return { connected: true, tools: ['get_campaigns'], toolCount: 1 }; },
  async disconnect() {},
  async callTool() { return { data: [] }; },
  getStatus() { return { meta: { connected: false }, google: { connected: false } }; },
  getTools() { return []; },
};

const mockLLM = {
  async call(systemPrompt) {
    if (systemPrompt.includes('Ads Copywriter')) {
      return JSON.stringify({
        format: 'single_image',
        ads: [
          { model: '1', model_name: 'P.A.S', hook: 'Test', body: 'Body', cta: 'CTA' },
        ]
      });
    }
    return '{"package": "test"}';
  }
};

describe('Extended API Integration', () => {
  let app;
  let db;
  let authToken;

  beforeAll(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('credentials_meta', JSON.stringify({ access_token: 'fake-token' }));

    await request(app).post('/api/auth/register').send({
      username: 'extuser',
      password: 'extpass123',
      email: 'extuser@test.com',
    });
    
    db.prepare('UPDATE users SET confirmed = 1 WHERE username = ?').run('extuser');
    
    const loginRes = await request(app).post('/api/auth/login').send({
      username: 'extuser',
      password: 'extpass123',
    });
    authToken = loginRes.body.data.accessToken;
  });

  afterAll(() => {
    db.close();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  describe('Settings API', () => {
    it('GET /api/settings returns general settings', async () => {
      const res = await auth(request(app).get('/api/settings'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('PUT /api/settings/:key updates a setting', async () => {
      const res = await auth(request(app).put('/api/settings/theme_preference')).send({ value: 'dark' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkRes = await auth(request(app).get('/api/settings'));
      expect(checkRes.body.data.theme_preference).toBe('dark');
    });

    it('GET /api/settings/accounts returns multi-account list', async () => {
      const res = await auth(request(app).get('/api/settings/accounts'));
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('Campaigns API', () => {
    it('GET /api/campaigns returns campaign list', async () => {
      const res = await auth(request(app).get('/api/analytics/campaigns'));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/campaigns/creative generates ad package', async () => {
      const res = await auth(request(app).post('/api/campaigns/creative')).send({
        product: 'Test Product',
        platform: 'meta'
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('Research API', () => {
    it('GET /api/research/search requires q parameter', async () => {
      const res = await auth(request(app).get('/api/research/search'));
      expect(res.status).toBe(400);
    });

    it('GET /api/research/search returns mock ads', async () => {
      fetch.mockResolvedValue({
        json: async () => ({
          data: [
            { id: '123', page_name: 'Competitor', ad_creative_bodies: ['Buy now!'] }
          ]
        })
      });

      const res = await auth(request(app).get('/api/research/search?q=shoes'));
      expect(res.status).toBe(200);
      expect(res.body.data.ads[0].pageName).toBe('Competitor');
    });
  });
});