import { Router } from 'express';
import { LinkedInAdsAPI } from '../services/linkedin/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('linkedin-ads');

export function createLinkedInAdsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();

  // Build a LinkedIn client bound to the REQUESTING USER's token (SaaS),
  // falling back to the system token. Per-request (not a shared singleton)
  // so concurrent users never share token state.
function clientFor(req) {
  const api = new LinkedInAdsAPI(settingsRepo);
  const token = resolveUserPlatformToken('linkedin', req, platformAccountsRepo, settingsRepo);
  if (!token) {
    throw new ValidationError('LinkedIn account not connected. Please connect your account in Settings.');
  }
  api.setActiveAccount(null, token, true);
  return api;
}

  // GET /api/linkedin-ads/status — check if LinkedIn credentials configured
  router.get('/status', async (req, res) => {
    try {
      const token = resolveUserPlatformToken('linkedin', req, platformAccountsRepo, settingsRepo);
      const configured = !!token;
      res.json({ success: true, data: { configured, platform: 'linkedin' } });
    } catch {
      res.json({ success: true, data: { configured: false, platform: 'linkedin' } });
    }
  });

  // GET /api/linkedin-ads/accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const linkedinAds = clientFor(req);
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
      log.error('LinkedIn accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/linkedin-ads/accounts/:accountId/campaigns — get campaigns
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { start, count } = req.query;
      const linkedinAds = clientFor(req);
      const data = await linkedinAds.getCampaigns(accountId, {
        start: parseInt(start) || 0,
        count: parseInt(count) || 100,
      });
      res.json({ success: true, data: { campaigns: data.elements || [], total: data.paging?.total || 0 } });
    } catch (err) {
      log.error('LinkedIn campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/linkedin-ads/accounts/:accountId/analytics — get analytics
  router.get('/accounts/:accountId/analytics', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { startDate, endDate, campaignIds } = req.query;
      const ids = campaignIds ? (Array.isArray(campaignIds) ? campaignIds : campaignIds.split(',').map(s => s.trim())) : undefined;
      const linkedinAds = clientFor(req);
      const data = await linkedinAds.getCampaignAnalytics(accountId, { startDate, endDate, campaignIds: ids });
      res.json({ success: true, data: { analytics: data.elements || [], total: data.paging?.total || 0 } });
    } catch (err) {
      log.error('LinkedIn analytics fetch failed', { error: err.message });
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
      const linkedinAds = clientFor(req);
      const result = await linkedinAds.createCampaign(accountId, { name, status, type, dailyBudget, runSchedule });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('LinkedIn campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/linkedin-ads/campaigns/:campaignId — update campaign
  router.patch('/campaigns/:campaignId', async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { name, status, dailyBudget, runSchedule } = req.body;
      const linkedinAds = clientFor(req);
      const result = await linkedinAds.updateCampaign(campaignId, { name, status, dailyBudget, runSchedule });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('LinkedIn campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/linkedin-ads/sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const linkedinAds = clientFor(req);
      const results = await linkedinAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('LinkedIn sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
