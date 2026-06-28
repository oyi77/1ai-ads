import { Router } from 'express';
import { TikTokAdsAPI } from '../services/tiktok/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('tiktok-ads');

export function createTikTokAdsRouter(settingsRepo) {
  const router = Router();
  const tiktokAds = new TikTokAdsAPI(settingsRepo);

  // GET /api/tiktok-ads/accounts - List TikTok advertiser accounts
  router.get('/accounts', async (req, res) => {
    try {
      const creds = settingsRepo.getCredentials('tiktok');
      if (!creds?.advertiser_ids) {
        return res.json({ success: true, data: { accounts: [], total: 0 } });
      }
      const accounts = creds.advertiser_ids.map(id => ({
        id,
        name: `TikTok Ads (${id})`,
        platform: 'tiktok',
      }));
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('TikTok accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/tiktok-ads/campaigns - List campaigns for an advertiser
  router.get('/campaigns', async (req, res) => {
    try {
      const { advertiserId, page, pageSize } = req.query;
      if (!advertiserId) {
        return res.status(400).json({ success: false, error: 'advertiserId is required' });
      }
      const data = await tiktokAds.getCampaigns(advertiserId, { page: parseInt(page) || 1, pageSize: parseInt(pageSize) || 50 });
      res.json({ success: true, data: { campaigns: data.list || [], total: data.page_info?.total_number || 0 } });
    } catch (err) {
      log.error('TikTok campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/tiktok-ads/campaigns - Create a new campaign
  router.post('/campaigns', async (req, res) => {
    try {
      const { advertiserId, name, objectiveType, budget, status } = req.body;
      if (!advertiserId || !name) {
        return res.status(400).json({ success: false, error: 'advertiserId and name are required' });
      }
      const result = await tiktokAds.createCampaign(advertiserId, { name, objectiveType, budget, status });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('TikTok campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /api/tiktok-ads/campaigns/:campaignId - Update a campaign
  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const { advertiserId, name, status, budget } = req.body;
      const { campaignId } = req.params;
      if (!advertiserId) {
        return res.status(400).json({ success: false, error: 'advertiserId is required' });
      }
      const result = await tiktokAds.updateCampaign(advertiserId, campaignId, { name, status, budget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('TikTok campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/tiktok-ads/campaigns/:advertiserId/insights - Get campaign insights
  router.get('/campaigns/:advertiserId/insights', async (req, res) => {
    try {
      const { advertiserId } = req.params;
      const { campaignIds, startDate, endDate } = req.query;
      if (!campaignIds) {
        return res.status(400).json({ success: false, error: 'campaignIds is required' });
      }
      const ids = Array.isArray(campaignIds) ? campaignIds : campaignIds.split(',');
      const insights = await tiktokAds.getCampaignInsights(advertiserId, ids, { startDate, endDate });
      res.json({ success: true, data: { insights: insights.list || [], total: insights.page_info?.total_number || 0 } });
    } catch (err) {
      log.error('TikTok insights fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/tiktok-ads/ads - List ads for an advertiser
  router.get('/ads', async (req, res) => {
    try {
      const { advertiserId, page, pageSize } = req.query;
      if (!advertiserId) {
        return res.status(400).json({ success: false, error: 'advertiserId is required' });
      }
      const data = await tiktokAds.getAds(advertiserId, { page: parseInt(page) || 1, pageSize: parseInt(pageSize) || 50 });
      res.json({ success: true, data: { ads: data.list || [], total: data.page_info?.total_number || 0 } });
    } catch (err) {
      log.error('TikTok ads fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/tiktok-ads/sync - Sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const { advertiserIds } = req.body;
      if (!advertiserIds || !Array.isArray(advertiserIds)) {
        return res.status(400).json({ success: false, error: 'advertiserIds array is required' });
      }
      const results = await tiktokAds.syncAllAccounts(advertiserIds);
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('TikTok sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
