import { Router } from 'express';
import { LinkedInAdsAPI } from '../services/linkedin-ads-api.js';

export function createLinkedInAdsRouter(settingsRepo) {
  const router = Router();
  const linkedinAds = new LinkedInAdsAPI(settingsRepo);

  // GET /api/linkedin-ads/status — check if LinkedIn credentials configured
  router.get('/status', async (req, res) => {
    try {
      const creds = settingsRepo.getCredentials('linkedin');
      const configured = !!(creds?.access_token);
      res.json({ success: true, data: { configured, platform: 'linkedin' } });
    } catch (err) {
      res.json({ success: true, data: { configured: false, platform: 'linkedin' } });
    }
  });

  // GET /api/linkedin-ads/accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const data = await linkedinAds.getAccounts();
      const accounts = (data.elements || []).map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        type: a.type,
        currency: a.currency,
        platform: 'linkedin',
      }));
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      console.error('LinkedIn accounts fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/linkedin-ads/accounts/:accountId/campaigns — get campaigns
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { start, count } = req.query;
      const data = await linkedinAds.getCampaigns(accountId, {
        start: parseInt(start) || 0,
        count: parseInt(count) || 100,
      });
      res.json({ success: true, data: { campaigns: data.elements || [], total: data.paging?.total || 0 } });
    } catch (err) {
      console.error('LinkedIn campaigns fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/linkedin-ads/accounts/:accountId/analytics — get analytics
  router.get('/accounts/:accountId/analytics', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { startDate, endDate, campaignIds } = req.query;
      const ids = campaignIds ? (Array.isArray(campaignIds) ? campaignIds : campaignIds.split(',').map(s => s.trim())) : undefined;
      const data = await linkedinAds.getCampaignAnalytics(accountId, { startDate, endDate, campaignIds: ids });
      res.json({ success: true, data: { analytics: data.elements || [], total: data.paging?.total || 0 } });
    } catch (err) {
      console.error('LinkedIn analytics fetch failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/linkedin-ads/accounts/:accountId/campaigns — create campaign
  router.post('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { name, status, type, dailyBudget, runSchedule } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = await linkedinAds.createCampaign(accountId, { name, status, type, dailyBudget, runSchedule });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('LinkedIn campaign creation failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/linkedin-ads/campaigns/:campaignId — update campaign
  router.patch('/campaigns/:campaignId', async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { name, status, dailyBudget, runSchedule } = req.body;
      const result = await linkedinAds.updateCampaign(campaignId, { name, status, dailyBudget, runSchedule });
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('LinkedIn campaign update failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/linkedin-ads/sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await linkedinAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      console.error('LinkedIn sync failed:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
