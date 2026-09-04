import { Router } from 'express';
import { MicrosoftAdsAPI } from '../services/microsoft/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('microsoft-routes');

export function createMicrosoftRouter(platformAccountsRepo) {
  const router = Router();

  async function clientFor(req) {
    const userToken = await resolveUserPlatformToken(req, 'microsoft', platformAccountsRepo);
    return MicrosoftAdsAPI.withToken(userToken || '', {
      developerToken: process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || '',
      customerId: req.query.customerId || req.body?.customerId || '',
      accountId: req.query.accountId || req.body?.accountId || '',
    });
  }

  router.get('/accounts', async (req, res) => {
    try {
      const client = await clientFor(req);
      const accounts = await client.getAdAccounts();
      res.json({ success: true, data: accounts });
    } catch (err) {
      log.error('Failed to list Microsoft accounts', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { accountId, limit } = req.query;
      const campaigns = await client.getCampaigns(accountId, { limit: parseInt(limit) || 50 });
      res.json({ success: true, data: campaigns });
    } catch (err) {
      log.error('Failed to get Microsoft campaigns', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { accountId, name, budget } = req.body;
      const result = await client.createCampaign(accountId, { name, budget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to create Microsoft campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { accountId, status, budget } = req.body;
      const result = await client.updateCampaign(accountId, req.params.campaignId, { status, budget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to update Microsoft campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const client = await clientFor(req);
      const synced = await client.syncAllAccounts();
      res.json({ success: true, data: synced });
    } catch (err) {
      log.error('Failed to sync Microsoft', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { accountId, startDate, endDate } = req.query;
      const insights = await client.getCampaignInsights(accountId, req.params.campaignId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get Microsoft campaign insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/insights/account', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { accountId, startDate, endDate } = req.query;
      const insights = await client.getAccountInsights(accountId, { startDate, endDate });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get Microsoft account insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
