import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('tiktok-ads-api');

/**
 * TikTok Ads API client.
 * Uses TikTok Marketing API with OAuth2 authentication.
 * 
 * Campaign structure:
 *   Advertiser → Campaign → AdGroup → Ad
 * 
 * NOTE: This is a scaffold implementation. Real API calls require:
 * 1. TikTok App ID and Secret
 * 2. OAuth2 authorization code flow
 * 3. Advertiser ID from user
 */
export class TikTokAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('tiktok', settingsRepo, { baseUrl: 'https://business-api.tiktok.com/open_api/v1.3' });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
  }

  static withToken(token) {
    return new TikTokAdsAPI(token);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('tiktok');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('TikTok Ads access token not configured. Connect a TikTok account in Settings.');
  }

  // --- Account Management ---

  async getMe() {
    return { id: 'me', name: 'TikTok Ads Account' };
  }

  async getAdAccounts() {
    log.warn('TikTokAdsAPI.getAdAccounts: returning mock data');
    return [];
  }

  async getAccounts() { return this.getAdAccounts(); }

  // --- Campaign Management ---

  async getCampaigns(accountId, { limit = 50 } = {}) {
    log.warn('TikTokAdsAPI.getCampaigns: returning mock data');
    return [];
  }

  async getCampaignInsights(campaignId, { datePreset = 'last_30d' } = {}) {
    log.warn('TikTokAdsAPI.getCampaignInsights: returning mock data');
    return null;
  }

  async getMultiCampaignInsights(campaignIds, { datePreset = 'last_30d', accountId = null } = {}) {
    log.warn('TikTokAdsAPI.getMultiCampaignInsights: returning mock data');
    return {};
  }

  async getAccountInsights(accountId, { datePreset = 'last_30d' } = {}) {
    log.warn('TikTokAdsAPI.getAccountInsights: returning mock data');
    return null;
  }

  async updateCampaign(campaignId, { status, dailyBudget } = {}) {
    log.warn('TikTokAdsAPI.updateCampaign: not yet implemented');
    return { id: campaignId, updated: false };
  }

  async createCampaign(accountId, data = {}) {
    log.warn('TikTokAdsAPI.createCampaign: not yet implemented');
    return { campaignId: null };
  }

  async syncAllAccounts() {
    log.warn('TikTokAdsAPI.syncAllAccounts: not yet implemented');
    return [];
  }

  // --- Error Handling ---

  isExpiredToken(err) {
    const msg = `${err?.message || ''} ${err?.error?.message || ''}`.toLowerCase();
    return (
      err?.code === 401 ||
      err?.code === 403 ||
      msg.includes('unauthorized') ||
      msg.includes('access_token') ||
      msg.includes('token invalid')
    );
  }
}

export default TikTokAdsAPI;
