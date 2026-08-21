import { Router } from 'express';
import config from '../config/index.js';
import { v4 as uuid } from 'uuid';
import { MetaAdsAPI } from '../services/meta/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('meta-accounts');

/**
 * Per-user Meta account router.
 * Each requesting user binds AND uses their own Meta token (SaaS multi-tenancy).
 * No system-wide fallback: an unbound user simply gets a 400/401.
 *
 * This router is mounted under `requireAuth` (server/routes/_platforms.js), so
 * `req.user.id` is verified upstream; the inline guard below is a fail-closed
 * normalization in case it is mounted without auth.
 */
export function createMetaAccountsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();
  // Self-contained auth guard (router is mounted under requireAuth, but we
  // normalize here: any request without a verified user fails closed with 401
  // instead of throwing on req.user.id later).
  router.use((req, res, next) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    next();
  });

  const API_VERSION = config.metaApiVersion;
  /**
   * Resolve the Meta access token for the authenticated user.
   * 1. Per-user binding in platform_accounts (user_id + platform = 'meta').
   * 2. Legacy settings key (per-user, not system-wide).
   * Returns { token, api } where api is a MetaAdsAPI scoped to that token.
   */
  function resolveUserMeta(userId) {
    const acct = platformAccountsRepo?.getByPlatform?.(userId, 'meta');
    if (acct?.access_token) {
      return { token: acct.access_token, api: MetaAdsAPI.withToken(acct.access_token) };
    }
    // Legacy per-user settings key
    const legacyToken = settingsRepo.get(`meta_${userId}_access_token`);
    if (legacyToken) {
      // Migrate to platform_accounts for next time
      settingsRepo.addAccount({
        id: uuid(),
        user_id: userId,
        platform: 'meta',
        account_name: 'Meta - Legacy Migration',
        credentials: { access_token: legacyToken },
        is_active: 1,
      });
      settingsRepo.delete(`meta_${userId}_access_token`);
      return { token: legacyToken, api: MetaAdsAPI.withToken(legacyToken) };
    }
    return { token: null, api: null };
  }

  function unauthorized(res, msg = 'Meta account not connected. Please connect your Meta account first.') {
    return res.status(400).json({ success: false, error: msg });
  }

  // GET /api/meta/accounts - Fetch all Ad Accounts for current user
  router.get('/', async (req, res) => {
    try {
      const userId = req.user.id;
      const { token } = resolveUserMeta(userId);
      if (!token) return unauthorized(res);

      const accountsUrl = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?fields=name,account_id,account_status,currency,business_name,business_id,budget_restriction_amount&access_token=${token}`;
      const accountsResponse = await fetch(accountsUrl);
      const accountsData = await accountsResponse.json();

      if (accountsData.error) {
        return res.status(400).json({ success: false, error: accountsData.error.message });
      }

      const filteredAccounts = (accountsData.data || []).map(acc => ({
        id: acc.account_id,
        name: acc.name,
        status: acc.account_status,
        currency: acc.currency,
        businessName: acc.business_name || 'Personal',
        businessId: acc.business_id || null,
        budgetRestriction: acc.budget_restriction_amount || null,
      }));

      res.json({ success: true, data: { accounts: filteredAccounts, total: filteredAccounts.length } });
    } catch (err) {
      log.error('Fetch Meta accounts failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch accounts: ' + err.message });
    }
  });

  // GET /api/meta/business-managers - Fetch Business Managers
  router.get('/business-managers', async (req, res) => {
    try {
      const { token: metaToken } = resolveUserMeta(req.user.id);
      if (!metaToken) return unauthorized(res, 'Meta account not connected');

      const bizManagersUrl = `https://graph.facebook.com/${API_VERSION}/me/businesses?fields=id,name,username,platform_type&access_token=${metaToken}`;
      const bizResponse = await fetch(bizManagersUrl);
      const bizData = await bizResponse.json();

      if (bizData.error) {
        return res.status(400).json({ success: false, error: bizData.error.message });
      }

      const businessManagers = (bizData.data || []).map(bm => ({
        id: bm.id,
        name: bm.name,
        username: bm.username,
        platformType: bm.platform_type,
      }));

      res.json({ success: true, data: { businessManagers, total: businessManagers.length } });
    } catch (err) {
      log.error('Fetch business managers failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch business managers: ' + err.message });
    }
  });

  // GET /api/meta/business-manager/:id/ad-accounts
  router.get('/business-manager/:id/ad-accounts', async (req, res) => {
    try {
      const businessManagerId = req.params.id;
      const { token: metaToken } = resolveUserMeta(req.user.id);
      if (!metaToken) return unauthorized(res, 'Meta account not connected');

      const accountsUrl = `https://graph.facebook.com/${API_VERSION}/${businessManagerId}/adaccounts?fields=name,account_id,account_status,currency,business_name,budget_restriction_amount&access_token=${metaToken}`;
      const accountsResponse = await fetch(accountsUrl);
      const accountsData = await accountsResponse.json();

      if (accountsData.error) {
        return res.status(400).json({ success: false, error: accountsData.error.message });
      }

      const accounts = (accountsData.data || []).map(acc => ({
        id: acc.account_id,
        name: acc.name,
        status: acc.account_status,
        currency: acc.currency,
        businessName: acc.business_name || 'Personal',
        budgetRestriction: acc.budget_restriction_amount || null,
      }));

      res.json({
        success: true,
        data: {
          businessManagerId,
          businessManagerName: accountsData.data?.[0]?.business_name || 'Unknown',
          accounts,
          total: accounts.length,
        },
      });
    } catch (err) {
      log.error('Fetch business manager ad accounts failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch accounts: ' + err.message });
    }
  });

  // GET /api/meta/pages — Fetch Facebook Pages (fanpages) for connected account
  router.get('/pages', async (req, res) => {
    try {
      const { token: metaToken } = resolveUserMeta(req.user.id);
      if (!metaToken) return unauthorized(res, 'Meta account not connected');

      const pagesUrl = `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,category,access_token,perms,tasks&access_token=${metaToken}`;
      const pagesResponse = await fetch(pagesUrl);
      const pagesData = await pagesResponse.json();

      if (pagesData.error) {
        return res.status(400).json({ success: false, error: pagesData.error.message });
      }

      const pages = (pagesData.data || []).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        perms: p.perms || [],
        tasks: p.tasks || [],
        hasAdAccess: (p.tasks || []).includes('ADVERTISE') || (p.tasks || []).includes('ANALYZE'),
      }));

      res.json({ success: true, data: { pages, total: pages.length } });
    } catch (err) {
      log.error('Fetch Meta pages failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch pages: ' + err.message });
    }
  });

  return router;
}
