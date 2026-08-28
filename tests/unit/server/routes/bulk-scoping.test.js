import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Canonical per-user token resolver — returns null for missing/demo/placeholder tokens.
const resolverHolder = vi.hoisted(() => ({ token: 'owner-token' }));
vi.mock('../../../../server/lib/resolve-owner-platform.js', () => ({
  resolveOwnerPlatformToken: vi.fn((_platform, userId) =>
    userId === 'u-demo' ? null : resolverHolder.token
  ),
}));

// MetaAdsAPI.withToken returns the shared fake meta client.
const metaHolder = vi.hoisted(() => ({ api: null }));
vi.mock('../../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn((token) => (metaHolder.api = { token })) },
}));

// BulkOperations class — asserts the owner userId is threaded into every op.
const opsHolder = vi.hoisted(() => ({ last: null }));
vi.mock('../../../../server/services/bulk-operations.js', () => ({
  BulkOperations: class {
    constructor(meta, campaignsRepo, adsRepo) {
      this.meta = meta;
      this.campaignsRepo = campaignsRepo;
      this.adsRepo = adsRepo;
    }
    async bulkCreateAds(_accountId, _data, userId) {
      opsHolder.last = { name: 'bulkCreateAds', userId };
      return { ok: true, userId };
    }
    async bulkUpdateStatus(_ids, _status, userId) {
      opsHolder.last = { name: 'bulkUpdateStatus', userId };
      return { ok: true, userId };
    }
    async bulkScaleBudget(_ids, _opts, userId) {
      opsHolder.last = { name: 'bulkScaleBudget', userId };
      return { ok: true, userId };
    }
    async cloneCampaign(_src, _target, _opts, userId) {
      opsHolder.last = { name: 'cloneCampaign', userId };
      return { ok: true, userId };
    }
    getOperation(id) {
      return { operationId: id, status: 'done' };
    }
  },
}));

import { createBulkRouter } from '../../../../server/routes/bulk.js';

function createMockCampaignsRepo({ owns = true, found = true } = {}) {
  return {
    ownsAccount: vi.fn(async () => owns),
    findById: vi.fn(async () => (found ? { id: 'c1', user_id: 'u1' } : null)),
  };
}

function createApp(campaignsRepo, user, bulkOpsSingleton = {}) {
  const repos = { campaignsRepo, adsRepo: {}, settingsRepo: {}, platformAccountsRepo: {} };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/campaigns/bulk', createBulkRouter(bulkOpsSingleton, repos));
  return app;
}

describe('bulk operations route — multi-tenant scoping', () => {
  let campaignsRepo;
  let app;
  const user = { id: 'u1' };

  beforeEach(() => {
    campaignsRepo = createMockCampaignsRepo();
    app = createApp(campaignsRepo, user);
    opsHolder.last = null;
  });

  it('owner account → 200 and owner userId threaded to BulkOperations', async () => {
    const res = await request(app)
      .post('/api/campaigns/bulk/create-ads')
      .send({ accountId: 'act-owner', template: { name: 't' }, variants: [{ a: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('u1');
    expect(campaignsRepo.ownsAccount).toHaveBeenCalledWith('act-owner', 'u1');
    expect(opsHolder.last).toEqual({ name: 'bulkCreateAds', userId: 'u1' });
  });

  it('cross-user account → 403 (route-level ownsAccount gate, before any Meta call)', async () => {
    campaignsRepo = createMockCampaignsRepo({ owns: false });
    app = createApp(campaignsRepo, user);
    const res = await request(app)
      .post('/api/campaigns/bulk/create-ads')
      .send({ accountId: 'act-other', template: { name: 't' }, variants: [{ a: 1 }] });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('not authorized');
    expect(campaignsRepo.ownsAccount).toHaveBeenCalledWith('act-other', 'u1');
    expect(opsHolder.last).toBeNull(); // ownerBulkOps never reached
  });

  it('status update with cross-user campaign id → 403 (findById gate)', async () => {
    campaignsRepo = createMockCampaignsRepo({ found: false });
    app = createApp(campaignsRepo, user);
    const res = await request(app)
      .post('/api/campaigns/bulk/status')
      .send({ campaignIds: ['c-other'], status: 'PAUSED' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not authorized');
    expect(campaignsRepo.findById).toHaveBeenCalledWith('c-other', 'u1');
    expect(opsHolder.last).toBeNull();
  });

  it('status update with owned campaign id → 200 and owner userId threaded', async () => {
    const res = await request(app)
      .post('/api/campaigns/bulk/status')
      .send({ campaignIds: ['c1'], status: 'PAUSED' });
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe('u1');
    expect(opsHolder.last).toEqual({ name: 'bulkUpdateStatus', userId: 'u1' });
  });

  it('demo/placeholder token (resolveOwnerPlatformToken null) → 403', async () => {
    const demoApp = createApp(campaignsRepo, { id: 'u-demo' });
    // create-ads: ownsAccount true (repo mock default) → passes → ownerBulkOps throws
    const r1 = await request(demoApp)
      .post('/api/campaigns/bulk/create-ads')
      .send({ accountId: 'act-owner', template: { name: 't' }, variants: [{ a: 1 }] });
    expect(r1.status).toBe(403);
    expect(r1.body.error).toBe('not authorized');
    // scale-budget: findById true → passes → ownerBulkOps throws
    const r2 = await request(demoApp)
      .post('/api/campaigns/bulk/scale-budget')
      .send({ campaignIds: ['c1'], action: 'multiply', value: 2 });
    expect(r2.status).toBe(403);
    expect(r2.body.error).toBe('not authorized');
    // clone: findById true + ownsAccount true → passes → ownerBulkOps throws
    const r3 = await request(demoApp)
      .post('/api/campaigns/bulk/clone')
      .send({ sourceCampaignId: 'c1', targetAccountId: 'act-owner', rename: 'x' });
    expect(r3.status).toBe(403);
    expect(r3.body.error).toBe('not authorized');
    // No Meta call ever reached BulkOperations
    expect(opsHolder.last).toBeNull();
  });
  it('GET /progress is owner-scoped (cross-user operation UUID → 404)', async () => {
    const ownedSingleton = {
      getOperation: (id) => ({ operationId: id, status: 'done', userId: 'u1' }),
    };
    const ownerApp = createApp(campaignsRepo, { id: 'u1' }, ownedSingleton);
    const r1 = await request(ownerApp).get('/api/campaigns/bulk/progress/op-123');
    expect(r1.status).toBe(200);
    expect(r1.body.data.userId).toBe('u1');

    const otherApp = createApp(campaignsRepo, { id: 'u2' }, ownedSingleton);
    const r2 = await request(otherApp).get('/api/campaigns/bulk/progress/op-123');
    expect(r2.status).toBe(404);
    expect(r2.body.error).toBe('Operation not found');
  });

});
