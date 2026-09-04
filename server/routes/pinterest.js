import { Router } from 'express';
import { PinterestAdsAPI } from '../services/pinterest/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('pinterest-routes');

export function createPinterestRouter(platformAccountsRepo) {
  const router = Router();

  async function clientFor(req) {
    const userToken = await resolveUserPlatformToken(req, 'pinterest', platformAccountsRepo);
    return PinterestAdsAPI.withToken(userToken || '');
  }

  router.get('/accounts', async (req, res) => {
    try {
      const client = await clientFor(req);
      const accounts = await client.getAdAccounts();
      res.json({ success: true, data: accounts });
    } catch (err) {
      log.error('Failed to list Pinterest accounts', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { adAccountId, limit } = req.query;
      const campaigns = await client.getCampaigns(adAccountId, { limit: parseInt(limit) || 50 });
      res.json({ success: true, data: campaigns });
    } catch (err) {
      log.error('Failed to get Pinterest campaigns', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { adAccountId, name, budget } = req.body;
      const result = await client.createCampaign(adAccountId, { name, budget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to create Pinterest campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { adAccountId, status } = req.body;
      const result = await client.updateCampaign(adAccountId, req.params.campaignId, { status });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to update Pinterest campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const client = await clientFor(req);
      const synced = await client.syncAllAccounts();
      res.json({ success: true, data: synced });
    } catch (err) {
      log.error('Failed to sync Pinterest', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { adAccountId, startDate, endDate } = req.query;
      const insights = await client.getCampaignInsights(adAccountId, req.params.campaignId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get Pinterest campaign insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/account', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { adAccountId, startDate, endDate } = req.query;
      const insights = await client.getAccountInsights(adAccountId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get Pinterest account insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
