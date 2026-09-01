import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { ValidationError } from '../lib/errors.js';

const log = createLogger('oauth');

const PLATFORM_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/adwords'],
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['advertiser_accounts', 'campaign_management'],
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_ads', 'rw_ads', 'r_ads_reporting', 'r_organization_admin'],
  },
  meta: {
    authUrl: `https://www.facebook.com/${process.env.META_API_VERSION || 'v22.0'}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${process.env.META_API_VERSION || 'v22.0'}/oauth/access_token`,
    scopes: ['ads_management', 'pages_show_list', 'pages_read_engagement', 'business_management'],
  },
};
function generateState(userId, platform) {
  const payload = `${userId}:${platform}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
  return Buffer.from(payload).toString('base64url');
}

function parseState(state) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [userId, platform, timestamp] = decoded.split(':');
    return { userId, platform, timestamp: parseInt(timestamp, 10) };
  } catch {
    return null;
  }
}

function getClientConfig(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) throw new ValidationError(`Unknown platform: ${platform}`);

  const envPrefix = platform.toUpperCase();
  const clientId = process.env[`${envPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
  const redirectUri = process.env[`${envPrefix}_REDIRECT_URI`];

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ValidationError(`${platform} OAuth not configured`);
  }

  return { ...config, clientId, clientSecret, redirectUri };
}

export function createOAuthRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/oauth/:platform/url — get authorization URL
  router.get('/:platform/url', async (req, res) => {
    try {
      const platform = req.params.platform;
      const config = getClientConfig(platform);
      const state = generateState(req.user.id, platform);

      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        state,
      });
      // Google-specific params
      if (platform === 'google') {
        params.set('access_type', 'offline');
        params.set('prompt', 'consent');
      }

      const authUrl = `${config.authUrl}?${params.toString()}`;
      res.json({ success: true, data: { authUrl, state } });
    } catch (err) {
      log.error('Failed to generate OAuth URL', { error: err.message, platform: req.params.platform });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // GET /api/oauth/:platform/callback — OAuth callback
  router.get('/:platform/callback', async (req, res) => {
    try {
      const platform = req.params.platform;
      const { code, state, error, error_description } = req.query;

      if (error) {
        log.warn('OAuth error', { platform, error, error_description });
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=${encodeURIComponent(error_description || error)}`);
      }

      if (!code || !state) {
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=invalid_callback`);
      }

      const parsedState = parseState(state);
      if (!parsedState || parsedState.userId !== req.user.id || parsedState.platform !== platform) {
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=invalid_state`);
      }

      // Check state age (max 10 minutes)
      if (Date.now() - parsedState.timestamp > 10 * 60 * 1000) {
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=state_expired`);
      }

      const config = getClientConfig(platform);

      // Exchange code for tokens
      const tokenParams = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      });

      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        log.error('Token exchange failed', { platform, error: tokenData });
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=token_exchange_failed`);
      }

      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token) {
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=no_access_token`);
      }
      // Store the tokens
      const repo = platformAccountsRepo;
      const userId = req.user.id;

      // Meta: auto-detect ad accounts and save them (like connect-token does)
      if (platform === 'meta') {
        let userName = 'Meta Account';
        let adAccounts = [];
        try {
          const meRes = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v22.0'}/me?access_token=${encodeURIComponent(access_token)}&fields=id,name`);
          const meData = await meRes.json();
          if (meData.name) userName = meData.name;
          const accRes = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v22.0'}/me/adaccounts?access_token=${encodeURIComponent(access_token)}&fields=name,account_id,account_status,currency&limit=50`);
          const accData = await accRes.json();
          if (accData.data) {
            adAccounts = accData.data.filter(a => a.account_status === 1).map(a => ({
              id: `act_${a.account_id}`,
              name: a.name,
              account_id: a.account_id,
              currency: a.currency,
              status: 'active',
            }));
          }
        } catch (e) {
          log.error('Meta auto-detect failed', { error: e.message });
        }

        const existingAccounts = repo.getAccounts ? repo.getAccounts('meta').filter(a => a.user_id === userId) : [];
        const existing = existingAccounts.find(a => a.account_name === userName || a.credentials?.access_token === access_token);
        let mainId;
        if (existing) {
          repo.updateAccount(existing.id, { credentials: { access_token, user_name: userName }, is_active: 1 });
          mainId = existing.id;
        } else {
          const created = repo.create({
            user_id: userId,
            platform: 'meta',
            account_name: userName,
            credentials: { access_token, user_name: userName },
            is_active: existingAccounts.length === 0 ? 1 : 0,
          });
          mainId = created.id;
        }
        for (const adAcc of adAccounts) {
          const adExisting = existingAccounts.find(a => a.account_name === adAcc.id || a.account_name === adAcc.name);
          if (!adExisting) {
            repo.create({
              user_id: userId,
              platform: 'meta',
              account_name: adAcc.id,
              credentials: { access_token, ad_account_id: adAcc.account_id, ad_account_name: adAcc.name },
              is_active: 0,
            });
          }
        }
        log.info('Meta connected via OAuth', { userId, adAccounts: adAccounts.length, mainId });
        return res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/campaigns/wizard?connected=meta`);
      }

      const created = repo.create({
        user_id: userId,
        platform,
        account_name: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
        credentials: {
          access_token,
          refresh_token: refresh_token || null,
          expires_at: expires_in ? Date.now() + expires_in * 1000 : null,
        },
        is_active: 1,
      });

      // Set as active account for this user/platform
      repo.setActiveAccountForUser(platform, created.id, userId);

      log.info('Platform connected via OAuth', { userId, platform, accountId: created.id });

      res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?connected=${platform}`);
    } catch (err) {
      log.error('OAuth callback failed', { error: err.message, platform: req.params.platform });
      res.redirect(`${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/settings/connections?error=callback_failed`);
    }
  });

  return router;
}