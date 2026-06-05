/**
 * Meta/Facebook Connection Service
 *
 * Extracted from auth.js, settings.js, and autonomous.js routes (DRY).
 * Handles:
 *  - OAuth code exchange for long-lived tokens
 *  - Token verification and user info retrieval
 *  - Ad account auto-detection
 *  - Saving connected accounts to platform_accounts table
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('meta-connection');

const API_VERSION = config.metaApiVersion;

/**
 * Exchange a short-lived OAuth code for a long-lived access token.
 * @param {string} code - OAuth code from Facebook
 * @param {string} redirectUri - The redirect URI used in the OAuth flow
 * @returns {{ accessToken: string, expiresIn: number }}
 */
export async function exchangeCodeForToken(code, redirectUri) {
  const fbAppId = process.env.FB_APP_ID;
  const fbSecret = process.env.FB_APP_SECRET;

  if (!fbAppId || !fbSecret) {
    throw new Error('FB_APP_ID or FB_APP_SECRET not configured');
  }

  // Step 1: Exchange code for short-lived token
  const tokenUrl = `https://graph.facebook.com/${API_VERSION}/oauth/access_token?` +
    `client_id=${encodeURIComponent(fbAppId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `client_secret=${encodeURIComponent(fbSecret)}&` +
    `code=${encodeURIComponent(code)}`;

  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new Error(tokenData.error.message || 'Token exchange failed');
  }

  // Step 2: Exchange short-lived token for long-lived token
  const longUrl = `https://graph.facebook.com/${API_VERSION}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${encodeURIComponent(fbAppId)}&` +
    `client_secret=${encodeURIComponent(fbSecret)}&` +
    `access_token=${encodeURIComponent(tokenData.access_token)}`;

  const longRes = await fetch(longUrl);
  const longData = await longRes.json();

  if (longData.error) {
    throw new Error(longData.error.message || 'Long-lived token exchange failed');
  }

  return {
    accessToken: longData.access_token || tokenData.access_token,
    expiresIn: longData.expires_in || tokenData.expires_in || 0,
  };
}

/**
 * Verify a Meta access token and fetch user info.
 * @param {string} accessToken - Meta access token
 * @returns {{ userId: string, name: string, email: string }}
 */
export async function verifyTokenAndGetUser(accessToken) {
  const meUrl = `https://graph.facebook.com/${API_VERSION}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;
  const meRes = await fetch(meUrl);
  const meData = await meRes.json();

  if (meData.error) {
    throw new Error(meData.error.message || 'Token verification failed');
  }

  return {
    userId: meData.id,
    name: meData.name,
    email: meData.email,
  };
}

/**
 * Auto-detect ad accounts for a given access token.
 * @param {string} accessToken - Meta access token with ads_management permission
 * @returns {Array<{id: string, name: string}>}
 */
export async function detectAdAccounts(accessToken) {
  const accountsUrl = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?fields=id,name,account_status&access_token=${encodeURIComponent(accessToken)}`;
  const accountsRes = await fetch(accountsUrl);
  const accountsData = await accountsRes.json();

  if (accountsData.error) {
    log.warn('Could not auto-detect ad accounts', { error: accountsData.error.message });
    return [];
  }

  return (accountsData.data || []).map(a => ({
    id: a.id,
    name: a.name,
    status: a.account_status,
  }));
}

/**
 * Full connection flow: exchange code, verify user, detect accounts, save to DB.
 * @param {string} code - OAuth code from Facebook
 * @param {string} redirectUri - Redirect URI used in OAuth flow
 * @param {object} platformAccountsRepo - PlatformAccountsRepository instance
 * @param {string} userId - User ID to associate the account with
 * @returns {{ accessToken, user, accounts }}
 */
export async function connectMetaAccount(code, redirectUri, platformAccountsRepo, userId) {
  const { accessToken, expiresIn } = await exchangeCodeForToken(code, redirectUri);
  const user = await verifyTokenAndGetUser(accessToken);
  const accounts = await detectAdAccounts(accessToken);

  // Save or update each detected ad account
  for (const account of accounts) {
    const existing = platformAccountsRepo.getAccountByPlatformId(account.id);
    if (existing) {
      platformAccountsRepo.updateAccount(existing.id, {
        credentials: { accessToken, expiresIn, fbUserId: user.userId },
        is_active: 1,
      });
    } else {
      platformAccountsRepo.addAccount({
        id: `meta_${account.id}`,
        user_id: userId,
        platform: 'meta',
        account_name: account.name,
        credentials: { accessToken, expiresIn, fbUserId: user.userId, accountId: account.id },
        is_active: 1,
      });
    }
  }

  // If no accounts detected, still save the token
  if (accounts.length === 0) {
    const existing = platformAccountsRepo.findByUserAndPlatform(userId, 'meta');
    if (!existing) {
      platformAccountsRepo.addAccount({
        id: `meta_${user.userId}`,
        user_id: userId,
        platform: 'meta',
        account_name: user.name,
        credentials: { accessToken, expiresIn, fbUserId: user.userId },
        is_active: 1,
      });
    }
  }

  log.info('Meta account connected', { userId, fbUserId: user.userId, accountsCount: accounts.length });

  return { accessToken, user, accounts };
}