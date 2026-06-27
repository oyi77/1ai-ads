import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Silence logger output
vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { createCampaignsRouter } from '../../../../server/routes/campaigns.js';

function createMockOrchestrator() {
  return {
    createFullCampaign: vi.fn(async () => ({ campaignId: 'camp-001', adsetId: 'as-001', creativeId: 'cr-001', adId: 'ad-001' })),
    activateCampaign: vi.fn(async () => ({})),
    pauseCampaign: vi.fn(async () => ({})),
    scaleBudget: vi.fn(async () => ({})),
  };
}

function createMockMetaApi() {
  return {
    searchTargeting: vi.fn(async () => [{ id: '1', name: 'Marketing', audience_size: 50000 }]),
    getPages: vi.fn(async () => [{ id: 'p1', name: 'My Page' }]),
    getAdAccounts: vi.fn(async () => [{ id: 'act_123', name: 'Test Ad Account' }]),
    getCampaigns: vi.fn(async () => []),
    getMultiCampaignInsights: vi.fn(async () => ({})),
    getCampaignInsights: vi.fn(async () => ({ impressions: 1000, clicks: 50 })),
    getAds: vi.fn(async () => []),
    _get: vi.fn(async () => ({ data: [] })),
  };
}

function createMockCreativeStudio() {
  return {
    generateAdPackage: vi.fn(async () => ({ headline: 'Buy now', body: 'Best product', images: [] })),
  };
}

function createMockCampaignsRepo() {
  return {
    findAll: vi.fn(() => ({ data: [], total: 0 })),
    upsert: vi.fn(),
  };
}

function createMockAdsRepo() {
  return {
    findById: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
  };
}

function createApp(orchestrator, metaApi, creativeStudio, campaignsRepo, adsRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns', createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo, adsRepo));
  return app;
}

