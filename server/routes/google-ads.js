import { Router } from 'express';
import { GoogleAdsAPI } from '../services/google/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('google-ads');

export function createGoogleAdsRouter(settingsRepo) {
  const router = Router();
  const googleAds = new GoogleAdsAPI(settingsRepo);

  // GET /api/google-ads/accounts - List accessible Google Ads accounts
  router.get('/accounts', async (req, res) => {
    try {
      const customerIds = await googleAds.listAccounts();
      const accounts = customerIds.map(id => ({
        id,
        name: `Google Ads (${id})`,
        platform: 'google',
      }));
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('Google Ads accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/google-ads/campaigns - List campaigns for a customer
  router.get('/campaigns', async (req, res) => {
    try {
      const { customerId } = req.query;
      if (!customerId) {
        return res.status(400).json({ success: false, error: 'customerId is required' });
      }
      const campaigns = await googleAds.getCampaigns(customerId);
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error('Google Ads campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/google-ads/campaigns - Create a new campaign
  router.post('/campaigns', async (req, res) => {
    try {
      const { customerId, name, status, dailyBudgetMicros, advertisingChannelType } = req.body;
      if (!customerId || !name) {
        return res.status(400).json({ success: false, error: 'customerId and name are required' });
      }
      const result = await googleAds.createCampaign(customerId, { name, status, dailyBudgetMicros, advertisingChannelType });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Google Ads campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /api/google-ads/campaigns/:campaignId - Update a campaign
  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const { customerId, name, status } = req.body;
      const { campaignId } = req.params;
      if (!customerId) {
        return res.status(400).json({ success: false, error: 'customerId is required' });
      }
      const result = await googleAds.updateCampaign(customerId, campaignId, { name, status });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Google Ads campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/google-ads/campaigns/:customerId/performance - Get campaign performance
  router.get('/campaigns/:customerId/performance', async (req, res) => {
    try {
      const { customerId } = req.params;
      const { days } = req.query;
      const performance = await googleAds.getCampaignPerformance(customerId, { days: parseInt(days) || 30 });
      res.json({ success: true, data: { performance, total: performance.length } });
    } catch (err) {
      log.error('Google Ads performance fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/google-ads/sync - Sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await googleAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('Google Ads sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
