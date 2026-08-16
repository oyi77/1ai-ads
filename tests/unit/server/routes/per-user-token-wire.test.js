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

// Distinct tokens so we can PROVE which one hits the wire.
const USER_TOK = 'USER_BOUND_TOKEN_123';
const SYS_TOK = 'SYSTEM_FALLBACK_TOKEN_999';
const OTHER_TOK = 'OTHER_USER_TOKEN_SHOULD_NEVER_APPEAR';

// Minimal fake repos.
function makeRepos() {
  return {
    settingsRepo: {
      getCredentials: (platform) =>
        platform === 'linkedin' || platform === 'twitter' || platform === 'reddit'
          ? { access_token: SYS_TOK }
          : null,
    },
    platformAccountsRepo: {
      // Only the requesting user u1 has a bound account; u2 (other) does NOT.
      getByPlatform: (userId, platform) => {
        if (userId === 'u1' && ['linkedin', 'twitter', 'reddit'].includes(platform)) {
          return { id: 'acc-1', access_token: USER_TOK };
        }
        return null;
      },
    },
  };
}

// Capture the Authorization header of the LAST outbound fetch.
let lastAuth = null;
let fetchCalls = 0;
beforeEach(() => {
  lastAuth = null;
  fetchCalls = 0;
  global.fetch = vi.fn(async (_url, opts) => {
    fetchCalls += 1;
    const h = (opts && opts.headers) || {};
    const auth = h.Authorization || (typeof h.get === 'function' ? h.get('authorization') : null);
    lastAuth = auth || null;
    return {
      ok: true,
      status: 200,
      json: async () => ({ elements: [{ id: 'acc-1', name: 'Acct', status: 'ACTIVE', type: 'x', currency: 'USD' }] }),
      text: async () => '{}',
    };
  });
});
afterEach(() => { delete global.fetch; });

function authTokenForUser(userId) {
  // Real signed JWT (verifies against the same secret the middleware uses).
  return generateToken({ sub: userId, id: userId, role: 'user' });
}

function buildApp(repos) {
  const app = express();
  app.use(express.json());
  // Mirror production _platforms.js: every platform router is wrapped with requireAuth.
  app.use('/linkedin-ads', requireAuth, createLinkedInAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/twitter-ads', requireAuth, createTwitterAdsRouter(repos.settingsRepo, repos.platformAccountsRepo));
  app.use('/reddit-ads', requireAuth, createGenericPlatformRouter('reddit', 'Reddit Ads', repos.settingsRepo, repos.platformAccountsRepo));
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

  it('user with NO bound account falls back to SYSTEM token (not another user)', async () => {
    await request(app).get('/linkedin-ads/accounts').set('Authorization', `Bearer ${authTokenForUser('u2')}`);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(lastAuth).toBe(`Bearer ${SYS_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${USER_TOK}`);
    expect(lastAuth).not.toBe(`Bearer ${OTHER_TOK}`);
  });

  it('unauthenticated request has no token on the wire (401 before client build)', async () => {
    const r = await request(app).get('/linkedin-ads/accounts');
    expect(r.status).toBe(401);
    expect(fetchCalls).toBe(0);
  });
});
