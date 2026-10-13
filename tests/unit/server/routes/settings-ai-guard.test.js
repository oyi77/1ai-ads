import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

// Isolate the group-router GATING logic: requireAuth becomes a pass-through
// that trusts the req.user our harness injects, so we test requireAdmin +
// the AI limiter without minting real JWTs.
vi.mock('../../../../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Unauthorized' })),
  requireAdmin: (req, res, next) =>
    (req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required' })),
}));

import { createSettingsGroupRouter } from '../../../../server/routes/_settings.js';

// Minimal app with a swappable user so we can flip role between requests.
function makeApp() {
  const llmClient = {
    url: 'http://llm.test/v1/chat/completions',
    model: 'm',
    format: 'openai',
    apiKey: 'k',
    updateConfig: vi.fn(),
    call: vi.fn(async () => 'ok'),
    fetchModels: vi.fn(async () => ['a']),
    aiHealth: vi.fn(async () => ({ ok: true, latencyMs: 5 })),
    constructor: function Fake(cfg) { return { ...cfg, call: vi.fn(async () => 'ok'), fetchModels: vi.fn(async () => ['a']) }; },
  };
  const settingsRepo = {
    getAll: () => ({}), get: () => undefined,
    set: vi.fn(), getAccounts: () => [], getAccount: () => null,
  };
  const repos = { settingsRepo, db: { prepare: () => ({ get: () => null }) }, userAddonsRepo: {} };
  const services = {
    llmClient,
    metaApi: { constructor: function M() {}, getMe: vi.fn() },
    nangoAuth: {},
    paymentService: {},
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', role: globalThis.__role || 'user' };
    next();
  });
  app.use('/api', createSettingsGroupRouter({ repos, services }));
  return { app, llmClient };
}

describe('settings group — /settings/ai is admin-only', () => {
  let app, llmClient;
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__role = 'user';
    ({ app, llmClient } = makeApp());
  });

  it('rejects a non-admin GET /settings/ai with 403', async () => {
    globalThis.__role = 'user';
    const res = await request(app).get('/api/settings/ai');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin/i);
  });

  it('rejects a non-admin PUT /settings/ai and never mutates the client', async () => {
    globalThis.__role = 'user';
    const res = await request(app).put('/api/settings/ai').send({ url: 'http://evil', apiKey: 'x' });
    expect(res.status).toBe(403);
    expect(llmClient.updateConfig).not.toHaveBeenCalled();
  });

  it('rejects a non-admin on test-connection / models / test-prompt / health', async () => {
    globalThis.__role = 'user';
    for (const [method, path] of [
      ['post', '/api/settings/ai/test-connection'],
      ['post', '/api/settings/ai/models'],
      ['post', '/api/settings/ai/test-prompt'],
      ['get', '/api/settings/ai/health'],
    ]) {
      const res = await request(app)[method](path).send({ prompt: 'x' });
      expect(res.status, path).toBe(403);
    }
  });

  it('allows an admin to read the config', async () => {
    globalThis.__role = 'admin';
    const res = await request(app).get('/api/settings/ai');
    expect(res.status).toBe(200);
    expect(res.body.data.format).toBeDefined();
  });

  it('allows an admin to run the health probe', async () => {
    globalThis.__role = 'admin';
    const res = await request(app).get('/api/settings/ai/health');
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('still serves non-AI settings to a normal user', async () => {
    globalThis.__role = 'user';
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
  });

  it('throttles the AI probe endpoints per user (429 after the cap)', async () => {
    globalThis.__role = 'admin';
    let last = 200;
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/settings/ai/test-connection').send({});
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
