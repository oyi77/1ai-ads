import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('linkedin-ads-api');

/**
 * LinkedIn Ads API client.
 * Uses LinkedIn Marketing API with OAuth2 authentication.
 * 
 * Campaign structure:
 *   Account → Campaign → Creative
 * 
 * NOTE: This is a scaffold implementation. Real API calls require:
 * 1. LinkedIn App ID and Secret
 * 2. OAuth2 authorization code flow
 * 3. Ad Account ID from user
 */
export class LinkedInAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('linkedin', settingsRepo, { baseUrl: 'https://api.linkedin.com/v2' });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
  }

  static withToken(token) {
    return new LinkedInAdsAPI(token);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('linkedin');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('LinkedIn Ads access token not configured. Connect a LinkedIn account in Settings.');
  }

  // --- Account Management ---

  async getMe() {
    return { id: 'me', name: 'LinkedIn Ads Account' };
  }

  async getAdAccounts() {
    log.warn('LinkedInAdsAPI.getAdAccounts: returning mock data');
    return [];
  }

  async getAccounts() { return this.getAdAccounts(); }

  // --- Campaign Management ---

  async getCampaigns(accountId, { limit = 50 } = {}) {
    log.warn('LinkedInAdsAPI.getCampaigns: returning mock data');
    return [];
  }

  async getCampaignInsights(campaignId, { datePreset = 'last_30d' } = {}) {
    log.warn('LinkedInAdsAPI.getCampaignInsights: returning mock data');
    return null;
  }

  async getMultiCampaignInsights(campaignIds, { datePreset = 'last_30d', accountId = null } = {}) {
    log.warn('LinkedInAdsAPI.getMultiCampaignInsights: returning mock data');
    return {};
  }

  async getAccountInsights(accountId, { datePreset = 'last_30d' } = {}) {
    log.warn('LinkedInAdsAPI.getAccountInsights: returning mock data');
    return null;
  }

  async updateCampaign(campaignId, { status, dailyBudget } = {}) {
    log.warn('LinkedInAdsAPI.updateCampaign: not yet implemented');
    return { id: campaignId, updated: false };
  }

  async createCampaign(accountId, data = {}) {
    log.warn('LinkedInAdsAPI.createCampaign: not yet implemented');
    return { campaignId: null };
  }

  async syncAllAccounts() {
    log.warn('LinkedInAdsAPI.syncAllAccounts: not yet implemented');
    return [];
  }

  // --- Error Handling ---

  isExpiredToken(err) {
    const msg = `${err?.message || ''} ${err?.error?.message || ''}`.toLowerCase();
    return (
      err?.code === 401 ||
      err?.code === 403 ||
      msg.includes('unauthorized') ||
      msg.includes('token expired')
    );
  }
}

export default LinkedInAdsAPI;
