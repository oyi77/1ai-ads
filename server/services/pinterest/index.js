import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('pinterest-ads-api');

/**
 * Pinterest Ads API v5 implementation.
 * 
 * Documentation: https://developers.pinterest.com/docs/api/v5/
 * 
 * Base URL: https://api.pinterest.com/v5
 * 
 * Key endpoints:
 * - GET /ad_accounts          — List ad accounts
 * - GET /ad_accounts/{id}/campaigns — List campaigns for an account
 * - GET /ad_accounts/{id}/campaigns/analytics — Campaign insights
 * - GET /ad_accounts/{id}/analytics — Account-level analytics
 * 
 * OAuth scopes needed:
 * - ads:read
 * - ads:write (for campaign mutations)
 */
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
    const token = this._getToken();
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
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

  /**
   * Get all ad accounts accessible to the authenticated user.
   * Returns: [{ id, name, status, currency, ... }]
   */
  async getAdAccounts() {
    try {
      const data = await this._request('GET', '/ad_accounts', { page_size: 100 });
      const items = data.items || [];
      return items.map(item => ({
        id: item.id,
        name: item.name,
        status: this._mapStatus(item.status),
        currency: item.currency,
        owner_username: item.owner?.username,
        created_time: item.created_time,
      }));
    } catch (err) {
      log.error('Failed to list Pinterest ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  /**
   * Get campaigns for a specific ad account.
   * Pinterest API: GET /ad_accounts/{ad_account_id}/campaigns
   */
  async getCampaigns(adAccountId, { limit = 50 } = {}) {
    try {
      const data = await this._request('GET', `/ad_accounts/${adAccountId}/campaigns`, {
        page_size: limit,
      });
      const items = data.items || [];
      return items.map(item => ({
        id: item.id,
        name: item.name,
        status: this._mapStatus(item.status),
        budget: item.daily_budget ? { daily: item.daily_budget, currency: item.currency } : null,
        created_time: item.created_time,
        start_date: item.start_date,
        end_date: item.end_date,
      }));
    } catch (err) {
      log.error('Failed to get Pinterest campaigns', { error: err.message, adAccountId });
      return [];
    }
  }

  /**
   * Get campaign insights/analytics.
   * Pinterest API: GET /ad_accounts/{ad_account_id}/campaigns/analytics
   */
  async getCampaignInsights(adAccountId, campaignId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const params = {
        campaign_ids: campaignId,
        start_date: dateRange.start,
        end_date: dateRange.end,
        columns: 'SPEND_IN_DOLLAR,IMPRESSION,CLICK,OUTBOUND_CLICK,PAID_IMPRESSION,CTR,CPC_IN_DOLLAR,CPM_IN_DOLLAR,COST_PER_CONVERSION_IN_DOLLAR,TOTAL_CONVERSIONS,TOTAL_CLICKTHROUGH,TOTAL_IMPRESSION,TOTAL_SPEND,TOTAL_ENGAGEMENT',
      };

      const data = await this._request('GET', `/ad_accounts/${adAccountId}/campaigns/analytics`, params);
      const items = data.items || [];
      if (items.length === 0) return null;

      const row = items[0];
      return {
        campaignId,
        spend: parseFloat(row.SPEND_IN_DOLLAR) || 0,
        impressions: parseInt(row.IMPRESSION) || 0,
        clicks: parseInt(row.CLICK) || 0,
        conversions: parseInt(row.TOTAL_CONVERSIONS) || 0,
        ctr: parseFloat(row.CTR) || 0,
        cpc: parseFloat(row.CPC_IN_DOLLAR) || 0,
        cpm: parseFloat(row.CPM_IN_DOLLAR) || 0,
      };
    } catch (err) {
      log.error('Failed to get Pinterest campaign insights', { error: err.message, campaignId });
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

  /**
   * Get account-level insights.
   * Pinterest API: GET /ad_accounts/{ad_account_id}/analytics
   */
  async getAccountInsights(adAccountId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const params = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        columns: 'SPEND_IN_DOLLAR,IMPRESSION,CLICK,OUTBOUND_CLICK,PAID_IMPRESSION,CTR,CPC_IN_DOLLAR,CPM_IN_DOLLAR,COST_PER_CONVERSION_IN_DOLLAR,TOTAL_CONVERSIONS,TOTAL_CLICKTHROUGH,TOTAL_IMPRESSION,TOTAL_SPEND,TOTAL_ENGAGEMENT',
      };

      const data = await this._request('GET', `/ad_accounts/${adAccountId}/analytics`, params);
      const items = data.items || [];
      if (items.length === 0) return null;

      const row = items[0];
      return {
        adAccountId,
        spend: parseFloat(row.SPEND_IN_DOLLAR) || 0,
        impressions: parseInt(row.IMPRESSION) || 0,
        clicks: parseInt(row.CLICK) || 0,
        conversions: parseInt(row.TOTAL_CONVERSIONS) || 0,
        ctr: parseFloat(row.CTR) || 0,
        cpc: parseFloat(row.CPC_IN_DOLLAR) || 0,
        cpm: parseFloat(row.CPM_IN_DOLLAR) || 0,
      };
    } catch (err) {
      log.error('Failed to get Pinterest account insights', { error: err.message, adAccountId });
      return null;
    }
  }

  /**
   * Update campaign status.
   * Pinterest API: PATCH /ad_accounts/{ad_account_id}/campaigns/{campaign_id}
   */
  async updateCampaign(adAccountId, campaignId, { status } = {}) {
    try {
      const body = {
        status: this._reverseMapStatus(status),
      };
      const data = await this._request('PATCH', `/ad_accounts/${adAccountId}/campaigns/${campaignId}`, {}, body);
      return { id: campaignId, updated: true, status: data.status };
    } catch (err) {
      log.error('Failed to update Pinterest campaign', { error: err.message, campaignId });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  /**
   * Create a new campaign.
   * Pinterest API: POST /ad_accounts/{ad_account_id}/campaigns
   */
  async createCampaign(adAccountId, data = {}) {
    try {
      const body = {
        name: data.name || `Campaign ${Date.now()}`,
        status: 'PAUSED',
        objective_type: data.objective || 'AWARENESS',
      };

      if (data.budget) {
        body.daily_budget = data.budget;
      }

      const result = await this._request('POST', `/ad_accounts/${adAccountId}/campaigns`, {}, body);
      return {
        campaignId: result.id,
        name: result.name,
        status: result.status?.toLowerCase() || 'paused',
      };
    } catch (err) {
      log.error('Failed to create Pinterest campaign', { error: err.message, adAccountId });
      return { campaignId: null, error: err.message };
    }
  }

  async syncAllAccounts() {
    try {
      const accounts = await this.getAdAccounts();
      const results = [];
      
      for (const account of accounts) {
        const campaigns = await this.getCampaigns(account.id);
        results.push({
          account,
          campaigns,
          campaignCount: campaigns.length,
        });
      }
      
      return results;
    } catch (err) {
      log.error('Failed to sync Pinterest accounts', { error: err.message });
      throw err;
    }
  }

  _buildDateRange(startDate, endDate) {
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { start, end };
  }

  _mapStatus(status) {
    const statusMap = {
      'ACTIVE': 'active',
      'PAUSED': 'paused',
      'ARCHIVED': 'removed',
      'DELETED': 'removed',
      'CAMPAIGN_STATUS_RUNNING': 'active',
      'CAMPAIGN_STATUS_PAUSED': 'paused',
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
