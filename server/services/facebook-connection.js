/**
 * Facebook Connection Service — OAuth + Account Linking
 *
 * Extracted from AutonomousAgent (SRP).
 * Handles only: OAuth token exchange, account discovery, platform linking.
 */

import config from '../config/index.js';
import { MetaAdsAPI } from './meta-api.js';

const API_VERSION = config.metaApiVersion;

export class FacebookConnectionService {
  constructor(platformAccountsRepo) {
    this.platformAccountsRepo = platformAccountsRepo;
  }

  /**
   * Exchange auth code for long-lived access token.
   */
  async connectFacebook(authCode, redirectUri) {
    const tokenUrl = `https://graph.facebook.com/${API_VERSION}/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.fbAppId,
        redirect_uri: redirectUri,
        client_secret: config.fbAppSecret,
        code: authCode,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const longLived = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: config.fbAppId,
        client_secret: config.fbAppSecret,
        access_token: data.access_token,
      }),
    });
    const longData = await longLived.json();

    return {
      accessToken: longData.access_token || data.access_token,
      expires: longData.expires_in || 0,
    };
  }

  /**
   * Discover Facebook accounts (personal + business).
   */
  async getFacebookAccounts(accessToken) {
    const metaApi = MetaAdsAPI.withToken(accessToken);
    const userResponse = await metaApi.apiGet('/me/accounts', { fields: 'id,name,access_token,perms' });
    const businessResponse = await metaApi.apiGet('/me/businesses', { fields: 'id,name' });

    return {
      personal: (userResponse.data || []).filter(a => a.perms?.includes('CREATE_AD')),
      business: businessResponse.data || [],
    };
  }

  /**
   * Link a Facebook account to platform_accounts table.
   */
  async linkFacebookAccount(userId, accountId, accountName, accessToken) {
    return this.platformAccountsRepo.upsert({
      user_id: userId,
      platform: 'meta',
      platform_id: accountId,
      name: accountName,
      access_token: accessToken,
      status: 'connected',
      metadata: JSON.stringify({ last_sync: new Date().toISOString() }),
    });
  }
}
