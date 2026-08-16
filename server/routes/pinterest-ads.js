import { Router } from 'express';
import { PinterestAdsAPI } from '../services/pinterest/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('pinterest-ads');

export function createPinterestAdsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();

  // Build a Pinterest client bound to the REQUESTING USER's token (SaaS),
  // falling back to the system token. Per-request (not a shared singleton)
  // so concurrent users never share token state.
  function clientFor(req) {
    const api = new PinterestAdsAPI(settingsRepo);
    const token = resolveUserPlatformToken('pinterest', req, platformAccountsRepo, settingsRepo);
    if (token) api.setActiveAccount(null, token);
    return api;
  }

  // GET /api/pinterest-ads/status — connection status (per-user)
  router.get('/status', async (req, res) => {
    try {
      const token = resolveUserPlatformToken('pinterest', req, platformAccountsRepo, settingsRepo);
      const connected = !!token;
      res.json({ success: true, data: { connected, platform: 'pinterest' } });
    } catch {
      res.json({ success: true, data: { connected: false, platform: 'pinterest' } });
    }
  });

  // GET /api/pinterest-ads/accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await clientFor(req).getAdAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('Pinterest accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/pinterest-ads/accounts/:adAccountId/campaigns — list campaigns
  router.get('/accounts/:adAccountId/campaigns', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { entityStatus, pageSize } = req.query;
      const campaigns = await clientFor(req).getCampaigns(adAccountId, {
        entityStatus,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
      });
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error('Pinterest campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/pinterest-ads/accounts/:adAccountId/analytics — account analytics
  router.get('/accounts/:adAccountId/analytics', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { startDate, endDate, granularity } = req.query;
      const analytics = await clientFor(req).getCampaignAnalytics(adAccountId, {
        startDate,
        endDate,
        granularity,
      });
      res.json({ success: true, data: { analytics, total: analytics.length } });
    } catch (err) {
      log.error('Pinterest analytics fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/pinterest-ads/accounts/:adAccountId/campaigns — create campaign
  router.post('/accounts/:adAccountId/campaigns', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { name, status, dailySpendCap, objectiveType } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = await clientFor(req).createCampaign(adAccountId, { name, status, dailySpendCap, objectiveType });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Pinterest campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/pinterest-ads/campaigns/:campaignId — update campaign
  router.patch('/campaigns/:campaignId', async (req, res) => {
    try {
      const { campaignId } = req.params;
      const updates = req.body;
      const result = await clientFor(req).updateCampaign(campaignId, updates);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Pinterest campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/pinterest-ads/sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await clientFor(req).syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('Pinterest sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
