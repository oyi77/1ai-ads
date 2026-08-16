import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { generateToken } from '../../../../server/lib/auth.js';
import { createAuthGroupRouter } from '../../../../server/routes/_auth.js';

// Distinct user-bound data so we can PROVE the export only returns the
// requesting user's own records. The leaky-DB fallback (no userId filter)
// returns ALL users' data — a regression to the pre-fix behavior would leak
// user-2's campaigns/accounts into user-1's export and fail these assertions.
const user1Campaigns = [{ id: 'c1', userId: 'user-1', name: 'Campaign 1' }];
const user2Campaigns = [{ id: 'c2', userId: 'user-2', name: 'Campaign 2' }];
const allCampaigns = [...user1Campaigns, ...user2Campaigns];

const user1Accounts = [{ id: 'pa1', userId: 'user-1', platform: 'meta', account_name: 'A1', is_active: 1, created_at: 't' }];
const user2Accounts = [{ id: 'pa2', userId: 'user-2', platform: 'google', account_name: 'A2', is_active: 1, created_at: 't' }];
const allAccounts = [...user1Accounts, ...user2Accounts];

function makeRepos() {
  return {
    usersRepo: {
      findById: (id) =>
        id === 'user-1'
          ? { id: 'user-1', username: 'u1', email: 'u1@x.com', role: 'user', plan: 'free', created_at: 't' }
          : null,
    },
    // Leaky default: returns every user's campaigns when called without a
    // { userId } filter — exactly what the unfixed code did.
    campaignsRepo: {
      findAll: vi.fn((q) => {
        if (q && q.userId) {
          const d = allCampaigns.filter((c) => c.userId === q.userId);
          return { data: d, total: d.length };
        }
        return { data: allCampaigns, total: allCampaigns.length };
      }),
    },
    platformAccountsRepo: {
      findByUserId: vi.fn((id) => {
        if (id) return allAccounts.filter((a) => a.userId === id);
        return allAccounts;
      }),
    },
    refreshTokensRepo: {},
    settingsRepo: {},
    auditRepo: {},
  };
}

function buildApp(repos) {
  const app = express();
  app.use(express.json());
  app.use(
    '/',
    createAuthGroupRouter({ repos, services: {}, publicRateLimit: (_req, _res, next) => next() }),
  );
  return app;
}

function tokenFor(userId) {
  return generateToken({ sub: userId, id: userId, role: 'user' });
}

describe('GDPR /auth/export-data is scoped to the requesting user', () => {
  let repos;
  let app;

  beforeEach(() => {
    repos = makeRepos();
    app = buildApp(repos);
  });

  it('returns only the requesting user campaigns and platform accounts', async () => {
    const res = await request(app)
      .get('/auth/export-data')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.campaigns.data.map((c) => c.id)).toEqual(['c1']);
    expect(data.campaigns.data.some((c) => c.id === 'c2')).toBe(false);

    expect(data.platform_accounts.map((a) => a.id)).toEqual(['pa1']);
    expect(data.platform_accounts.some((a) => a.id === 'pa2')).toBe(false);

    // The repo was queried with the requesting user's id, never unscoped.
    expect(repos.campaignsRepo.findAll).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(repos.platformAccountsRepo.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('returns 404 when the authenticated user does not exist', async () => {
    const res = await request(app)
      .get('/auth/export-data')
      .set('Authorization', `Bearer ${tokenFor('ghost')}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('User not found');
    expect(repos.campaignsRepo.findAll).not.toHaveBeenCalled();
  });
});
