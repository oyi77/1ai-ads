import { Router } from 'express';
import { TikTokAdsAPI } from '../services/tiktok/index.js';
import { createTikTokSync } from '../services/tiktok-sync.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('tiktok-routes');

export function createTikTokRouter(platformAccountsRepo, campaignsRepo) {
  const router = Router();

  async function clientFor(req) {
    const userToken = await resolveUserPlatformToken(req, 'tiktok', platformAccountsRepo);
    return TikTokAdsAPI.withToken(userToken || '', {
      appId: process.env.TIKTOK_APP_ID || '',
      secret: process.env.TIKTOK_APP_SECRET || '',
      advertiserId: req.query.advertiserId || req.body?.advertiserId || '',
    });
  }

  router.get('/accounts', async (req, res) => {
    try {
      const client = await clientFor(req);
      const accounts = await client.getAdAccounts();
      res.json({ success: true, data: accounts });
    } catch (err) {
      log.error('Failed to list TikTok accounts', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { advertiserId, limit, status } = req.query;
      const campaigns = await client.getCampaigns(advertiserId, { limit: parseInt(limit) || 50, status });
      res.json({ success: true, data: campaigns });
    } catch (err) {
      log.error('Failed to get TikTok campaigns', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { advertiserId, name, budget, objective } = req.body;
      const result = await client.createCampaign(advertiserId, { name, budget, objective });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to create TikTok campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { advertiserId, status, budget } = req.body;
      const result = await client.updateCampaign(advertiserId, req.params.campaignId, { status, budget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to update TikTok campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const client = await clientFor(req);
      const synced = await createTikTokSync(client, req.user.id, campaignsRepo);
      res.json({ success: true, data: synced });
    } catch (err) {
      log.error('Failed to sync TikTok', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { advertiserId, startDate, endDate } = req.query;
      const insights = await client.getCampaignInsights(advertiserId, req.params.campaignId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get TikTok campaign insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/account', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { advertiserId, startDate, endDate } = req.query;
      const insights = await client.getAccountInsights(advertiserId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get TikTok account insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
