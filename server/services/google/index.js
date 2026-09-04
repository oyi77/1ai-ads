import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('google-ads-api');

export class GoogleAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken, options = {}) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('google', settingsRepo, { baseUrl: 'https://googleads.googleapis.com/v16' });
    
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
    
    this.developerToken = options.developerToken || '';
    this.clientId = options.clientId || '';
    this.clientSecret = options.clientSecret || '';
    this.customerId = options.customerId || '';
  }

  static withToken(token, options = {}) {
    return new GoogleAdsAPI(token, options);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('google');
      if (creds?.access_token) return creds.access_token;
      if (creds?.refresh_token) return creds.refresh_token;
    }
    throw new ConfigurationError('Google Ads access token not configured. Connect a Google account in Settings.');
  }

  _googleHeaders() {
    const token = this._getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'developer-token': this.developerToken,
      'login-customer-id': this.customerId,
      'Content-Type': 'application/json',
    };
  }

  async search(customerId, query) {
    const url = `${this._baseUrl}/customers/${customerId}/googleAds:search`;
    
    try {
      const headers = this._googleHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, pageSize: 1000 }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google Ads API error ${response.status}: ${error?.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (err) {
      log.error('Google Ads search failed', { error: err.message, query });
      throw err;
    }
  }

  async getAdAccounts() {
    try {
      const results = await this.search('me', `
        SELECT 
          customer_client.resource_name,
          customer_client.id,
          customer_client.descriptive_name,
          customer_client.currency_code,
          customer_client.status
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'
      `);

      return results.map(row => ({
        id: row.customerClient?.id,
        resourceName: row.customerClient?.resourceName,
        name: row.customerClient?.descriptiveName || `Account ${row.customerClient?.id}`,
        currency: row.customerClient?.currencyCode,
        status: row.customerClient?.status,
      }));
    } catch (err) {
      log.error('Failed to list Google Ads accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  async getCampaigns(customerId, { limit = 50, status = null } = {}) {
    try {
      let query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.budget.amount_micros,
          campaign.start_date,
          campaign.end_date,
          campaign.impressions,
          campaign.clicks,
          campaign.cost_micros,
          campaign.ctr,
          campaign.average_cpc,
          campaign.conversions,
          campaign.cost_per_conversion
        FROM campaign
        WHERE campaign.status != 'REMOVED'
      `;
      
      if (status) {
        query += ` AND campaign.status = '${status}'`;
      }
      
      query += ` ORDER BY campaign.id LIMIT ${limit}`;

      const results = await this.search(customerId, query);
      
      return results.map(row => ({
        id: row.campaign?.id,
        name: row.campaign?.name,
        status: this._mapCampaignStatus(row.campaign?.status),
        channelType: row.campaign?.advertisingChannelType,
        budget: row.campaign?.budget?.amountMicros ? parseInt(row.campaign.budget.amountMicros) / 1000000 : 0,
        startDate: row.campaign?.startDate,
        endDate: row.campaign?.endDate,
        impressions: parseInt(row.campaign?.impressions) || 0,
        clicks: parseInt(row.campaign?.clicks) || 0,
        cost: row.campaign?.costMicros ? parseInt(row.campaign.costMicros) / 1000000 : 0,
        ctr: parseFloat(row.campaign?.ctr) || 0,
        averageCpc: row.campaign?.averageCpc ? parseInt(row.campaign.averageCpc) / 1000000 : 0,
        conversions: parseFloat(row.campaign?.conversions) || 0,
        costPerConversion: row.campaign?.costPerConversion ? parseInt(row.campaign.costPerConversion) / 1000000 : 0,
      }));
    } catch (err) {
      log.error('Failed to get Google Ads campaigns', { error: err.message, customerId });
      return [];
    }
  }

  async getCampaignInsights(customerId, campaignId, { datePreset = 'last_30d' } = {}) {
    try {
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_per_conversion,
          metrics.video_view_rate,
          metrics.video_views
        FROM campaign
        WHERE campaign.id = ${campaignId}
          AND segments.date DURING ${datePreset}
      `;

      const results = await this.search(customerId, query);
      
      if (results.length === 0) return null;
      
      const row = results[0];
      return {
        campaignId: row.campaign?.id,
        campaignName: row.campaign?.name,
        impressions: parseInt(row.metrics?.impressions) || 0,
        clicks: parseInt(row.metrics?.clicks) || 0,
        cost: row.metrics?.costMicros ? parseInt(row.metrics.costMicros) / 1000000 : 0,
        ctr: parseFloat(row.metrics?.ctr) || 0,
        averageCpc: row.metrics?.averageCpc ? parseInt(row.metrics.averageCpc) / 1000000 : 0,
        conversions: parseFloat(row.metrics?.conversions) || 0,
        costPerConversion: row.metrics?.costPerConversion ? parseInt(row.metrics.costPerConversion) / 1000000 : 0,
        videoViewRate: parseFloat(row.metrics?.videoViewRate) || 0,
        videoViews: parseInt(row.metrics?.videoViews) || 0,
      };
    } catch (err) {
      log.error('Failed to get campaign insights', { error: err.message, campaignId });
      return null;
    }
  }

  async getMultiCampaignInsights(customerId, campaignIds, { datePreset = 'last_30d' } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    
    try {
      const idList = campaignIds.join(', ');
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions
        FROM campaign
        WHERE campaign.id IN (${idList})
          AND segments.date DURING ${datePreset}
      `;

      const results = await this.search(customerId, query);
      
      const insights = {};
      for (const row of results) {
        const id = row.campaign?.id;
        insights[id] = {
          campaignId: id,
          campaignName: row.campaign?.name,
          impressions: parseInt(row.metrics?.impressions) || 0,
          clicks: parseInt(row.metrics?.clicks) || 0,
          cost: row.metrics?.costMicros ? parseInt(row.metrics.costMicros) / 1000000 : 0,
          ctr: parseFloat(row.metrics?.ctr) || 0,
          averageCpc: row.metrics?.averageCpc ? parseInt(row.metrics.averageCpc) / 1000000 : 0,
          conversions: parseFloat(row.metrics?.conversions) || 0,
        };
      }
      
      return insights;
    } catch (err) {
      log.error('Failed to get multi-campaign insights', { error: err.message });
      return {};
    }
  }

  async getAccountInsights(customerId, { datePreset = 'last_30d' } = {}) {
    try {
      const query = `
        SELECT
          customer.id,
          customer.descriptive_name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_per_conversion
        FROM customer
        WHERE segments.date DURING ${datePreset}
      `;

      const results = await this.search(customerId, query);
      
      if (results.length === 0) return null;
      
      const row = results[0];
      return {
        customerId: row.customer?.id,
        customerName: row.customer?.descriptiveName,
        impressions: parseInt(row.metrics?.impressions) || 0,
        clicks: parseInt(row.metrics?.clicks) || 0,
        cost: row.metrics?.costMicros ? parseInt(row.metrics.costMicros) / 1000000 : 0,
        ctr: parseFloat(row.metrics?.ctr) || 0,
        averageCpc: row.metrics?.averageCpc ? parseInt(row.metrics.averageCpc) / 1000000 : 0,
        conversions: parseFloat(row.metrics?.conversions) || 0,
        costPerConversion: row.metrics?.costPerConversion ? parseInt(row.metrics.costPerConversion) / 1000000 : 0,
      };
    } catch (err) {
      log.error('Failed to get account insights', { error: err.message, customerId });
      return null;
    }
  }

  async updateCampaign(customerId, campaignId, { status, dailyBudget } = {}) {
    try {
      const url = `${this._baseUrl}/customers/${customerId}/campaigns:mutate`;
      
      const operations = [];
      
      if (status) {
        operations.push({
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            status: this._reverseMapCampaignStatus(status),
          },
          updateMask: 'status',
        });
      }
      
      if (dailyBudget !== undefined) {
        operations.push({
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            budget: {
              amountMicros: Math.round(dailyBudget * 1000000),
            },
          },
          updateMask: 'budget.amount_micros',
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this._googleHeaders(),
        body: JSON.stringify({ operations }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google Ads API error ${response.status}: ${error?.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      log.info('Google Ads campaign updated', { customerId, campaignId, status, dailyBudget });
      
      return {
        id: campaignId,
        updated: true,
        results: data.results || [],
      };
    } catch (err) {
      log.error('Failed to update Google Ads campaign', { error: err.message, campaignId });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  async createCampaign(customerId, data = {}) {
    try {
      const url = `${this._baseUrl}/customers/${customerId}/campaigns:mutate`;
      
      const campaign = {
        name: data.name || `Campaign ${Date.now()}`,
        advertisingChannelType: data.channelType || 'SEARCH',
        status: 'PAUSED',
        budget: {
          amountMicros: Math.round((data.dailyBudget || 10) * 1000000),
        },
        startDate: data.startDate || new Date().toISOString().split('T')[0],
      };

      if (data.endDate) {
        campaign.endDate = data.endDate;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this._googleHeaders(),
        body: JSON.stringify({
          operations: [{ create: campaign }],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google Ads API error ${response.status}: ${error?.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const resourceName = result.results?.[0]?.resourceName;
      const campaignId = resourceName?.split('/').pop();
      
      log.info('Google Ads campaign created', { customerId, campaignId, name: campaign.name });
      
      return {
        campaignId,
        resourceName,
        name: campaign.name,
        status: 'paused',
      };
    } catch (err) {
      log.error('Failed to create Google Ads campaign', { error: err.message, data });
      return { campaignId: null, error: err.message };
    }
  }

  async syncAllAccounts() {
    try {
      const accounts = await this.getAdAccounts();
      const synced = [];
      
      for (const account of accounts) {
        const campaigns = await this.getCampaigns(account.id);
        synced.push({
          ...account,
          campaigns,
          campaignCount: campaigns.length,
        });
      }
      
      log.info('Google Ads sync complete', { accounts: synced.length });
      return synced;
    } catch (err) {
      log.error('Failed to sync Google Ads accounts', { error: err.message });
      return [];
    }
  }

  _mapCampaignStatus(googleStatus) {
    const statusMap = {
      'ENABLED': 'active',
      'PAUSED': 'paused',
      'REMOVED': 'removed',
    };
    return statusMap[googleStatus] || googleStatus?.toLowerCase() || 'unknown';
  }

  _reverseMapCampaignStatus(status) {
    const statusMap = {
      'active': 'ENABLED',
      'paused': 'PAUSED',
      'removed': 'REMOVED',
    };
    return statusMap[status] || 'PAUSED';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''} ${err?.error?.message || ''}`.toLowerCase();
    return (
      err?.code === 401 ||
      err?.code === 403 ||
      msg.includes('unauthorized') ||
      msg.includes('invalid credentials') ||
      msg.includes('token expired') ||
      msg.includes('authentication failed')
    );
  }
}

export default GoogleAdsAPI;
