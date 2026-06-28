import { Router } from 'express';
import { SnapchatAdsAPI } from '../services/snapchat/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('snapchat-ads');

export function createSnapchatAdsRouter(settingsRepo) {
  const router = Router();
  const snapchatAds = new SnapchatAdsAPI(settingsRepo);

  // GET /api/snapchat-ads/status - Check connection status
  router.get('/status', async (req, res) => {
    try {
      const orgs = await snapchatAds.getOrganizations();
      res.json({ success: true, data: { connected: true, organizations: orgs.length } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, error: err.message } });
    }
  });

  // GET /api/snapchat-ads/organizations - List organizations
  router.get('/organizations', async (req, res) => {
    try {
      const orgs = await snapchatAds.getOrganizations();
      res.json({ success: true, data: { organizations: orgs, total: orgs.length } });
    } catch (err) {
      log.error('Snapchat organizations fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/snapchat-ads/accounts - List ad accounts across all orgs
  router.get('/accounts', async (req, res) => {
    try {
      const orgs = await snapchatAds.getOrganizations();
      const allAccounts = [];
      for (const org of orgs) {
        const accounts = await snapchatAds.getAdAccounts(org.id);
        allAccounts.push(...accounts.map(a => ({ ...a, orgId: org.id, orgName: org.name })));
      }
      res.json({ success: true, data: { accounts: allAccounts, total: allAccounts.length } });
    } catch (err) {
      log.error('Snapchat accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/snapchat-ads/accounts/:adAccountId/campaigns - List campaigns
  router.get('/accounts/:adAccountId/campaigns', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const campaigns = await snapchatAds.getCampaigns(adAccountId);
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error('Snapchat campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/snapchat-ads/accounts/:adAccountId/campaigns/:campaignId/stats - Campaign stats
  router.get('/accounts/:adAccountId/campaigns/:campaignId/stats', async (req, res) => {
    try {
      const { adAccountId, campaignId } = req.params;
      const { startDate, endDate, granularity } = req.query;
      const stats = await snapchatAds.getCampaignStats(adAccountId, campaignId, {
        startDate, endDate, granularity,
      });
      res.json({ success: true, data: stats });
    } catch (err) {
      log.error('Snapchat campaign stats fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/snapchat-ads/accounts/:adAccountId/campaigns - Create campaign
  router.post('/accounts/:adAccountId/campaigns', async (req, res) => {
    try {
      const { adAccountId } = req.params;
      const { name, status, daily_budget_micro, objective } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const campaign = await snapchatAds.createCampaign(adAccountId, {
        name, status, daily_budget_micro, objective,
      });
      res.json({ success: true, data: campaign });
    } catch (err) {
      log.error('Snapchat campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /api/snapchat-ads/accounts/:adAccountId/campaigns/:campaignId - Update campaign
  router.put('/accounts/:adAccountId/campaigns/:campaignId', async (req, res) => {
    try {
      const { adAccountId, campaignId } = req.params;
      const result = await snapchatAds.updateCampaign(adAccountId, campaignId, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Snapchat campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/snapchat-ads/sync - Sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const results = await snapchatAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('Snapchat sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
