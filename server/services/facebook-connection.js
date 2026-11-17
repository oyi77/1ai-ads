/**
 * Facebook Connection Service — OAuth + Account Linking
 *
 * Thin class wrapper over meta-connection.js's free functions so callers
 * can inject it as a service. The OAuth/token logic itself lives in
 * meta-connection.js — DEF-17 (audit 2026-11-18): connectFacebook previously
 * reimplemented exchangeCodeForToken with POST form-encoded body instead of
 * GET query params, producing two divergent OAuth paths.
 */

import { MetaAdsAPI } from './meta/index.js';
import { exchangeCodeForToken, verifyMetaTokenApp } from './meta-connection.js';

export class FacebookConnectionService {
  constructor(platformAccountsRepo) {
    this.platformAccountsRepo = platformAccountsRepo;
  }

  /**
   * Exchange auth code for long-lived access token.
   * Delegates to meta-connection.exchangeCodeForToken — single source of truth.
   */
  async connectFacebook(authCode, redirectUri) {
    return exchangeCodeForToken(authCode, redirectUri);
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
    await verifyMetaTokenApp(accessToken);
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
