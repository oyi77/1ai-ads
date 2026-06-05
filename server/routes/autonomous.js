import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { exchangeCodeForToken } from '../services/meta-connection.js';

const log = createLogger('autonomous-routes');

export function createAutonomousRouter(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, autonomousAgent) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ service: 'autonomous', endpoints: ['POST /connect-facebook', 'GET /facebook-accounts', 'POST /link-account', 'POST /check-campaigns', 'POST /rules'] });
  });

  // POST /api/autonomous/connect-facebook - Exchange OAuth code for access token
  router.post('/connect-facebook', async (req, res) => {
    try {
      const { code, redirectUri } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'Auth code is required' });
      }

      const result = await exchangeCodeForToken(code, redirectUri);
      res.json({ success: true, access_token: result.accessToken, expires: result.expiresIn });
    } catch (err) {
      log.error('FB connect error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/autonomous/facebook-accounts - Get user's Facebook accounts
  router.get('/facebook-accounts', async (req, res) => {
    try {
      const { accessToken } = req.query;
      if (!accessToken) {
        return res.status(400).json({ success: false, error: 'Access token is required' });
      }

      const { detectAdAccounts } = await import('../services/meta-connection.js');
      const accounts = await detectAdAccounts(accessToken);
      res.json({ success: true, accounts });
    } catch (err) {
      log.error('Get FB accounts error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/autonomous/link-account - Link Facebook account to user
  router.post('/link-account', async (req, res) => {
    try {
      const { userId, accountId, accountName, accessToken } = req.body;
      if (!userId || !accountId || !accountName || !accessToken) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      await autonomousAgent.linkFacebookAccount(userId, accountId, accountName, accessToken);
      res.json({ success: true, message: 'Account linked successfully' });
    } catch (err) {
      log.error('Link account error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/autonomous/check-campaigns - Trigger campaign check and rule evaluation
  router.post('/check-campaigns', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }

      const results = await autonomousAgent.checkCampaigns(userId);
      res.json({
        success: true,
        data: results,
        message: `Checked ${results.length} campaigns, ${results.filter(r => r.result).length} actions taken`,
      });
    } catch (err) {
      log.error('Check campaigns error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/autonomous/rules - Create a new automation rule
  router.post('/rules', async (req, res) => {
    try {
      const { userId, name, condition, action, priority } = req.body;
      if (!userId || !name || !condition || !action) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const rule = await rulesRepo.create({
        user_id: userId,
        name,
        condition,
        action,
        priority: priority || 1,
        enabled: 1,
      });
      res.json({ success: true, data: rule });
    } catch (err) {
      log.error('Create rule error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/autonomous/toggle-autonomy - Toggle full autonomy mode
  router.post('/toggle-autonomy', async (req, res) => {
    try {
      const { enabled } = req.body;
      await settingsRepo.set('autonomy_enabled', enabled ? 'true' : 'false');
      res.json({ success: true, message: enabled ? 'Autonomy mode enabled' : 'Autonomy mode disabled' });
    } catch (err) {
      log.error('Toggle autonomy error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}