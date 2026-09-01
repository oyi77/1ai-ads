import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.stubGlobal('fetch', vi.fn());

// Mock auth middleware to inject user
vi.mock('../../../../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user_1' }; next(); },
}));

const { createOAuthRouter } = await import('../../../../server/routes/oauth.js');

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function createMockRepo() {
  const accounts = [];
  return {
    accounts,
    getAccounts: (platform) => accounts.filter(a => a.platform === platform),
    create: (data) => {
      const created = { id: `acct_${accounts.length + 1}`, ...data };
      accounts.push(created);
      return created;
    },
    updateAccount: (id, data) => {
      const idx = accounts.findIndex(a => a.id === id);
      if (idx >= 0) Object.assign(accounts[idx], data);
    },
    setActiveAccountForUser: vi.fn(),
  };
}

// Build a minimal Express app with the router + auth injection
function buildApp(repo) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/oauth', createOAuthRouter(null, repo));
  return app;
}

describe('OAuth Router — Meta', () => {
  let repo;
  let app;

  beforeEach(() => {
    repo = createMockRepo();
    app = buildApp(repo);
    process.env.META_CLIENT_ID = 'test-client-id';
    process.env.META_CLIENT_SECRET = 'test-secret';
    process.env.META_REDIRECT_URI = 'https://adforge.aitradepulse.com/api/oauth/meta/callback';
    process.env.WEB_APP_URL = 'https://adforge.aitradepulse.com';
    process.env.META_API_VERSION = 'v22.0';
    vi.clearAllMocks();
  });

  it('GET /api/oauth/meta/url returns a Facebook auth URL', async () => {
    const res = await request(app).get('/api/oauth/meta/url');
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.data?.authUrl).toContain('https://www.facebook.com/v22.0/dialog/oauth');
    expect(res.body?.data?.authUrl).toContain('client_id=test-client-id');
    expect(res.body?.data?.authUrl).toContain('ads_management');
  });

  it('callback auto-detects Meta ad accounts and saves them', async () => {
    const fetchMock = globalThis.fetch;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'long_token', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '12345', name: 'Test User' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { account_id: '498856529136519', name: 'Ad Account 1', account_status: 1, currency: 'IDR' },
            { account_id: '999', name: 'Disabled', account_status: 2, currency: 'IDR' },
          ],
        }),
      });

    const state = Buffer.from(`user_1:meta:${Date.now()}:abc123`).toString('base64url');
    const res = await request(app).get(`/api/oauth/meta/callback?code=test_code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/campaigns/wizard?connected=meta');
    const metaAccounts = repo.getAccounts('meta');
    expect(metaAccounts.length).toBe(2); // main + 1 active ad account
    expect(metaAccounts.some(a => a.account_name === 'Test User')).toBe(true);
    expect(metaAccounts.some(a => a.account_name === 'act_498856529136519')).toBe(true);
  });

  it('callback redirects to error on invalid state', async () => {
    const res = await request(app).get('/api/oauth/meta/callback?code=test&state=invalid');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('callback redirects to error on OAuth error param', async () => {
    const res = await request(app).get('/api/oauth/meta/callback?error=access_denied&error_description=User+denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });
});
