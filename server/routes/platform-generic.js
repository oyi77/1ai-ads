/**
 * Generic platform router — handles the common CRUD endpoints for any
 * platform that extends BasePlatformApiClient.
 *
 * Used by platforms that don't have a bespoke route file. Platforms with
 * custom needs (Meta, Shopee, etc.) keep their own routers.
 *
 * Multi-tenant: each request uses the REQUESTING USER's bound platform token
 * (via PlatformAccountsRepository), falling back to the system token.
 */

import { Router } from 'express';
import { getPlatform } from '../platforms/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

/**
 * Create a generic router for a platform.
 *
 * @param {string} platformKey — registry key (e.g. 'reddit', 'spotify')
 * @param {string} platformLabel — human name for logs (e.g. 'Reddit Ads')
 * @param {object} settingsRepo — credential/settings repository (system token source)
 * @param {object} [platformAccountsRepo] — PlatformAccountsRepository (per-user tokens)
 * @returns {import('express').Router}
 */
export function createGenericPlatformRouter(platformKey, platformLabel, settingsRepo, platformAccountsRepo) {
  const router = Router();
  const log = createLogger(platformKey);

  // Build a platform client bound to the REQUESTING USER's token (SaaS),
  // falling back to the system token. Per-request instance.
  async function clientFor(req) {
    const api = await getPlatform(platformKey, settingsRepo);
    const token = resolveUserPlatformToken(platformKey, req, platformAccountsRepo, settingsRepo);
    if (!token) {
      throw new ValidationError(`${platformLabel} account not connected. Please connect your account in Settings.`);
    }
    api.setActiveAccount(null, token, true);
    return api;
  }

  // GET /accounts — list ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const api = await clientFor(req);
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
      const api = await clientFor(req);
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
      const api = await clientFor(req);
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
      const api = await clientFor(req);
      const { campaignId } = req.params;
      const { accountId, ...body } = req.body;
      // updateCampaign contract is (accountId, campaignId, data) — pass accountId
      const result = await api.updateCampaign(accountId, campaignId, body);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error(`${platformLabel} campaign update failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /sync — sync all accounts
  router.post('/sync', async (req, res) => {
    try {
      const api = await clientFor(req);
      const results = await api.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error(`${platformLabel} sync failed`, { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
