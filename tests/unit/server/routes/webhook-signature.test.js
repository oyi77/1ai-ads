// Regression test for the Meta webhook HMAC bug.
//
// Meta signs the EXACT raw request bytes. express.json() parses the body, and
// re-stringifying (JSON.stringify(req.body)) compacts whitespace, changing the
// bytes -> signature mismatch -> 401 on every legit webhook.
//
// Fix: app.js captures req.rawBody in express.json({ verify }), and both webhook
// routers verify against req.rawBody (committed in 63c1388).
//
// This test proves: (a) verifyMetaSignature depends on exact bytes, and (b)
// both routers accept a whitespace-padded payload signed over its raw bytes
// (200) and reject a tampered signature (401).

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import config from '../../../../server/config/index.js';
import { createWebhookRouter } from '../../../../server/routes/webhooks.js';
import { createWhatsappWebhookRouter } from '../../../../server/routes/whatsapp-intelligence.js';
import { verifyMetaSignature } from '../../../../server/services/webhook-handler.js';

const SECRET = 'whsec_regression';

// Whitespace-padded body — what Meta actually sends (pretty-printed JSON).
const raw = `{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "time": 1700000000,
      "changes": [
        { "field": "messages", "value": { "messaging_product": "whatsapp" } }
      ]
    }
  ]
}`;

function sigFor(bodyStr) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(bodyStr).digest('hex');
}

// ── Unit: prove exact bytes matter to the verifier ────────────────────────
describe('verifyMetaSignature — exact bytes matter', () => {
  it('validates when HMAC is computed over the exact raw bytes', () => {
    expect(verifyMetaSignature(SECRET, raw, sigFor(raw))).toBe(true);
  });

  it('rejects when payload is the re-stringified (compacted) body — the old bug', () => {
    // Express parsed+compacted body is JSON.stringify(parsed); Meta signed the
    // raw bytes, so a verifier fed the compacted string MUST fail.
    const compact = JSON.stringify(JSON.parse(raw));
    expect(verifyMetaSignature(SECRET, compact, sigFor(raw))).toBe(false);
  });

  it('rejects a signature from a different secret', () => {
    const wrong = 'sha256=' + crypto.createHmac('sha256', 'other-secret').update(raw).digest('hex');
    expect(verifyMetaSignature(SECRET, raw, wrong)).toBe(false);
  });
});

// ── Integration: routers use req.rawBody ──────────────────────────────────
function buildApp() {
  const app = express();
  // Mirror server/app.js:83 — capture raw bytes for signature verification.
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  const repo = { create: vi.fn(async () => ({})), list: vi.fn(async () => []) };
  const waIntelligence = { processWebhook: vi.fn(async () => ({ processed: 0 })) };
  app.use('/webhooks', createWebhookRouter(repo));
  app.use('/whatsapp-intelligence/webhook', createWhatsappWebhookRouter(waIntelligence));
  return { app, repo, waIntelligence };
}

beforeAll(() => {
  // config.fbAppSecret is a getter over process.env.FB_APP_SECRET (read live at
  // request time), so set the env var to enable signature enforcement.
  process.env.FB_APP_SECRET = SECRET;
  process.env.WEBHOOK_VERIFY_TOKEN = 'vt_regression';
});

describe('Meta webhook routers — raw-body signature', () => {
  it('createWebhookRouter: whitespace payload signed over raw bytes → 200', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sigFor(raw))
      .send(raw)
      .expect(200);
  });

  it('createWebhookRouter: tampered signature → 401', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeefdeadbeef')
      .send(raw)
      .expect(401);
  });

  it('createWhatsappWebhookRouter: whitespace payload signed over raw bytes → 200', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/whatsapp-intelligence/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sigFor(raw))
      .send(raw)
      .expect(200);
  });

  it('createWhatsappWebhookRouter: tampered signature → 401', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/whatsapp-intelligence/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeefdeadbeef')
      .send(raw)
      .expect(401);
  });
});

// ── Fail-closed: a presented signature is mandatory when the secret is unset ──
// Production misconfig (empty FB_APP_SECRET) must NOT silently accept signed
// webhooks. Presented signature + missing secret → 401. No signature header at
// all → dev-mode passthrough (200), so local/dev traffic without sigs still works.
describe('Meta webhook routers — fail-closed when secret missing', () => {
  const saved = process.env.FB_APP_SECRET;
  beforeEach(() => {
    process.env.FB_APP_SECRET = ''; // secret NOT configured (prod misconfig)
  });
  afterEach(() => {
    process.env.FB_APP_SECRET = saved;
  });

  it('createWebhookRouter: signed payload with no secret → 401 (secret-not-configured)', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sigFor(raw))
      .send(raw)
      .expect(401);
  });

  it('createWhatsappWebhookRouter: signed payload with no secret → 401 (secret-not-configured)', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/whatsapp-intelligence/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sigFor(raw))
      .send(raw)
      .expect(401);
  });

  it('createWebhookRouter: no signature header → 200 (dev-mode passthrough)', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/webhooks')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
  });

  it('createWhatsappWebhookRouter: no signature header → 200 (dev-mode passthrough)', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/whatsapp-intelligence/webhook')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
  });
});
