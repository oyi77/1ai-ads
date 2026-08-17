import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { generateToken } from '../../../../server/lib/auth.js';
import { requireAuth } from '../../../../server/middleware/auth.js';
import { createLinkedInAdsRouter } from '../../../../server/routes/linkedin-ads.js';
import { createTwitterAdsRouter } from '../../../../server/routes/twitter-ads.js';
import { createGenericPlatformRouter } from '../../../../server/routes/platform-generic.js';
import { createGoogleAdsRouter } from '../../../../server/routes/google-ads.js';
import { createTikTokAdsRouter } from '../../../../server/routes/tiktok-ads.js';
import { createMicrosoftAdsRouter } from '../../../../server/routes/microsoft-ads.js';
import { createPinterestAdsRouter } from '../../../../server/routes/pinterest-ads.js';
import { createSnapchatAdsRouter } from '../../../../server/routes/snapchat-ads.js';
import { GoogleAdsAPI } from '../../../../server/services/google/index.js';

// Distinct tokens so we can PROVE which one hits the wire.
const USER_TOK = 'USER_BOUND_TOKEN_123';
const SYS_TOK = 'SYSTEM_FALLBACK_TOKEN_999';
const OTHER_TOK = 'OTHER_USER_TOKEN_SHOULD_NEVER_APPEAR';

const PLATFORMS = ['linkedin', 'twitter', 'reddit', 'google', 'tiktok', 'microsoft', 'pinterest', 'snapchat'];

// Minimal fake repos.
function makeRepos() {
  return {
    settingsRepo: {
      // access_token: per-user resolution + most platforms' _getToken; oauth_token: Google _getConfig.
      getCredentials: (platform) => (PLATFORMS.includes(platform)
        ? { access_token: SYS_TOK, oauth_token: SYS_TOK, developer_token: 'DEV_TOK_777' }
        : null),
    },
    platformAccountsRepo: {
      // Only the requesting user u1 has a bound account; u2 (other) does NOT.
      getByPlatform: (userId, platform) =>
        userId === 'u1' && PLATFORMS.includes(platform) ? { id: 'acc-1', access_token: USER_TOK } : null,
      getAccounts: () => [],
    },
  };
}

// Capture outbound auth headers of the LAST outbound fetch.
let lastAuth = null;
let lastAccessTok = null;
let fetchCalls = 0;
beforeEach(() => {
  lastAuth = null;
  lastAccessTok = null;
  fetchCalls = 0;
  global.fetch = vi.fn(async (_url, opts) => {
    fetchCalls += 1;
    const h = (opts && opts.headers) || {};
    const get = (k) => (typeof h.get === 'function' ? h.get(k) : h[k]);
    lastAuth = get('authorization') || get('Authorization') || null;
    lastAccessTok = get('access-token') || get('Access-Token') || null;
    return {
      ok: true,
      status: 200,
      json: async () => ({ elements: [{ id: 'acc-1', name: 'Acct', status: 'ACTIVE', type: 'x', currency: 'USD' }], list: [], page_info: { total_number: 0 } }),
      text: async () => '{}',
    };
  });
});
afterEach(() => { delete global.fetch; });

function authTokenForUser(userId) {
  return generateToken({ sub: userId, id: userId, role: 'user' });
}

function buildApp(repos) {
  const app = express();
  app.use(express.json());
  // Mirror production _platforms.js: every platform router is wrapped with requireAuth.
  app.use('/linkedin-ads', requireAuth, createLinkedInAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/twitter-ads', requireAuth, createTwitterAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/reddit-ads', requireAuth, createGenericPlatformRouter('reddit', 'Reddit Ads', repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/google-ads', requireAuth, createGoogleAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/tiktok-ads', requireAuth, createTikTokAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/microsoft-ads', requireAuth, createMicrosoftAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/pinterest-ads', requireAuth, createPinterestAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/snapchat-ads', requireAuth, createSnapchatAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  return app;
}

describe('per-user token reaches the wire (cross-user leak proof)', () => {
  const repos = makeRepos();
  const app = buildApp(repos);

  it('linkedin: u1 sends USER token, never system/other', async () => {
    await request(app).get('/linkedin-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${OTHER_TOK}`);
  });

  it('twitter: u1 sends USER token, never system/other', async () => {
    await request(app).get('/twitter-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
  });

  it('generic reddit: u1 sends USER token, never system/other', async () => {
    await request(app).get('/reddit-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
  });

  it('google: u1 sends USER token via _getConfig (SDK bypasses fetch)', () => {
    const api = new GoogleAdsAPI(repos.settingsRepo);
    api.setActiveAccount(null, USER_TOK);
    expect(api._getConfig().oauth_token).toBe(USER_TOK);
    const sys = new GoogleAdsAPI(repos.settingsRepo);
    expect(sys._getConfig().oauth_token).toBe(SYS_TOK);
  });

  it('tiktok: u1 sends USER token via Access-Token header, never system/other', async () => {
    await request(app).get('/tiktok-ads/campaigns?advertiserId=acc-1').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAccessTok).toBe(USER_TOK);
    expect(lastAccessTok).not.toBe(SYS_TOK);
    expect(lastAccessTok).not.toBe(OTHER_TOK);
  });

  it('microsoft: u1 sends USER token, never system/other', async () => {
    await request(app).get('/microsoft-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
  });

  it('pinterest: u1 sends USER token, never system/other', async () => {
    await request(app).get('/pinterest-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
  });

  it('snapchat: u1 sends USER token, never system/other', async () => {
    await request(app).get('/snapchat-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u1')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${SYS_TOK}`);
  });

  it('user with NO bound account gets 400 (no system fallback for user routes)', async () => {
    const r = await request(app).get('/linkedin-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u2')}`);
    expect(r.status).toBe(400);
    expect(fetchCalls).toBe(0);
  });

  it('unauthenticated request has no token on the wire (401 before client build)', async () => {
    const r = await request(app).get('/linkedin-ads/accounts');
    expect(r.status).toBe(401);
    expect(fetchCalls).toBe(0);
  });
});
