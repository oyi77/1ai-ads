import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { createUserWebhookRouter } from '../../../../server/routes/webhooks-user.js';

const SECRET = 'user_app_secret_123';

describe('per-user webhook /webhooks/u/:userId (1ai-ads #adforge)', () => {
  let app;
  let savedFbSecret;

  // no per-user meta app row -> resolveWebhookCreds falls back to config.fbAppSecret
  const repos = {
    create: vi.fn(),
    list: vi.fn(),
    getActive: vi.fn(() => null),
  };

  beforeAll(() => {
    savedFbSecret = process.env.FB_APP_SECRET;
    process.env.FB_APP_SECRET = SECRET;
    const router = createUserWebhookRouter(repos);
    app = express();
    app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
    app.use('/webhooks/u', router);
  });

  afterAll(() => {
    process.env.FB_APP_SECRET = savedFbSecret;
  });

  it('POST without app secret configured -> 500 (fail-closed)', async () => {
    const saved = process.env.FB_APP_SECRET;
    process.env.FB_APP_SECRET = '';
    const res = await request(app)
      .post('/webhooks/u/user-1')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(500);
    process.env.FB_APP_SECRET = saved;
  });

  it('POST missing signature -> 401', async () => {
    const res = await request(app)
      .post('/webhooks/u/user-1')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(401);
  });

  it('POST tampered signature -> 401', async () => {
    const raw = '{"object":"page","entry":[]}';
    const res = await request(app)
      .post('/webhooks/u/user-1')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('POST valid SHA256 signature -> 200', async () => {
    const raw = '{"object":"page","entry":[]}';
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    const res = await request(app)
      .post('/webhooks/u/user-1')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(raw);
    expect(res.status).toBe(200);
  });

  it('GET CRC with hub.verify_token = userId -> 200 returns challenge', async () => {
    const res = await request(app)
      .get('/webhooks/u/user-1')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'user-1', 'hub.challenge': 'challenge123' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('challenge123');
  });

  it('GET CRC with wrong hub.verify_token -> 403', async () => {
    const res = await request(app)
      .get('/webhooks/u/user-1')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'challenge123' });
    expect(res.status).toBe(403);
  });
});
