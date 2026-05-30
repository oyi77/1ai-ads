import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { MetaAdsAPI } from '../services/meta-api.js';
import config from '../config/index.js';

const log = createLogger('autonomous-routes');
const router = Router();
const API_VERSION = config.metaApiVersion;

router.get('/', (req, res) => {
  res.json({ service: 'autonomous', endpoints: ['POST /connect-facebook', 'GET /facebook-accounts', 'POST /link-account', 'POST /check-campaigns', 'POST /rules'] });
});

// POST /api/autonomous/connect-facebook - Exchange OAuth code for access token
router.post('/connect-facebook', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Auth code is required' });
    }

    const tokenResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${encodeURIComponent(process.env.FB_APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(process.env.FB_APP_SECRET)}&code=${code}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error.message });
    }

    // Exchange for long-lived token
    const longResponse = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(process.env.FB_APP_ID)}&client_secret=${encodeURIComponent(process.env.FB_APP_SECRET)}&access_token=${tokenData.access_token}`);
    const longData = await longResponse.json();

    res.json({
      success: true,
      access_token: longData.access_token || tokenData.access_token,
      expires: longData.expires_in || tokenData.expires_in || 0
    });
  } catch (err) {
    log.error('FB connect error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/autonomous/facebook-accounts - Get user's Facebook accounts
router.get('/facebook-accounts', async (req, res) => {
  try {
    const { accessToken } = req.query;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const meta = new MetaAdsAPI(accessToken);

    // Get user accounts
    const userResponse = await meta.apiGet('/me/accounts', { fields: 'id,name,access_token,perms' });
    
    // Filter accounts with CREATE_AD permission
    const adAccounts = userResponse.data.filter(acc => 
      acc.perms && acc.perms.includes('CREATE_AD')
    );

    res.json({
      success: true,
      accounts: adAccounts
    });
  } catch (err) {
    log.error('Get FB accounts error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autonomous/link-account - Link Facebook account to user
router.post('/link-account', async (req, res) => {
  try {
    const { userId, accountId, accountName, accessToken } = req.body;

    if (!userId || !accountId || !accountName || !accessToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await router.autonomousAgent.linkFacebookAccount(userId, accountId, accountName, accessToken);
    res.json({
      success: true,
      message: 'Account linked successfully'
    });
  } catch (err) {
    log.error('Link account error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autonomous/check-campaigns - Trigger campaign check and rule evaluation
router.post('/check-campaigns', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const results = await router.autonomousAgent.checkCampaigns(userId);
    res.json({
      success: true,
      data: results,
      message: `Checked ${results.length} campaigns, ${results.filter(r => r.result).length} actions taken`
    });
  } catch (err) {
    log.error('Check campaigns error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autonomous/rules - Create a new automation rule
router.post('/rules', async (req, res) => {
  try {
    const { userId, name, condition, action, priority } = req.body;

    if (!userId || !name || !condition || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const rule = await router.rulesRepo.create({
      user_id: userId,
      name,
      condition,
      action,
      priority: priority || 1,
      enabled: 1
    });

    res.json({
      success: true,
      data: rule
    });
  } catch (err) {
    log.error('Create rule error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autonomous/toggle-autonomy - Toggle full autonomy mode
router.post('/toggle-autonomy', async (req, res) => {
  try {
    const { enabled } = req.body;

    await router.settingsRepo.set('autonomy_enabled', enabled ? 'true' : 'false');
    res.json({
      success: true,
      message: enabled ? 'Autonomy mode enabled' : 'Autonomy mode disabled'
    });
  } catch (err) {
    log.error('Toggle autonomy error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export function createAutonomousRouter(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, autonomousAgent) {
  // Store repos for use in routes
  router.settingsRepo = settingsRepo;
  router.platformAccountsRepo = platformAccountsRepo;
  router.campaignsRepo = campaignsRepo;
  router.rulesRepo = rulesRepo;
  router.autonomousAgent = autonomousAgent;
  
  return router;
}
