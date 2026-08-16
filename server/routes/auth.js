/**
 * Auth Routes — Thin wiring layer.
 * Handlers extracted to _handlers/auth-handlers.js.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import {
  handleRegister, handleLogin, handleRefreshToken,
  handleLogout, handleConnectMetaToken,
} from './_handlers/auth-handlers.js';

export function createAuthRouter(usersRepo, refreshTokensRepo, settingsRepo = null) {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many attempts, please try again later.' },
    standardHeaders: true, legacyHeaders: false,
  });
  router.use(authLimiter);

  // Facebook OAuth
  router.get('/facebook/login', (req, res) => {
    const hostname = req.get('host') || '';
    const _isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const callbackUrl = `${req.protocol}://${hostname}/api/auth/facebook/callback`;
    const fbAppId = config.fbAppId;
    const fbSecret = config.fbAppSecret;
    if (!fbAppId || !fbSecret) {
      return res.status(500).json({ success: false, error: 'FB_APP_ID or FB_APP_SECRET not configured' });
    }
    const fbScope = 'email,ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata,pages_manage_posts';
    const fbUrl = `https://www.facebook.com/${config.metaApiVersion}/dialog/oauth?client_id=${encodeURIComponent(fbAppId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(fbScope)}`;
    res.json({ success: true, data: { fb_url: fbUrl } });
  });

  router.get('/facebook/callback', async (req, res) => {
    const code = req.query.code;
    const redirect_uri = req.query.redirect_uri;
    if (!code) return res.status(400).json({ success: false, error: 'No code provided' });
    try {
      const hostname = req.get('host') || '';
      const callbackUrl = redirect_uri || `${req.protocol}://${hostname}/api/auth/facebook/callback`;
      const tokenRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/oauth/access_token?client_id=${config.fbAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${config.fbAppSecret}&code=${encodeURIComponent(code)}`);
      const tokenData = await tokenRes.json();
      if (tokenData.error) return res.status(400).json({ success: false, error: tokenData.error.message });

      const accessToken = tokenData.access_token;
      const meRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name`);
      const meData = await meRes.json();

      if (settingsRepo) {
        const existingAccounts = settingsRepo.getAccounts('meta').filter(a => a.user_id === 'admin');
        const existing = existingAccounts.find(a => a.credentials?.fb_user_id === meData.id);
        if (existing) {
          settingsRepo.updateAccount(existing.id, { credentials: { ...existing.credentials, access_token: accessToken } });
        } else {
          settingsRepo.addAccount({ id: undefined, user_id: 'admin', platform: 'meta', account_name: meData.name || 'Meta Account', credentials: { access_token: accessToken, fb_user_id: meData.id, fb_user_name: meData.name }, is_active: existingAccounts.length === 0 ? 1 : 0 });
        }
      }

      const isLocal = (req.get('host') || '').includes('localhost');
      const frontendUrl = isLocal ? 'http://localhost:5173' : `https://${req.get('host')}`;
      res.redirect(`${frontendUrl}/settings?fb_connected=true`);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Meta token connection
  router.post('/connect-meta-token', handleConnectMetaToken(settingsRepo));

  // Auth endpoints
  router.post('/register', handleRegister(usersRepo, refreshTokensRepo));
  router.post('/login', handleLogin(usersRepo, refreshTokensRepo));
  router.post('/refresh-token', handleRefreshToken(usersRepo, refreshTokensRepo));
  router.post('/logout', handleLogout(refreshTokensRepo));

  // Meta compliance
  router.get('/facebook/deauthorize', (_req, res) => {
    res.json({ success: true, message: 'AdForge is ready to process deletion requests via POST.' });
  });
  router.post('/facebook/deauthorize', async (req, res) => {
    const hostname = req.get('host');
    const isLocal = hostname && (hostname.includes('127.0.0.1') || hostname.includes('localhost'));
    const base = isLocal || !hostname ? 'https://adforge.aitradepulse.com' : `${req.protocol}://${hostname}`;
    res.json({ url: `${base}/data-deletion-status`, confirmation_code: `del_${Date.now()}` });
  });

  // Google compliance — data deletion endpoint
  // Required by Google API Services User Data Policy (Limited Use)
  router.get('/google/deauthorize', (_req, res) => {
    res.json({ success: true, message: 'AdForge is ready to process Google data deletion requests via POST.' });
  });
  router.post('/google/deauthorize', async (req, res) => {
    const hostname = req.get('host');
    const isLocal = hostname && (hostname.includes('127.0.0.1') || hostname.includes('localhost'));
    const base = isLocal || !hostname ? 'https://adforge.aitradepulse.com' : `${req.protocol}://${hostname}`;
    // Google sends signed_request (JWT) identifying the user; extract user_id
    const userId = req.body?.user_id || req.user?.id;
    if (settingsRepo && userId) {
      const googleAccounts = settingsRepo.getAccounts('google');
      const userAccounts = googleAccounts.filter(a => a.user_id === userId);
      for (const account of userAccounts) {
        settingsRepo.deleteAccount(account.id);
      }
    }
    res.json({ url: `${base}/data-deletion-status`, confirmation_code: `gdel_${Date.now()}` });
  });

  return router;
}
