import { Router } from 'express';
import { TwitterAdsAPI } from '../services/twitter/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('twitter-ads');

export function createTwitterAdsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();

  // Build a Twitter client bound to the REQUESTING USER's token (SaaS),
  // falling back to the system token. Per-request (not a shared singleton)
  // so concurrent users never share token state.
function clientFor(req) {
  const api = new TwitterAdsAPI(settingsRepo);
  const token = resolveUserPlatformToken('twitter', req, platformAccountsRepo, settingsRepo);
  if (!token) {
    throw new ValidationError('Twitter account not connected. Please connect your account in Settings.');
  }
  api.setActiveAccount(null, token, true);
  return api;
}

  // GET /api/twitter-ads/status — check if Twitter credentials configured
  router.get('/status', async (req, res) => {
    try {
      const token = resolveUserPlatformToken('twitter', req, platformAccountsRepo, settingsRepo);
      const configured = !!token;
      res.json({ success: true, data: { configured, platform: 'twitter' } });
    } catch {
      res.json({ success: true, data: { configured: false, platform: 'twitter' } });
    }
  });

  // GET /api/twitter-ads/accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const twitterAds = clientFor(req);
      const data = await twitterAds.getAccounts();
      const accounts = (data || []).map(a => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone,
        platform: 'twitter',
      }));
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('Twitter accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/twitter-ads/accounts/:accountId/campaigns — get campaigns
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { cursor } = req.query;
      const twitterAds = clientFor(req);
      const campaigns = await twitterAds.getCampaigns(accountId, { cursor });
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error('Twitter campaigns fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /api/twitter-ads/accounts/:accountId/stats — get stats
  router.get('/accounts/:accountId/stats', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { campaignIds, startDate, endDate, granularity } = req.query;
      const ids = campaignIds ? (Array.isArray(campaignIds) ? campaignIds : campaignIds.split(',').map(s => s.trim())) : undefined;
      const twitterAds = clientFor(req);
      const data = await twitterAds.getCampaignStats(accountId, { campaignIds: ids, startDate, endDate, granularity });
      res.json({ success: true, data: { stats: data || [], total: (data || []).length } });
    } catch (err) {
      log.error('Twitter stats fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/twitter-ads/accounts/:accountId/campaigns — create campaign
  router.post('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { name, fundingInstrumentId, dailyBudget, status, startedAt } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const twitterAds = clientFor(req);
      const result = await twitterAds.createCampaign(accountId, { name, fundingInstrumentId, dailyBudget, status, startedAt });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Twitter campaign creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/twitter-ads/accounts/:accountId/campaigns/:campaignId — update campaign
  router.patch('/accounts/:accountId/campaigns/:campaignId', async (req, res) => {
    try {
      const { accountId, campaignId } = req.params;
      const { name, status, dailyBudget } = req.body;
      const twitterAds = clientFor(req);
      const result = await twitterAds.updateCampaign(accountId, campaignId, { name, status, dailyBudget });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Twitter campaign update failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /api/twitter-ads/sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const twitterAds = clientFor(req);
      const results = await twitterAds.syncAllAccounts();
      res.json({ success: true, data: { results, total: (results || []).length } });
    } catch (err) {
      log.error('Twitter sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
