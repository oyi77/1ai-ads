import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('pinterest-ads-api');

export class PinterestAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('pinterest', settingsRepo, { baseUrl: 'https://api.pinterest.com/v5' });
    
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
  }

  static withToken(token) {
    return new PinterestAdsAPI(token);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('pinterest');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('Pinterest Ads access token not configured.');
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
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Pinterest API error ${response.status}: ${error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      log.error('Pinterest API request failed', { error: err.message, path });
      throw err;
    }
  }

  async getAdAccounts() {
    try {
      const data = await this._request('GET', '/ad_accounts');
      return (data?.items || []).map(item => ({
        id: item.id,
        name: item.name,
        status: item.status,
        country: item.country,
        currency: item.currency,
      }));
    } catch (err) {
      log.error('Failed to list Pinterest ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  async getCampaigns(adAccountId, { limit = 50 } = {}) {
    try {
      const data = await this._request('GET', `/ad_accounts/${adAccountId}/campaigns`, {
        page_size: limit,
      });
      return (data?.items || []).map(item => ({
        id: item.id,
        name: item.name,
        status: this._mapStatus(item.status),
        budget: item.budget?.amount || 0,
        created_time: item.created_time,
      }));
    } catch (err) {
      log.error('Failed to get Pinterest campaigns', { error: err.message });
      return [];
    }
  }

  async getCampaignInsights(adAccountId, campaignId, { startDate, endDate } = {}) {
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        metrics: 'IMPRESSION,CLICK,SPEND_IN_DOLLAR,CONVERSION,COST_PER_CONVERSION',
      };
      const data = await this._request('GET', `/ad_accounts/${adAccountId}/campaigns/${campaignId}/analytics`, params);
      return {
        campaignId,
        impressions: data?.IMPRESSION || 0,
        clicks: data?.CLICK || 0,
        spend: data?.SPEND_IN_DOLLAR || 0,
        conversions: data?.CONVERSION || 0,
      };
    } catch (err) {
      log.error('Failed to get Pinterest campaign insights', { error: err.message });
      return null;
    }
  }

  async getMultiCampaignInsights(adAccountId, campaignIds, { startDate, endDate } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    const insights = {};
    for (const id of campaignIds) {
      insights[id] = await this.getCampaignInsights(adAccountId, id, { startDate, endDate });
    }
    return insights;
  }

  async getAccountInsights(adAccountId, { startDate, endDate } = {}) {
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        metrics: 'IMPRESSION,CLICK,SPEND_IN_DOLLAR,CONVERSION',
      };
      const data = await this._request('GET', `/ad_accounts/${adAccountId}/analytics`, params);
      return {
        adAccountId,
        impressions: data?.IMPRESSION || 0,
        clicks: data?.CLICK || 0,
        spend: data?.SPEND_IN_DOLLAR || 0,
        conversions: data?.CONVERSION || 0,
      };
    } catch (err) {
      log.error('Failed to get Pinterest account insights', { error: err.message });
      return null;
    }
  }

  async updateCampaign(adAccountId, campaignId, { status } = {}) {
    try {
      const data = await this._request('PATCH', `/ad_accounts/${adAccountId}/campaigns/${campaignId}`, {}, {
        status: this._reverseMapStatus(status),
      });
      return { id: campaignId, updated: true, data };
    } catch (err) {
      log.error('Failed to update Pinterest campaign', { error: err.message });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  async createCampaign(adAccountId, data = {}) {
    try {
      const body = {
        name: data.name || `Campaign ${Date.now()}`,
        status: 'ACTIVE',
        budget: { amount: data.budget || 10 },
      };
      const result = await this._request('POST', `/ad_accounts/${adAccountId}/campaigns`, {}, body);
      return { campaignId: result?.id, name: body.name, status: 'active' };
    } catch (err) {
      log.error('Failed to create Pinterest campaign', { error: err.message });
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
      log.error('Failed to sync Pinterest accounts', { error: err.message });
      return [];
    }
  }

  _mapStatus(status) {
    const statusMap = {
      'ACTIVE': 'active',
      'PAUSED': 'paused',
      'DELETED': 'removed',
    };
    return statusMap[status] || status?.toLowerCase() || 'unknown';
  }

  _reverseMapStatus(status) {
    const statusMap = {
      'active': 'ACTIVE',
      'paused': 'PAUSED',
      'removed': 'DELETED',
    };
    return statusMap[status] || 'PAUSED';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''}`.toLowerCase();
    return err?.code === 401 || err?.code === 403 || msg.includes('unauthorized') || msg.includes('token expired');
  }
}

export default PinterestAdsAPI;
