import { Router } from 'express';
import { TwitterAdsAPI } from '../services/twitter-ads-api.js';

export function createTwitterAdsRouter(settingsRepo) {
  const router = Router();
  const twitterAds = new TwitterAdsAPI(settingsRepo);

  // GET /api/twitter-ads/status - Check connection status
  router.get('/status', async (req, res) => {
    try {
      const creds = settingsRepo.getCredentials('twitter');
      const connected = !!creds?.access_token;
      res.json({ success: true, data: { connected, platform: 'twitter' } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, platform: 'twitter' } });
    }
  });

  // GET /api/twitter-ads/accounts - List Twitter ads accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await twitterAds.getAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      console.error('Twitter accounts fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/twitter-ads/accounts/:accountId/campaigns - List campaigns
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { cursor, count } = req.query;
      const campaigns = await twitterAds.getCampaigns(accountId, { cursor, count: parseInt(count) || 200 });
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      console.error('Twitter campaigns fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/twitter-ads/accounts/:accountId/stats - Get campaign stats
  router.get('/accounts/:accountId/stats', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { campaignIds, startDate, endDate, granularity } = req.query;
      const ids = campaignIds ? campaignIds.split(',') : undefined;
      const stats = await twitterAds.getCampaignStats(accountId, {
        campaignIds: ids,
        startDate,
        endDate,
        granularity,
      });
      res.json({ success: true, data: { stats, total: stats.length } });
    } catch (err) {
      console.error('Twitter stats fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/twitter-ads/accounts/:accountId/campaigns - Create campaign
  router.post('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { name, fundingInstrumentId, dailyBudget, status, startedAt } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = await twitterAds.createCampaign(accountId, {
        name, fundingInstrumentId, dailyBudget, status, startedAt,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Twitter campaign creation failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /api/twitter-ads/accounts/:accountId/campaigns/:campaignId - Update campaign
  router.put('/accounts/:accountId/campaigns/:campaignId', async (req, res) => {
    try {
      const { accountId, campaignId } = req.params;
      const { name, status, dailyBudget } = req.body;
      const result = await twitterAds.updateCampaign(accountId, campaignId, {
        name, status, dailyBudget,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Twitter campaign update failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/twitter-ads/sync - Sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await twitterAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      console.error('Twitter sync failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
