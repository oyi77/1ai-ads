import { Router } from 'express';
import config from '../config/index.js';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { createLogger } from '../lib/logger.js';

const log = createLogger('meta-accounts');

export function createMetaAccountsRouter(settingsRepo) {
  const router = Router();
  const API_VERSION = config.metaApiVersion;

  /**
   * Get Meta access token for the authenticated user.
   * Checks platform_accounts table first (unified storage), 
   * then falls back to legacy settings table.
   */
  function getMetaToken(settingsRepo, userId) {
    // 1. Try platform_accounts table (new unified storage)
    const accounts = settingsRepo.getAccounts('meta');
    const active = accounts.find(a => a.is_active);
    if (active?.credentials?.access_token) {
      return active.credentials.access_token;
    }
    // 2. Fallback to legacy settings table
    const legacyToken = settingsRepo.get(`meta_${userId}_access_token`);
    if (legacyToken) {
      // Migrate to platform_accounts for next time
      settingsRepo.addAccount({
        id: uuid(),
        user_id: userId,
        platform: 'meta',
        account_name: 'Meta - Legacy Migration',
        credentials: { access_token: legacyToken },
        is_active: 1
      });
      settingsRepo.delete(`meta_${userId}_access_token`);
      return legacyToken;
    }
    return null;
  }

  // GET /api/meta/accounts - Fetch all Ad Accounts for current user
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.sub || 'default';
      
      const metaToken = getMetaToken(settingsRepo, userId);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected. Please connect your Facebook account first.' });
      }

      const accountsUrl = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?fields=name,account_id,account_status,currency,business_name,business_id,budget_restriction_amount&access_token=${metaToken}`;
      
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

      res.json({
        success: true,
        data: {
          accounts: filteredAccounts,
          total: filteredAccounts.length,
        },
      });
    } catch (err) {
      log.error('Fetch Meta accounts failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch accounts: ' + err.message });
    }
  });

  // GET /api/meta/business-managers - Fetch Business Managers
  router.get('/business-managers', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const metaToken = getMetaToken(settingsRepo, decoded.id);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected' });
      }

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

      res.json({
        success: true,
        data: {
          businessManagers,
          total: businessManagers.length,
        },
      });
    } catch (err) {
      log.error('Fetch business managers failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch business managers: ' + err.message });
    }
  });

  // GET /api/meta/business-manager/:id/ad-accounts
  router.get('/business-manager/:id/ad-accounts', async (req, res) => {
    try {
      const businessManagerId = req.params.id;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const metaToken = getMetaToken(settingsRepo, decoded.id);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected' });
      }

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
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const metaToken = getMetaToken(settingsRepo, decoded.id);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected' });
      }

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