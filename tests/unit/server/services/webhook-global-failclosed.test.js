import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// (a) regression: global /webhooks GET CRC must fail-closed when WEBHOOK_VERIFY_TOKEN
// is unset. The hardcoded 'adforge_webhook_2026' default was removed, so no token
// configured => any hub.verify_token => 403 (not 200).
describe('global webhook GET CRC fail-closed when WEBHOOK_VERIFY_TOKEN unset (1ai-ads)', () => {
  let app;
  let saved;

  beforeAll(async () => {
    vi.resetModules();
    saved = process.env.WEBHOOK_VERIFY_TOKEN;
    delete process.env.WEBHOOK_VERIFY_TOKEN;
    const { createWebhookRouter } = await import('../../../../server/routes/webhooks.js');
    app = express();
    app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
    app.use('/webhooks', createWebhookRouter());
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.WEBHOOK_VERIFY_TOKEN;
    else process.env.WEBHOOK_VERIFY_TOKEN = saved;
    vi.resetModules();
  });

  it('returns 403 for any hub.verify_token when no token configured', async () => {
    const res = await request(app)
      .get('/webhooks')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'anything', 'hub.challenge': 'challenge123' });
    expect(res.status).toBe(403);
  });
});
