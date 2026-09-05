import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('linkedin-ads-api');

/**
 * LinkedIn Ads API v2 implementation.
 * 
 * Documentation: https://learn.microsoft.com/en-us/linkedin/marketing/
 * 
 * Base URL: https://api.linkedin.com/v2
 * 
 * Key endpoints:
 * - GET /adAccounts — List ad accounts
 * - GET /adAccounts/{id}/adCampaigns — List campaigns
 * - GET /adAnalytics — Campaign analytics
 * - POST /adCampaigns — Create campaign
 * - PATCH /adCampaigns/{id} — Update campaign
 * 
 * OAuth scopes needed:
 * - r_ads
 * - r_ads_reporting
 * - r_organization_social
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
    throw new ConfigurationError('LinkedIn Ads access token not configured.');
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
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
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

  /**
   * Get all ad accounts accessible to the authenticated user.
   * LinkedIn API: GET /adAccounts?q=search
   */
  async getAdAccounts() {
    try {
      const data = await this._request('GET', '/adAccounts', { 
        q: 'search',
        count: 100,
      });
      const items = data.elements || [];
      return items.map(item => ({
        id: item.id,
        name: item.name?.localized?.en_US || item.name || `Account ${item.id}`,
        status: this._mapStatus(item.status),
        currency: item.currency || 'USD',
        created_time: item.created,
        type: item.type,
      }));
    } catch (err) {
      log.error('Failed to list LinkedIn ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  /**
   * Get campaigns for a specific ad account.
   * LinkedIn API: GET /adCampaigns?q=account
   */
  async getCampaigns(accountId, { limit = 50 } = {}) {
    try {
      const data = await this._request('GET', '/adCampaigns', {
        account: `urn:li:sponsoredAccount:${accountId}`,
        count: limit,
        q: 'account',
      });
      const items = data.elements || [];
      return items.map(item => ({
        id: item.id,
        name: item.name?.localized?.en_US || item.name || `Campaign ${item.id}`,
        status: this._mapStatus(item.status),
        budget: item.totalBudget?.amount ? { amount: item.totalBudget.amount, currency: item.totalBudget.currency } : null,
        created_time: item.created,
        start_date: item.startDate,
        end_date: item.endDate,
        objective: item.objectiveType,
      }));
    } catch (err) {
      log.error('Failed to get LinkedIn campaigns', { error: err.message, accountId });
      return [];
    }
  }

  /**
   * Get campaign analytics/insights.
   * LinkedIn API: GET /adAnalytics
   */
  async getCampaignInsights(accountId, campaignId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const params = {
        q: 'analytics',
        pivot: 'CAMPAIGN',
        campaigns: `urn:li:sponsoredCampaign:${campaignId}`,
        dateRange: JSON.stringify({
          start: { year: parseInt(dateRange.start.split('-')[0]), month: parseInt(dateRange.start.split('-')[1]), day: parseInt(dateRange.start.split('-')[2]) },
          end: { year: parseInt(dateRange.end.split('-')[0]), month: parseInt(dateRange.end.split('-')[1]), day: parseInt(dateRange.end.split('-')[2]) },
        }),
        fields: 'clicks,impressions,externalWebsiteConversions,costInLocalCurrency',
      };

      const data = await this._request('GET', '/adAnalytics', params);
      const items = data.elements || [];
      if (items.length === 0) return null;

      const row = items[0];
      return {
        campaignId,
        spend: parseFloat(row.costInLocalCurrency) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        conversions: parseInt(row.externalWebsiteConversions) || 0,
        ctr: parseFloat(row.ctr) || 0,
      };
    } catch (err) {
      log.error('Failed to get LinkedIn campaign insights', { error: err.message, campaignId });
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

  /**
   * Get account-level insights.
   */
  async getAccountInsights(accountId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const params = {
        q: 'analytics',
        pivot: 'ACCOUNT',
        accounts: `urn:li:sponsoredAccount:${accountId}`,
        dateRange: JSON.stringify({
          start: { year: parseInt(dateRange.start.split('-')[0]), month: parseInt(dateRange.start.split('-')[1]), day: parseInt(dateRange.start.split('-')[2]) },
          end: { year: parseInt(dateRange.end.split('-')[0]), month: parseInt(dateRange.end.split('-')[1]), day: parseInt(dateRange.end.split('-')[2]) },
        }),
        fields: 'clicks,impressions,externalWebsiteConversions,costInLocalCurrency',
      };

      const data = await this._request('GET', '/adAnalytics', params);
      const items = data.elements || [];
      if (items.length === 0) return null;

      const row = items[0];
      return {
        accountId,
        spend: parseFloat(row.costInLocalCurrency) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        conversions: parseInt(row.externalWebsiteConversions) || 0,
        ctr: parseFloat(row.ctr) || 0,
      };
    } catch (err) {
      log.error('Failed to get LinkedIn account insights', { error: err.message, accountId });
      return null;
    }
  }

  /**
   * Update campaign status.
   * LinkedIn API: PATCH /adCampaigns/{id}
   */
  async updateCampaign(accountId, campaignId, { status } = {}) {
    try {
      const body = {
        status: this._reverseMapStatus(status),
      };
      const data = await this._request('PATCH', `/adCampaigns/${campaignId}`, {}, body);
      return { id: campaignId, updated: true, status: data.status };
    } catch (err) {
      log.error('Failed to update LinkedIn campaign', { error: err.message, campaignId });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  /**
   * Create a new campaign.
   * LinkedIn API: POST /adCampaigns
   */
  async createCampaign(accountId, data = {}) {
    try {
      const body = {
        account: `urn:li:sponsoredAccount:${accountId}`,
        name: data.name || `Campaign ${Date.now()}`,
        status: 'PAUSED',
        objectiveType: data.objective || 'WEBSITE_VISITS',
      };

      if (data.budget) {
        body.totalBudget = {
          amount: data.budget,
          currencyCode: data.currency || 'USD',
        };
      }

      const result = await this._request('POST', '/adCampaigns', {}, body);
      return {
        campaignId: result.id,
        name: result.name?.localized?.en_US || result.name,
        status: result.status?.toLowerCase() || 'paused',
      };
    } catch (err) {
      log.error('Failed to create LinkedIn campaign', { error: err.message, accountId });
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
      log.error('Failed to sync LinkedIn accounts', { error: err.message });
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
      'DRAFT': 'draft',
      'COMPLETED': 'completed',
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
