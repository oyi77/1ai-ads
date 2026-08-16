import { Router } from 'express';
import { MicrosoftAdsAPI } from '../services/microsoft/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('microsoft-ads');

export function createMicrosoftAdsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();

  // Build a Microsoft client bound to the REQUESTING USER's token (SaaS),
  // falling back to the system token. Per-request (not a shared singleton)
  // so concurrent users never share token state.
  function clientFor(req) {
    const api = new MicrosoftAdsAPI(settingsRepo);
    const token = resolveUserPlatformToken('microsoft', req, platformAccountsRepo, settingsRepo);
    if (token) api.setActiveAccount(null, token);
    return api;
  }

  // GET /api/microsoft-ads/status — Connection status (per-user)
  router.get('/status', async (req, res) => {
    try {
      const token = resolveUserPlatformToken('microsoft', req, platformAccountsRepo, settingsRepo);
      const connected = !!token;
      res.json({ success: true, data: { connected, platform: 'microsoft' } });
    } catch {
      res.json({ success: true, data: { connected: false, platform: 'microsoft' } });
    }
  });

  // GET /api/microsoft-ads/accounts — List accessible Microsoft Ads accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await clientFor(req).listAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('Microsoft Ads accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/microsoft-ads/accounts/:accountId/campaigns — List campaigns
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { pageSize } = req.query;
      const campaigns = await clientFor(req).getCampaigns(accountId, { pageSize: parseInt(pageSize) || 100 });
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error('Microsoft Ads campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/microsoft-ads/accounts/:accountId/performance — Campaign performance
  router.get('/accounts/:accountId/performance', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { days } = req.query;
      const performance = await clientFor(req).getCampaignPerformance(accountId, { days: parseInt(days) || 30 });
      res.json({ success: true, data: { performance, total: performance.length } });
    } catch (err) {
      log.error('Microsoft Ads performance fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/microsoft-ads/accounts/:accountId/campaigns — Create campaign
  router.post('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { name, dailyBudget, campaignType, status } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = await clientFor(req).createCampaign(accountId, { name, dailyBudget, campaignType, status });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Microsoft Ads campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/microsoft-ads/accounts/:accountId/campaigns/:campaignId — Update campaign
  router.patch('/accounts/:accountId/campaigns/:campaignId', async (req, res) => {
    try {
      const { accountId, campaignId } = req.params;
      const updates = req.body;
      const result = await clientFor(req).updateCampaign(accountId, campaignId, updates);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Microsoft Ads campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/microsoft-ads/sync — Sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await clientFor(req).syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('Microsoft Ads sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
