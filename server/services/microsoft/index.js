import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

export class MicrosoftAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken, options = {}) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('microsoft', settingsRepo, { baseUrl: 'https://campaign.api.bingads.microsoft.com/v13' });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
    this.developerToken = options.developerToken || '';
    this.customerId = options.customerId || '';
    this.accountId = options.accountId || '';
  }

  static withToken(token, options = {}) {
    return new MicrosoftAdsAPI(token, options);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('microsoft');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('Microsoft Ads access token not configured.');
  }

  // SOAP-based API - scaffold only. Real implementation requires SOAP client.
  async getAdAccounts() { return []; }
  async getAccounts() { return this.getAdAccounts(); }
  async getCampaigns(_accountId, { limit: _limit } = {}) { return []; }
  async getCampaignInsights(_accountId, _campaignId, { startDate: _startDate, endDate: _endDate } = {}) { return null; }
  async getMultiCampaignInsights(accountId, campaignIds, { startDate, endDate } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    const insights = {};
    for (const id of campaignIds) {
      insights[id] = await this.getCampaignInsights(accountId, id, { startDate, endDate });
    }
    return insights;
  }
  async getAccountInsights(_accountId, { startDate: _startDate, endDate: _endDate } = {}) { return null; }
  async updateCampaign(_accountId, campaignId, { status: _status, budget: _budget } = {}) {
    return { id: campaignId, updated: false, error: 'SOAP client required' };
  }
  async createCampaign(_accountId, _data = {}) {
    return { campaignId: null, error: 'SOAP client required' };
  }
  async syncAllAccounts() { return []; }

  _mapStatus(status) {
    const statusMap = { 'Active': 'active', 'Paused': 'paused', 'Deleted': 'removed', 'Expired': 'removed' };
    return statusMap[status] || status?.toLowerCase() || 'unknown';
  }

  _reverseMapStatus(status) {
    const statusMap = { 'active': 'Active', 'paused': 'Paused', 'removed': 'Deleted' };
    return statusMap[status] || 'Paused';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''}`.toLowerCase();
    return err?.code === 401 || err?.code === 403 || msg.includes('unauthorized') || msg.includes('token expired');
  }
}

export default MicrosoftAdsAPI;
