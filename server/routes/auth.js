import { Router } from 'express';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken, verifyToken } from '../lib/auth.js';
import rateLimit from 'express-rate-limit';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';
import { v4 as uuid } from 'uuid';

const log = createLogger('auth-routes');

export function createAuthRouter(usersRepo, refreshTokensRepo, settingsRepo = null) {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use(authLimiter);

  // --- Facebook OAuth routes (public) ---
  router.get('/facebook/login', (req, res) => {
    const { redirect_uri } = req.query;
    const hostname = req.get('host') || '';
    const isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const callbackUrl = redirect_uri || (() => {
      // Always use HTTPS except for localhost dev
      if (isLocal) {
        return `${req.protocol}://${hostname}/api/auth/facebook/callback`;
      }
      return 'https://adforge.aitradepulse.com/api/auth/facebook/callback';
    })();
    
    const fbAppId = config.fbAppId;
    const fbSecret = config.fbAppSecret;
    
    if (!fbAppId || !fbSecret) {
      return res.status(500).json({ success: false, error: 'FB_APP_ID or FB_APP_SECRET not configured' });
    }
    
    const fbScope = 'email,ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata,pages_manage_posts';
    const fbUrl = `https://www.facebook.com/${config.metaApiVersion}/dialog/oauth?client_id=${encodeURIComponent(fbAppId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(fbScope)}`;
    
    log.info('Generating FB Login URL', { appId: fbAppId, callbackUrl, version: config.metaApiVersion });
    res.json({ success: true, data: { fb_url: fbUrl } });
  });

  router.get('/facebook/callback', async (req, res) => {
    log.info('Received FB Callback', { query: req.query });
    const code = req.query.code;
    const redirect_uri = req.query.redirect_uri;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code parameter required' });
    }
    
    const fbAppId = config.fbAppId;
    const fbSecret = config.fbAppSecret;
    const callbackUrl = redirect_uri || (() => {
      const hostname = req.get('host') || '';
      const isLocal = hostname.includes('localhost') || hostname.includes('127.0.0.1');
      if (isLocal) {
        return `${req.protocol}://${hostname}/api/auth/facebook/callback`;
      }
      return 'https://adforge.aitradepulse.com/api/auth/facebook/callback';
    })();
    
    if (!fbAppId || !fbSecret) {
      return res.status(500).json({ success: false, error: 'FB_APP_ID or FB_APP_SECRET not configured' });
    }
    
    try {
      // Exchange code for access token (use centralized version)
      const tokenUrl = `https://graph.facebook.com/${config.metaApiVersion}/oauth/access_token`;
      const tokenResponse = await fetch(`${tokenUrl}?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${fbSecret}&code=${code}`);
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return res.status(400).json({ success: false, error: tokenData.error.message });
      }
      
      const accessToken = tokenData.access_token;
      const tokenExpires = tokenData.expires_in || 0;
      
      // Get user info
      const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`);
      const userData = await userResponse.json();
      
      if (userData.error) {
        return res.status(400).json({ success: false, error: userData.error.message });
      }
      
      // Find or create user
      let user = usersRepo.findByEmail(userData.email);
      if (!user) {
        const userId = usersRepo.create({
          username: userData.name.replace(/\s+/g, '_').toLowerCase() || 'facebook_user',
          email: userData.email,
          password_hash: hashPassword(`fb_${Date.now()}`),
          confirmed: 1
        });
        user = usersRepo.findById(userId);
      }
      
      // Save token to platform_accounts table (unified storage — NOT settings table)
      const settingsRepo = req.app.locals.settingsRepo;
      if (settingsRepo) {
        const existingAccounts = settingsRepo.getAccounts('meta');
        const fbAccountName = `Meta - ${userData.name}`;
        const existing = existingAccounts.find(a => a.account_name === fbAccountName);
        
        if (existing) {
          settingsRepo.updateAccount(existing.id, { credentials: { access_token: accessToken } });
          log.info('Updated Meta account token in platform_accounts', { accountId: existing.id });
        } else {
          const isFirstAccount = existingAccounts.length === 0;
          settingsRepo.addAccount({
            id: uuid(),
            user_id: user.id,
            platform: 'meta',
            account_name: fbAccountName,
            credentials: { access_token: accessToken },
            is_active: isFirstAccount ? 1 : 0
          });
          log.info('Created Meta platform account for user', { userName: userData.name });
        }
        
        // Also store FB metadata in settings for quick lookup
        settingsRepo.set(`meta_${user.id}_fb_id`, userData.id);
        settingsRepo.set(`meta_${user.id}_fb_name`, userData.name);
        settingsRepo.set(`meta_${user.id}_expires`, new Date(Date.now() + tokenExpires * 1000).toISOString());
      }
      
      // Generate JWT tokens
      const accessTokenJwt = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());
      
      res.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' },
          accessToken: accessTokenJwt,
          refreshToken
        }
      });
    } catch (err) {
      console.error('Facebook OAuth callback failed', { error: err.message });
      res.status(500).json({ success: false, error: 'OAuth callback failed: ' + err.message });
    }
  });

  // --- Simple Token Connect (public, no OAuth needed) ---
  router.post('/connect-meta-token', async (req, res) => {
    const { access_token, account_name } = req.body;
    if (!access_token) {
      return res.status(400).json({ success: false, error: 'access_token is required' });
    }
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }

    try {
      // Verify token works
      const meRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(access_token)}&fields=id,name`);
      const meData = await meRes.json();
      if (meData.error) {
        return res.status(400).json({ success: false, error: `Invalid token: ${meData.error.message}` });
      }

      const userName = account_name || meData.name || 'Meta Account';
      
      // Auto-detect ad accounts
      let adAccounts = [];
      try {
        const accRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me/adaccounts?access_token=${encodeURIComponent(access_token)}&fields=name,account_id,account_status,currency&limit=50`);
        const accData = await accRes.json();
        if (accData.data) {
          adAccounts = accData.data.filter(a => a.account_status === 1).map(a => ({
            id: `act_${a.account_id}`,
            name: a.name,
            account_id: a.account_id,
            currency: a.currency,
            status: 'active'
          }));
        }
      } catch (e) {
        log.info('Ad account detection skipped', { error: e.message });
      }

      // Save to platform_accounts
      const existingAccounts = settingsRepo.getAccounts('meta');
      const existing = existingAccounts.find(a => 
        a.account_name === userName || 
        (a.credentials?.access_token === access_token)
      );

      let mainId;
      if (existing) {
        settingsRepo.updateAccount(existing.id, { 
          credentials: { access_token, user_name: meData.name, user_id: meData.id } 
        });
        mainId = existing.id;
      } else {
        const id = uuid();
        settingsRepo.addAccount({
          id,
          user_id: 'admin',
          platform: 'meta',
          account_name: userName,
          credentials: { access_token, user_name: meData.name, user_id: meData.id },
          is_active: existingAccounts.length === 0 ? 1 : 0
        });
        mainId = id;
      }

      // Save each ad account
      let connectedCount = 0;
      for (const adAcc of adAccounts) {
        const adExisting = existingAccounts.find(a => a.account_name === adAcc.id);
        if (!adExisting) {
          settingsRepo.addAccount({
            id: uuid(),
            user_id: 'admin',
            platform: 'meta',
            account_name: adAcc.id,
            credentials: { access_token, ad_account_id: adAcc.account_id, ad_account_name: adAcc.name },
            is_active: 0
          });
          connectedCount++;
        }
      }

      res.json({
        success: true,
        message: `Connected as ${meData.name}! Found ${adAccounts.length} ad accounts, ${connectedCount} new connected.`,
        data: {
          id: mainId,
          user_name: meData.name,
          user_id: meData.id,
          ad_accounts_count: adAccounts.length,
          new_connected: connectedCount,
          ad_accounts: adAccounts
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const { username, password, email } = req.body;
      if (!username || !password || !email) {
        return res.status(400).json({ success: false, error: 'username, password, and email are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      if (usersRepo.findByUsername(username)) {
        return res.status(409).json({ success: false, error: 'Username already exists' });
      }

      if (usersRepo.findByEmail(email)) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const userId = usersRepo.create({
        username,
        email,
        password_hash: hashPassword(password),
        confirmed: 1
      });

      const accessToken = generateToken({ id: userId, username, role: 'user', plan: 'free' });
      const refreshToken = generateRefreshToken({ id: userId, username });
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(userId, refreshToken, expiresAt.toISOString());

      res.json({
        success: true,
        data: {
          user: { id: userId, username, email, role: 'user', plan: 'free' },
          accessToken,
          refreshToken
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = usersRepo.findByUsername(username) || usersRepo.findByEmail(username);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      // Remove any existing refresh tokens for this user to prevent UNIQUE constraint conflicts
      refreshTokensRepo.deleteByUserId(user.id);

      const accessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());

      res.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' },
          accessToken,
          refreshToken
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/refresh-token', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });

      const payload = verifyToken(refreshToken);
      if (!payload || payload.tokenType !== 'refresh') {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }

      const storedToken = refreshTokensRepo.findByToken(refreshToken);
      if (!storedToken) {
        return res.status(401).json({ success: false, error: 'Token not found or revoked' });
      }

      if (new Date(storedToken.expires_at) < new Date()) {
        refreshTokensRepo.deleteByToken(refreshToken);
        return res.status(401).json({ success: false, error: 'Refresh token expired' });
      }

      const user = usersRepo.findById(payload.id);
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });

      // Rotate token
      const newAccessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const newRefreshToken = generateRefreshToken({ id: user.id, username: user.username });

      refreshTokensRepo.deleteByToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, newRefreshToken, expiresAt.toISOString());

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (err) {
      res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  });

  router.post('/logout', (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) refreshTokensRepo.deleteByToken(refreshToken);
    res.json({ success: true });
  });

  // --- User Data Deletion Callback for Meta compliance ---
  router.get('/facebook/deauthorize', (req, res) => {
    res.json({ success: true, message: 'AdForge is ready to process deletion requests via POST.' });
  });

  router.post('/facebook/deauthorize', async (req, res) => {
    log.info('Meta Deauthorize (Data Deletion) Request received', { body: req.body });
    // In a real scenario, decrypt signed_request and delete user data
    res.json({
      url: 'https://adforge.aitradepulse.com/data-deletion-status',
      confirmation_code: `del_${Date.now()}`
    });
  });

  return router;
}
