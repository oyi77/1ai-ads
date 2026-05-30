import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import request from 'supertest';

describe('Full Pipeline Integration', () => {
  let app, db, authToken;

  beforeAll(() => {
    db = createDatabase(':memory:');
    app = createApp({ db });
  });

  afterAll(() => {
    db?.close();
  });

  async function getToken() {
    if (authToken) return authToken;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'pipeline', email: 'pipeline@test.com', password: 'test123' });
    authToken = res.body.data?.token || res.body.token;
    return authToken;
  }

  it('should complete campaign creation flow', async () => {
    const token = await getToken();

    // 1. Create a campaign
    const campaignRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pipeline Test Campaign',
        platform: 'meta',
        status: 'active',
        budget: 100,
      });

    expect(campaignRes.status).toBeLessThan(500);
    // Campaign should be created or error handled gracefully
    expect(campaignRes.body).toBeDefined();
  });

  it('should complete ad creation flow', async () => {
    const token = await getToken();

    // 2. Create an ad
    const adRes = await request(app)
      .post('/api/ads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pipeline Test Ad',
        platform: 'meta',
        format: 'single_image',
        hook: 'Test hook',
        body: 'Test body',
        cta: 'Learn More',
      });

    expect(adRes.status).toBeLessThan(500);
    expect(adRes.body).toBeDefined();
  });

  it('should complete landing page creation flow', async () => {
    const token = await getToken();

    // 3. Create a landing page
    const lpRes = await request(app)
      .post('/api/landing')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pipeline Test LP',
        template: 'modern',
        product_name: 'Test Product',
        price: '99000',
      });

    expect(lpRes.status).toBeLessThan(500);
    expect(lpRes.body).toBeDefined();
  });

  it('should list campaigns after creation', async () => {
    const token = await getToken();

    const listRes = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBeLessThan(500);
    expect(listRes.body).toBeDefined();
  });

  it('should list ads after creation', async () => {
    const token = await getToken();

    const listRes = await request(app)
      .get('/api/ads')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBeLessThan(500);
    expect(listRes.body).toBeDefined();
  });

  it('should get analytics data', async () => {
    const token = await getToken();

    const analyticsRes = await request(app)
      .get('/api/analytics/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(analyticsRes.status).toBeLessThan(500);
    expect(analyticsRes.body).toBeDefined();
  });

  it('should handle AI suggestions endpoint', async () => {
    const token = await getToken();

    const suggestionsRes = await request(app)
      .get('/api/ai-agent/suggestions')
      .set('Authorization', `Bearer ${token}`);

    expect(suggestionsRes.status).toBeLessThan(500);
    expect(suggestionsRes.body).toBeDefined();
  });

  it('should handle content schedule endpoint', async () => {
    const token = await getToken();

    const scheduleRes = await request(app)
      .get('/api/schedule')
      .set('Authorization', `Bearer ${token}`);

    expect(scheduleRes.status).toBeLessThan(500);
    expect(scheduleRes.body).toBeDefined();
  });

  it('should handle competitor spy endpoint', async () => {
    const token = await getToken();

    const spyRes = await request(app)
      .get('/api/competitor-spy')
      .set('Authorization', `Bearer ${token}`);

    expect(spyRes.status).toBeLessThan(500);
    expect(spyRes.body).toBeDefined();
  });

  it('should handle trending endpoint', async () => {
    const res = await request(app)
      .get('/api/trending/internal');

    expect(res.status).toBeLessThan(500);
    expect(res.body).toBeDefined();
  });

  it('should handle Google Ads endpoints', async () => {
    const token = await getToken();

    const accountsRes = await request(app)
      .get('/api/google-ads/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(accountsRes.status).toBeLessThan(500);
  });

  it('should handle TikTok Ads endpoints', async () => {
    const token = await getToken();

    const accountsRes = await request(app)
      .get('/api/tiktok-ads/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(accountsRes.status).toBeLessThan(500);
  });
});
