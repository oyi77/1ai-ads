import { Router } from 'express';
import { PinterestAdsAPI } from '../services/pinterest-ads-api.js';

export function createPinterestAdsRouter(settingsRepo) {
  const router = Router();
  const pinterest = new PinterestAdsAPI(settingsRepo);

  // GET /api/pinterest-ads/status — connection status
  router.get('/status', async (req, res) => {
    try {
      const creds = settingsRepo.getCredentials('pinterest');
      const connected = !!creds?.access_token;
      res.json({ success: true, data: { connected, platform: 'pinterest' } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, platform: 'pinterest' } });
    }
  });

  // GET /api/pinterest-ads/accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await pinterest.getAdAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      console.error('Pinterest accounts fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/pinterest-ads/accounts/:adAccountId/campaigns — list campaigns
  router.get('/accounts/:adAccountId/campaigns', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { entityStatus, pageSize } = req.query;
      const campaigns = await pinterest.getCampaigns(adAccountId, {
        entityStatus,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
      });
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      console.error('Pinterest campaigns fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/pinterest-ads/accounts/:adAccountId/analytics — account analytics
  router.get('/accounts/:adAccountId/analytics', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { startDate, endDate, granularity } = req.query;
      const analytics = await pinterest.getCampaignAnalytics(adAccountId, {
        startDate,
        endDate,
        granularity,
      });
      res.json({ success: true, data: { analytics, total: analytics.length } });
    } catch (err) {
      console.error('Pinterest analytics fetch failed:', err.message);
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
      const result = await pinterest.createCampaign(adAccountId, { name, status, dailySpendCap, objectiveType });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Pinterest campaign creation failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/pinterest-ads/campaigns/:campaignId — update campaign
  router.patch('/campaigns/:campaignId', async (req, res) => {
    try {
      const { campaignId } = req.params;
      const updates = req.body;
      const result = await pinterest.updateCampaign(campaignId, updates);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Pinterest campaign update failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/pinterest-ads/sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await pinterest.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      console.error('Pinterest sync failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
