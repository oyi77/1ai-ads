/**
 * Google Ads Routes — thin wiring layer for Google Ads API.
 */
import { Router } from 'express';
import { GoogleAdsAPI } from '../services/google/index.js';
import { fullGoogleAdsSync } from '../services/google-sync.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('google-ads-routes');

export function createGoogleAdsRouter(settingsRepo, platformAccountsRepo, campaignsRepo) {
  const router = Router();

  // Build a Google Ads API client bound to the requesting user's token
  async function clientFor(req) {
    const userToken = await resolveUserPlatformToken(req, 'google', platformAccountsRepo);
    return GoogleAdsAPI.withToken(userToken || '', {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      customerId: req.query.customerId || req.body?.customerId || '',
    });
  }

  // GET /api/google/accounts — list accessible accounts
  router.get('/accounts', async (req, res) => {
    try {
      const client = await clientFor(req);
      const accounts = await client.getAdAccounts();
      res.json({ success: true, data: accounts });
    } catch (err) {
      log.error('Failed to list Google Ads accounts', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/google/campaigns — list campaigns
  router.get('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { customerId, limit, status } = req.query;
      const campaigns = await client.getCampaigns(customerId, { 
        limit: parseInt(limit) || 50,
        status 
      });
      res.json({ success: true, data: campaigns });
    } catch (err) {
      log.error('Failed to get Google Ads campaigns', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/google/campaigns — create campaign
  router.post('/campaigns', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { customerId, name, dailyBudget, channelType, startDate, endDate } = req.body;
      const result = await client.createCampaign(customerId, {
        name,
        dailyBudget,
        channelType,
        startDate,
        endDate,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to create Google Ads campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/google/campaigns/:campaignId — update campaign
  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { customerId, status, dailyBudget } = req.body;
      const result = await client.updateCampaign(customerId, req.params.campaignId, {
        status,
        dailyBudget,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to update Google Ads campaign', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/google/sync — sync all accounts and campaigns
  router.post('/sync', async (req, res) => {
    try {
      const client = await clientFor(req);
      const result = await fullGoogleAdsSync(client, req.user.id, campaignsRepo);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to sync Google Ads', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/google/insights/campaigns/:campaignId — campaign insights
  router.get('/insights/campaigns/:campaignId', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { customerId, datePreset } = req.query;
      const insights = await client.getCampaignInsights(customerId, req.params.campaignId, {
        datePreset,
      });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get campaign insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/google/insights/account — account insights
  router.get('/insights/account', async (req, res) => {
    try {
      const client = await clientFor(req);
      const { customerId, datePreset } = req.query;
      const insights = await client.getAccountInsights(customerId, { datePreset });
      res.json({ success: true, data: insights });
    } catch (err) {
      log.error('Failed to get account insights', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
