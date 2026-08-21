import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mock logger (no-op) ───────────────────────────────────────
vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Mock MetaAdsAPI so we can assert per-user vs system token ──
const { withToken } = vi.hoisted(() => ({ withToken: vi.fn((token) => ({ __token: token, getAccounts: vi.fn() })) }));
vi.mock('../../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken },
}));
// ── Mock global fetch (no real Meta calls) ────────────────────
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve({ json: async () => ({ error: { message: 'mock meta error' } }) }))
);

// ── Mock platform-accounts repo (parity with campaigns test) ──
function createMockPlatformAccountsRepo() {
  return {
    getByPlatform: vi.fn(() => null), // default: no user-bound token
  };
}

// ── Mock settings repo ────────────────────────────────────────
function createMockSettingsRepo() {
  return {
    get: vi.fn(() => null),
    set: vi.fn(),
    addAccount: vi.fn(),
    delete: vi.fn(),
  };
}

import { createMetaAccountsRouter } from '../../../../server/routes/meta-accounts.js';

function createApp(platformAccountsRepo, settingsRepo) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Simulate requireAuth: a real bearer token populates req.user.id; an
    // absent token means the request was never authenticated (401 upstream).
    const auth = req.headers.authorization?.replace('Bearer ', '');
    req.user = auth ? { id: 'user-1', sub: 'user-1', token: auth } : null;
    next();
  });
  app.use('/api/meta', createMetaAccountsRouter(settingsRepo, platformAccountsRepo));
  return app;
}


describe('meta-accounts router — per-user token scoping', () => {
  let platformAccountsRepo;
  let settingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    platformAccountsRepo = createMockPlatformAccountsRepo();
    settingsRepo = createMockSettingsRepo();
  });

  it('uses per-user Meta token when the user has a bound account', async () => {
    platformAccountsRepo.getByPlatform.mockReturnValue({
      access_token: 'USER_TOKEN',
      is_active: 1,
    });

    const app = createApp(platformAccountsRepo, settingsRepo);
    await request(app)
      .get('/api/meta')
      .set('Authorization', 'Bearer test-token');

    // Per-user token resolved → withToken called with USER_TOKEN
    expect(withToken).toHaveBeenCalledWith('USER_TOKEN');
    // System-wide fallback must NOT be used
    expect(withToken).not.toHaveBeenCalledWith(null);
    // Repo scoped by the requesting user + platform
    expect(platformAccountsRepo.getByPlatform).toHaveBeenCalledWith('user-1', 'meta');
  });

  it('returns 400 when user has no bound account (no system token fallback)', async () => {
    platformAccountsRepo.getByPlatform.mockReturnValue(null);

    const app = createApp(platformAccountsRepo, settingsRepo);
    const res = await request(app)
      .get('/api/meta')
      .set('Authorization', 'Bearer test-token');

    // Unbound user must NOT borrow the operator/system token
    expect(res.status).toBe(400);
    expect(withToken).not.toHaveBeenCalledWith(null);
    expect(platformAccountsRepo.getByPlatform).toHaveBeenCalledWith('user-1', 'meta');
  });

  it('does not leak another users token (queries by req.user.id)', async () => {
    platformAccountsRepo.getByPlatform.mockReturnValue({
      access_token: 'USER_TOKEN',
      is_active: 1,
    });

    const app = createApp(platformAccountsRepo, settingsRepo);
    await request(app)
      .get('/api/meta/business-managers')
      .set('Authorization', 'Bearer token-user-2');

    // Must scope by the requesting user, not a cross-user first row
    expect(platformAccountsRepo.getByPlatform).toHaveBeenCalledWith('user-1', 'meta');
    expect(withToken).toHaveBeenCalledWith('USER_TOKEN');
  });

  it('returns 401 when authentication missing', async () => {
    const app = createApp(platformAccountsRepo, settingsRepo);
    const res = await request(app).get('/api/meta/business-managers');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when user has no connected Meta account', async () => {
    platformAccountsRepo.getByPlatform.mockReturnValue(null);
    settingsRepo.get.mockReturnValue(null);

    const app = createApp(platformAccountsRepo, settingsRepo);
    const res = await request(app)
      .get('/api/meta')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
