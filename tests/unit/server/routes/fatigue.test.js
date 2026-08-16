import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mock logger (no-op) ───────────────────────────────────────
vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

// ── Mock platform-accounts repo (parity with meta/campaigns tests) ──
function createMockPlatformAccountsRepo() {
  return {
    getByPlatform: vi.fn(() => null), // default: no user-bound account
  };
}

// ── Mock fatigue detector ─────────────────────────────────────
function createMockFatigueDetector() {
  return {
    detectFatigue: vi.fn(() => Promise.resolve({ fatigued: false })),
  };
}

import { createFatigueRouter } from '../../../../server/routes/fatigue.js';

function createApp(platformAccountsRepo, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user || null; // simulate requireAuth
    next();
  });
  app.use('/api/creative/fatigue', createFatigueRouter(createMockFatigueDetector(), platformAccountsRepo));
  return app;
}

describe('fatigue router — per-user scoping', () => {
  let platformAccountsRepo;

  beforeEach(() => {
    platformAccountsRepo = createMockPlatformAccountsRepo();
  });

  it('scopes fatigue detection to the requesting user when a Meta account is bound', async () => {
    platformAccountsRepo.getByPlatform.mockReturnValue({ id: 'acct-1', access_token: 'USER_TOKEN' });
    const app = createApp(platformAccountsRepo, { id: 'user-1' });

    const res = await request(app).get('/api/creative/fatigue');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Must scope by req.user.id, NOT a global active-account scan
    expect(platformAccountsRepo.getByPlatform).toHaveBeenCalledWith('user-1', 'meta');
    expect(res.body.data).toEqual({ fatigued: false });
  });

  it('does NOT run detection for a different user account (no cross-user leak)', async () => {
    // A globally-active account exists but belongs to ANOTHER user
    platformAccountsRepo.getByPlatform.mockReturnValue(null); // requesting user has none bound
    const app = createApp(platformAccountsRepo, { id: 'user-1' });

    const res = await request(app).get('/api/creative/fatigue');

    expect(res.status).toBe(200);
    expect(platformAccountsRepo.getByPlatform).toHaveBeenCalledWith('user-1', 'meta');
    // No leak: never falls back to a different user's account
    expect(res.body.data).toEqual([]);
  });

  it('returns empty list when no user is authenticated', async () => {
    const app = createApp(platformAccountsRepo, null);

    const res = await request(app).get('/api/creative/fatigue');

    expect(res.status).toBe(200);
    expect(platformAccountsRepo.getByPlatform).not.toHaveBeenCalled();
    expect(res.body.data).toEqual([]);
  });
});
