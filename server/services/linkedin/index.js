import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('linkedin-ads-api');

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
    throw new ConfigurationError('LinkedIn Ads access token not configured.');
  }

  async _request(method, path, params = {}, body = null) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${this._getToken()}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`LinkedIn API error ${response.status}: ${error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      log.error('LinkedIn API request failed', { error: err.message, path });
      throw err;
    }
  }

  async getAdAccounts() {
    try {
      const data = await this._request('GET', '/adAccounts', { q: 'search', status: 'ACTIVE' });
      return (data?.elements || []).map(item => ({
        id: item.id,
        name: item.name,
        status: item.status,
        type: item.type,
        currency: item.currency,
      }));
    } catch (err) {
      log.error('Failed to list LinkedIn ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  async getCampaigns(accountId, { limit = 50 } = {}) {
    try {
      const data = await this._request('GET', '/adCampaigns', {
        q: 'search',
        account: `urn:li:sponsoredAccount:${accountId}`,
        count: limit,
      });
      return (data?.elements || []).map(item => ({
        id: item.id,
        name: item.name,
        status: this._mapStatus(item.status),
        budget: item.dailyBudget?.amount || 0,
        created: item.created,
      }));
    } catch (err) {
      log.error('Failed to get LinkedIn campaigns', { error: err.message });
      return [];
    }
  }

  async getCampaignInsights(accountId, campaignId, { startDate, endDate } = {}) {
    try {
      const params = {
        q: 'analytics',
        pivot: 'CAMPAIGN',
        timeGranularity: 'DAILY',
        campaigns: `urn:li:sponsoredCampaign:${campaignId}`,
        dateRange: `{"start":{"day":${startDate?.split('-')[2] || 1},"month":${startDate?.split('-')[1] || 1},"year":${startDate?.split('-')[0] || 2024}},"end":{"day":${endDate?.split('-')[2] || 28},"month":${endDate?.split('-')[1] || 2},"year":${endDate?.split('-')[0] || 2024}}}`,
        fields: 'impressions,clicks,externalWebsiteConversions,oneClickLeads,costInLocalCurrency',
      };
      const data = await this._request('GET', '/adAnalytics', params);
      if (!data?.elements || data.elements.length === 0) return null;
      const row = data.elements[0];
      return {
        campaignId,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        cost: parseFloat(row.costInLocalCurrency) || 0,
        conversions: row.externalWebsiteConversions || 0,
      };
    } catch (err) {
      log.error('Failed to get LinkedIn campaign insights', { error: err.message });
      return null;
    }
  }

  async getMultiCampaignInsights(accountId, campaignIds, { startDate, endDate } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    const insights = {};
    for (const id of campaignIds) {
      insights[id] = await this.getCampaignInsights(accountId, id, { startDate, endDate });
    }
    return insights;
  }

  async getAccountInsights(accountId, { startDate, endDate } = {}) {
    try {
      const params = {
        q: 'analytics',
        pivot: 'ACCOUNT',
        timeGranularity: 'DAILY',
        accounts: `urn:li:sponsoredAccount:${accountId}`,
        dateRange: `{"start":{"day":${startDate?.split('-')[2] || 1},"month":${startDate?.split('-')[1] || 1},"year":${startDate?.split('-')[0] || 2024}},"end":{"day":${endDate?.split('-')[2] || 28},"month":${endDate?.split('-')[1] || 2},"year":${endDate?.split('-')[0] || 2024}}}`,
        fields: 'impressions,clicks,externalWebsiteConversions,costInLocalCurrency',
      };
      const data = await this._request('GET', '/adAnalytics', params);
      if (!data?.elements || data.elements.length === 0) return null;
      const row = data.elements[0];
      return {
        accountId,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        cost: parseFloat(row.costInLocalCurrency) || 0,
        conversions: row.externalWebsiteConversions || 0,
      };
    } catch (err) {
      log.error('Failed to get LinkedIn account insights', { error: err.message });
      return null;
    }
  }

  async updateCampaign(accountId, campaignId, { status } = {}) {
    try {
      const data = await this._request('PATCH', `/adCampaigns/${campaignId}`, {}, {
        status: this._reverseMapStatus(status),
      });
      return { id: campaignId, updated: true, data };
    } catch (err) {
      log.error('Failed to update LinkedIn campaign', { error: err.message });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  async createCampaign(accountId, data = {}) {
    try {
      const body = {
        account: `urn:li:sponsoredAccount:${accountId}`,
        name: data.name || `Campaign ${Date.now()}`,
        status: 'PAUSED',
        type: 'SPONSORED_UPDATES',
        dailyBudget: { amount: data.budget || 10, currencyCode: 'USD' },
      };
      const result = await this._request('POST', '/adCampaigns', {}, body);
      return { campaignId: result?.id, name: body.name, status: 'paused' };
    } catch (err) {
      log.error('Failed to create LinkedIn campaign', { error: err.message });
      return { campaignId: null, error: err.message };
    }
  }

  async syncAllAccounts() {
    try {
      const accounts = await this.getAdAccounts();
      const synced = [];
      for (const account of accounts) {
        const campaigns = await this.getCampaigns(account.id);
        synced.push({ ...account, campaigns, campaignCount: campaigns.length });
      }
      return synced;
    } catch (err) {
      log.error('Failed to sync LinkedIn accounts', { error: err.message });
      return [];
    }
  }

  _mapStatus(status) {
    const statusMap = {
      'ACTIVE': 'active',
      'PAUSED': 'paused',
      'DRAFT': 'draft',
      'ARCHIVED': 'removed',
      'CANCELED': 'removed',
    };
    return statusMap[status] || status?.toLowerCase() || 'unknown';
  }

  _reverseMapStatus(status) {
    const statusMap = {
      'active': 'ACTIVE',
      'paused': 'PAUSED',
      'removed': 'ARCHIVED',
    };
    return statusMap[status] || 'PAUSED';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''}`.toLowerCase();
    return err?.code === 401 || err?.code === 403 || msg.includes('unauthorized') || msg.includes('token expired');
  }
}

export default LinkedInAdsAPI;
