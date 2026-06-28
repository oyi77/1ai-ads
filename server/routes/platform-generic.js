/**
 * Generic platform router — handles the common CRUD endpoints for any
 * platform that extends BasePlatformApiClient.
 *
 * Used by platforms that don't have a bespoke route file. Platforms with
 * custom needs (Meta, Shopee, etc.) keep their own routers.
 */

import { Router } from 'express';
import { getPlatform } from '../platforms/index.js';
import { createLogger } from '../lib/logger.js';

/**
 * Create a generic router for a platform.
 *
 * @param {string} platformKey — registry key (e.g. 'reddit', 'spotify')
 * @param {string} platformLabel — human name for logs (e.g. 'Reddit Ads')
 * @param {object} settingsRepo — credential/settings repository
 * @returns {import('express').Router}
 */
export function createGenericPlatformRouter(platformKey, platformLabel, settingsRepo) {
  const router = Router();
  const log = createLogger(platformKey);

  // GET /accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const api = await getPlatform(platformKey, settingsRepo);
      const accounts = await api.getAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error(`${platformLabel} accounts fetch failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /campaigns — list campaigns
  router.get('/campaigns', async (req, res) => {
    try {
      const api = await getPlatform(platformKey, settingsRepo);
      const { accountId, ...params } = req.query;
      const campaigns = await api.getCampaigns(accountId, params);
      res.json({ success: true, data: { campaigns, total: campaigns.length } });
    } catch (err) {
      log.error(`${platformLabel} campaigns fetch failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /campaigns — create a campaign
  router.post('/campaigns', async (req, res) => {
    try {
      const api = await getPlatform(platformKey, settingsRepo);
      const { accountId, ...body } = req.body;
      const result = await api.createCampaign(accountId, body);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error(`${platformLabel} campaign creation failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // PUT /campaigns/:campaignId — update a campaign
  router.put('/campaigns/:campaignId', async (req, res) => {
    try {
      const api = await getPlatform(platformKey, settingsRepo);
      const { campaignId } = req.params;
      const { accountId: _accountId, ...body } = req.body;
      const result = await api.updateCampaign(campaignId, body);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error(`${platformLabel} campaign update failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const api = await getPlatform(platformKey, settingsRepo);
      const results = await api.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error(`${platformLabel} sync failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
