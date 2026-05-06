import { Router } from 'express';

export function createMetaAccountsRouter(settingsRepo) {
  const router = Router();

  // GET /api/meta/accounts - Fetch all Ad Accounts for current user
  router.get('/', async (req, res) => {
    try {
      // Get user's Meta access token
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Verify token and get user ID
      let decoded;
      try {
        const jwt = require('jsonwebtoken');
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'very-secret-data-2026');
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      // Get user's Meta access token from settings
      const metaToken = settingsRepo.get(`meta_${decoded.id}_access_token`);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected. Please connect your Facebook account first.' });
      }

      // Fetch Ad Accounts via Graph API
      const accountsUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status,currency,business_name,business_id,budget_restriction_amount&access_token=${metaToken}`;
      
      const accountsResponse = await fetch(accountsUrl);
      const accountsData = await accountsResponse.json();

      if (accountsData.error) {
        return res.status(400).json({ success: false, error: accountsData.error.message });
      }

      // Filter and format accounts
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
      console.error('Fetch Meta accounts failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch accounts: ' + err.message });
    }
  });

  // GET /api/meta/business-manager - Fetch Business Managers
  router.get('/business-managers', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      let decoded;
      try {
        const jwt = require('jsonwebtoken');
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'very-secret-data-2026');
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const metaToken = settingsRepo.get(`meta_${decoded.id}_access_token`);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected' });
      }

      // Fetch Business Managers via Graph API
      const bizManagersUrl = `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,username,platform_type&access_token=${metaToken}`;
      
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
      console.error('Fetch business managers failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch business managers: ' + err.message });
    }
  });

  // GET /api/meta/business-manager/:id/ad-accounts - Fetch Ad Accounts for specific Business Manager
  router.get('/business-manager/:id/ad-accounts', async (req, res) => {
    try {
      const businessManagerId = req.params.id;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      let decoded;
      try {
        const jwt = require('jsonwebtoken');
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'very-secret-data-2026');
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const metaToken = settingsRepo.get(`meta_${decoded.id}_access_token`);
      if (!metaToken) {
        return res.status(400).json({ success: false, error: 'Meta account not connected' });
      }

      // Fetch Ad Accounts for specific Business Manager
      const accountsUrl = `https://graph.facebook.com/v19.0/${businessManagerId}/adaccounts?fields=name,account_id,account_status,currency,business_name,budget_restriction_amount&access_token=${metaToken}`;
      
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
      console.error('Fetch business manager ad accounts failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch accounts: ' + err.message });
    }
  });

  return router;
}
