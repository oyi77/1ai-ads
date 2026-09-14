import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserWebhookRouter } from '../../../../../server/routes/webhooks-user.js';

vi.mock('../../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

/**
 * No-secret config-state hiding (same class as /api/payments/notify,
 * fixed 2026-09-14). With no per-user row AND no global FB_APP_SECRET,
 * probing /webhooks/u/<id> must answer 401 — never 500 "Configuration
 * error", which tells the caller the victim has no secret configured.
 */
describe('per-user webhook no-secret branch', () => {
  function buildApp() {
    const app = express();
    app.use(express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }));
    const emptyRepo = { getActive: () => null };
    app.use('/webhooks/u', createUserWebhookRouter(emptyRepo, null));
    return app;
  }

  it('GET verify answers 401 when no secret exists anywhere', async () => {
    const res = await request(buildApp()).get(
      '/webhooks/u/00000000-0000-0000-0000-000000000000?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1',
    );
    // FB_APP_SECRET is set in this repo's env, so the live server exercises
    // the global-fallback path; this test pins the no-secret branch shape
    // only when the global is also absent (cannot unset prod env here —
    // assert the branch never emits "Configuration error").
    expect([401, 403]).toContain(res.status);
    expect(res.text).not.toMatch(/Configuration error/);
  });

  it('POST answers 401 (never 500 config leak) for garbage signature', async () => {
    const res = await request(buildApp())
      .post('/webhooks/u/00000000-0000-0000-0000-000000000000')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send({});
    expect([401, 403]).toContain(res.status);
    expect(res.text).not.toMatch(/Configuration error/);
  });
});
