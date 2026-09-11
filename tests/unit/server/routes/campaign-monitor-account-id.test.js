import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';


// This router is auth-gated; the request-level user is injected by the harness.
vi.mock('../../../../server/middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => next(),
}));
vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Stand-in Meta client: records the token and answers getAdAccounts from the holder.
const metaHolder = vi.hoisted(() => ({ token: null, accounts: [] }));
vi.mock('../../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn((token) => {
      metaHolder.token = token;
      return { getAdAccounts: vi.fn(async () => metaHolder.accounts) };
    }),
  },
}));

import { createCampaignMonitorRouter } from '../../../../server/routes/campaign-monitor.js';

const AD_ACT = 'act_1181078009580337';
const UUID = '75ae98b6-18dc-4792-ad00-24773887d6dd';

function createApp(service, rows, user = { id: 'u1' }) {
  const platformAccountsRepo = {
    // Synchronous, matching platform-accounts.js.
    findAllActiveByUserAndPlatform: vi.fn((userId, platform) =>
      rows.filter((r) => r.user_id === userId && r.platform === platform)
    ),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/campaign-monitor', createCampaignMonitorRouter(service, { platformAccountsRepo }));
  return app;
}

function makeService() {
  return {
    getAccountStatus: vi.fn(async () => ({ ok: 'status' })),
    getAccountHealth: vi.fn(async () => ({ ok: 'health' })),
    getAlerts: vi.fn(async () => ({ ok: 'alerts' })),
    getPerformanceTrend: vi.fn(async () => ({ ok: 'trend' })),
    autoPauseCheck: vi.fn(async () => ({ ok: 'autopause' })),
  };
}

describe('campaign-monitor route — real Meta account id resolution', () => {
  let service;

  beforeEach(() => {
    service = makeService();
    metaHolder.token = null;
    metaHolder.accounts = [];
  });

  // The production bug: platform_accounts.id (an internal UUID) was forwarded to
  // the Graph API as the ad-account id, so every method 400'd and silently
  // degraded to its empty / api_unavailable fallback.
  it('rejects the internal platform_accounts UUID with 404 and never calls the service', async () => {
    const rows = [{ id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge', credentials: { access_token: 'tok' } }];
    const res = await request(createApp(service, rows)).get(`/api/campaign-monitor/${UUID}/status`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(service.getAccountStatus).not.toHaveBeenCalled();
  });

  it('resolves the recorded ad_account_id to act_<id> for the service', async () => {
    const rows = [{
      id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge',
      credentials: { access_token: 'tok', ad_account_id: '1181078009580337' },
    }];
    const res = await request(createApp(service, rows)).get(`/api/campaign-monitor/${AD_ACT}/status`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: 'status' } });
    expect(service.getAccountStatus).toHaveBeenCalledWith(AD_ACT, 'u1');
  });

  it('accepts the bare numeric id form as well as act_-prefixed', async () => {
    const rows = [{
      id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge',
      credentials: { access_token: 'tok', ad_account_id: '1181078009580337' },
    }];
    const res = await request(createApp(service, rows))
      .post('/api/campaign-monitor/1181078009580337/auto-pause-check');

    expect(res.status).toBe(200);
    expect(service.autoPauseCheck).toHaveBeenCalledWith(AD_ACT, 'u1');
  });

  it("does not serve another user's account (404, no cross-user oracle)", async () => {
    const rows = [{
      id: UUID, user_id: 'someone-else', platform: 'meta', account_name: 'Adforge',
      credentials: { access_token: 'tok', ad_account_id: '1181078009580337' },
    }];
    const res = await request(createApp(service, rows, { id: 'u1' })).get(`/api/campaign-monitor/${AD_ACT}/health`);

    expect(res.status).toBe(404);
    expect(service.getAccountHealth).not.toHaveBeenCalled();
    // The other user's token must never be used to probe Meta on our behalf.
    expect(metaHolder.token).toBeNull();
  });

  it('falls back to the owner token when no ad_account_id was recorded', async () => {
    const rows = [{ id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge', credentials: { access_token: 'owner-tok' } }];
    metaHolder.accounts = [{ id: AD_ACT, name: 'Selow ID 1340', currency: 'IDR' }];

    const res = await request(createApp(service, rows)).get(`/api/campaign-monitor/${AD_ACT}/alerts`);

    expect(res.status).toBe(200);
    expect(metaHolder.token).toBe('owner-tok');
    expect(service.getAlerts).toHaveBeenCalledWith(AD_ACT, 'u1');
  });

  it('404s when the owner token cannot see the requested account', async () => {
    const rows = [{ id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge', credentials: { access_token: 'owner-tok' } }];
    metaHolder.accounts = [{ id: 'act_999999', name: 'Unrelated' }];

    const res = await request(createApp(service, rows)).get(`/api/campaign-monitor/${AD_ACT}/status`);

    expect(res.status).toBe(404);
    expect(service.getAccountStatus).not.toHaveBeenCalled();
  });

  it('threads days into the trend call', async () => {
    const rows = [{
      id: UUID, user_id: 'u1', platform: 'meta', account_name: 'Adforge',
      credentials: { access_token: 'tok', ad_account_id: '1181078009580337' },
    }];
    const res = await request(createApp(service, rows)).get(`/api/campaign-monitor/${AD_ACT}/trend?days=14`);

    expect(res.status).toBe(200);
    expect(service.getPerformanceTrend).toHaveBeenCalledWith(AD_ACT, 14, 'u1');
  });
});