describe('Campaigns Router', () => {
  let app, orchestrator, metaApi, creativeStudio, campaignsRepo, adsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = createMockOrchestrator();
    metaApi = createMockMetaApi();
    creativeStudio = createMockCreativeStudio();
    campaignsRepo = createMockCampaignsRepo();
    adsRepo = createMockAdsRepo();
    app = createApp(orchestrator, metaApi, creativeStudio, campaignsRepo, adsRepo);
  });

  // ─── POST /create ──────────────────────────────────────────────────

  describe('POST /create', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/campaigns/create').send({ product: 'Widget' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/accountId, product, and dailyBudget/);
    });

    it('creates a full campaign and saves to repo', async () => {
      const res = await request(app).post('/api/campaigns/create').send({
        accountId: 'act_123', product: 'Widget', dailyBudget: '50.00',
        pageId: 'p1', target: 'Young adults', objective: 'OUTCOME_LEADS',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.campaignId).toBe('camp-001');
      expect(orchestrator.createFullCampaign).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'act_123', product: 'Widget', dailyBudget: 50, objective: 'OUTCOME_LEADS',
      }));
      expect(campaignsRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'meta', campaign_id: 'camp-001', status: 'paused', budget: 50,
      }));
    });

    it('returns 500 when orchestrator throws', async () => {
      orchestrator.createFullCampaign.mockRejectedValue(new Error('Meta API down'));
      const res = await request(app).post('/api/campaigns/create').send({
        accountId: 'act_123', product: 'Widget', dailyBudget: '50',
      });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Meta API down');
    });
  });

  // ─── POST /:id/activate ────────────────────────────────────────────

  describe('POST /:id/activate', () => {
    it('activates a campaign', async () => {
      const res = await request(app).post('/api/campaigns/camp-001/activate');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(orchestrator.activateCampaign).toHaveBeenCalledWith('camp-001');
    });

    it('returns 500 on failure', async () => {
      orchestrator.activateCampaign.mockRejectedValue(new Error('Already active'));
      const res = await request(app).post('/api/campaigns/camp-001/activate');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Already active');
    });
  });

  // ─── POST /:id/pause ───────────────────────────────────────────────

  describe('POST /:id/pause', () => {
    it('pauses a campaign', async () => {
      const res = await request(app).post('/api/campaigns/camp-001/pause');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSED');
      expect(orchestrator.pauseCampaign).toHaveBeenCalledWith('camp-001');
    });

    it('returns 500 on failure', async () => {
      orchestrator.pauseCampaign.mockRejectedValue(new Error('Already paused'));
      const res = await request(app).post('/api/campaigns/camp-001/pause');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Already paused');
    });
  });

  // ─── PUT /:id/budget ───────────────────────────────────────────────

  describe('PUT /:id/budget', () => {
    it('updates campaign budget', async () => {
      const res = await request(app).put('/api/campaigns/camp-001/budget').send({ dailyBudget: '100' });
      expect(res.status).toBe(200);
      expect(orchestrator.scaleBudget).toHaveBeenCalledWith('camp-001', 100);
      expect(res.body.data.dailyBudget).toBe('100');
    });

    it('returns 400 when dailyBudget missing', async () => {
      const res = await request(app).put('/api/campaigns/camp-001/budget').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dailyBudget/);
    });

    it('returns 500 when orchestrator throws', async () => {
      orchestrator.scaleBudget.mockRejectedValue(new Error('Budget too low'));
      const res = await request(app).put('/api/campaigns/camp-001/budget').send({ dailyBudget: '5' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Budget too low');
    });
  });

  // ─── GET /targeting/search ─────────────────────────────────────────

  describe('GET /targeting/search', () => {
    it('returns 400 when q is missing', async () => {
      const res = await request(app).get('/api/campaigns/targeting/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/q/);
    });

    it('returns targeting results', async () => {
      const res = await request(app).get('/api/campaigns/targeting/search?q=marketing&type=adinterest');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(metaApi.searchTargeting).toHaveBeenCalledWith('marketing', 'adinterest');
    });

    it('returns 500 when metaApi throws', async () => {
      metaApi.searchTargeting.mockRejectedValue(new Error('Rate limited'));
      const res = await request(app).get('/api/campaigns/targeting/search?q=test');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Rate limited');
    });
  });

  // ─── GET /pages ────────────────────────────────────────────────────

  describe('GET /pages', () => {
    it('returns pages list', async () => {
      const res = await request(app).get('/api/campaigns/pages');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 'p1', name: 'My Page' }]);
    });

    it('returns empty array on permission error', async () => {
      metaApi.getPages.mockRejectedValue(new Error('permission denied'));
      const res = await request(app).get('/api/campaigns/pages');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on other errors', async () => {
      metaApi.getPages.mockRejectedValue(new Error('Server error'));
      const res = await request(app).get('/api/campaigns/pages');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Server error');
    });
  });

  // ─── GET /accounts ─────────────────────────────────────────────────

  describe('GET /accounts', () => {
    it('returns ad accounts', async () => {
      const res = await request(app).get('/api/campaigns/accounts');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 'act_123', name: 'Test Ad Account' }]);
    });

    it('returns 500 on error', async () => {
      metaApi.getAdAccounts.mockRejectedValue(new Error('Auth expired'));
      const res = await request(app).get('/api/campaigns/accounts');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Auth expired');
    });
  });

  // ─── POST /sync ────────────────────────────────────────────────────

  describe('POST /sync', () => {
    it('returns no accounts message when empty', async () => {
      metaApi.getAdAccounts.mockResolvedValue([]);
      const res = await request(app).post('/api/campaigns/sync').send({ accountId: 'act_123' });
      expect(res.status).toBe(200);
      expect(res.body.data.message).toMatch(/No ad accounts found/);
    });

    it('syncs campaigns with insights', async () => {
      metaApi.getAdAccounts.mockResolvedValue([{ id: 'act_123', name: 'Acct' }]);
      metaApi.getCampaigns.mockResolvedValue([
        { id: 'camp-1', name: 'Summer Sale', status: 'ACTIVE', dailyBudget: 100 },
      ]);
      metaApi.getMultiCampaignInsights.mockResolvedValue({
        'camp-1': { spend: '50', revenue: '150', impressions: '1000', clicks: '50', conversions: '5' },
      });

      const res = await request(app).post('/api/campaigns/sync').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.campaigns).toBe(1);
      expect(campaignsRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        campaign_id: 'camp-1', spend: 50, revenue: 150, roas: 3,
      }));
    });

    it('returns 500 when getAdAccounts fails at top level', async () => {
      metaApi.getAdAccounts.mockRejectedValue(new Error('Sync error'));
      const res = await request(app).post('/api/campaigns/sync').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get ad accounts: Sync error');
    });
  });

  // ─── GET / ─────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns all campaigns', async () => {
      campaignsRepo.findAll.mockReturnValue({ data: [{ id: 'c1', name: 'Test' }], total: 1 });
      const res = await request(app).get('/api/campaigns/');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('returns error on failure', async () => {
      campaignsRepo.findAll.mockImplementation(() => { throw new Error('db fail'); });
      const res = await request(app).get('/api/campaigns/');
      expect(res.status).toBe(200); // handler returns 200 with success:false
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('db fail');
    });
  });

  // ─── POST /creative ────────────────────────────────────────────────

  describe('POST /creative', () => {
    it('returns 400 when product missing', async () => {
      const res = await request(app).post('/api/campaigns/creative').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/product/);
    });

    it('generates creative package', async () => {
      const res = await request(app).post('/api/campaigns/creative').send({
        product: 'Widget', target: 'Adults', keunggulan: 'Cheap', platform: 'meta',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.headline).toBe('Buy now');
      expect(creativeStudio.generateAdPackage).toHaveBeenCalledWith('Widget', 'Adults', 'Cheap', 'meta', 'single_image');
    });

    it('returns 500 on creative studio error', async () => {
      creativeStudio.generateAdPackage.mockRejectedValue(new Error('AI unavailable'));
      const res = await request(app).post('/api/campaigns/creative').send({ product: 'Widget' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('AI unavailable');
    });
  });

  // ─── GET /list ─────────────────────────────────────────────────────

  describe('GET /list', () => {
    it('returns simple campaign list', async () => {
      campaignsRepo.findAll.mockReturnValue({ data: [{ id: 'c1' }], total: 1 });
      const res = await request(app).get('/api/campaigns/list');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    it('returns error on failure', async () => {
      campaignsRepo.findAll.mockImplementation(() => { throw new Error('oops'); });
      const res = await request(app).get('/api/campaigns/list');
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('oops');
    });
  });

  // ─── GET /:id ──────────────────────────────────────────────────────

  describe('GET /:id', () => {
    it('returns campaign insights', async () => {
      const res = await request(app).get('/api/campaigns/camp-001');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('camp-001');
      expect(res.body.data.insights.impressions).toBe(1000);
    });

    it('returns 500 on error', async () => {
      metaApi.getCampaignInsights.mockRejectedValue(new Error('Not found'));
      const res = await request(app).get('/api/campaigns/camp-001');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Not found');
    });
  });

  // ─── GET /sync/ads ─────────────────────────────────────────────────

  describe('GET /sync/ads', () => {
    it('returns empty when no ad accounts', async () => {
      metaApi.getAdAccounts.mockResolvedValue([]);
      const res = await request(app).get('/api/campaigns/sync/ads');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('fetches ads from Meta and returns them', async () => {
      metaApi.getAdAccounts.mockResolvedValue([{ id: 'act_1' }]);
      metaApi.getAds.mockResolvedValue([
        { id: 'ad-1', name: 'Ad 1', status: 'ACTIVE', creative: { title: 'Test' } },
      ]);
      const res = await request(app).get('/api/campaigns/sync/ads');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('ad-1');
    });

    it('returns 500 on top-level error', async () => {
      metaApi.getAdAccounts.mockRejectedValue(new Error('API down'));
      const res = await request(app).get('/api/campaigns/sync/ads');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('API down');
    });
  });
});
