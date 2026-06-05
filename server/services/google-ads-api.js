import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';

const BASE = 'https://googleads.googleapis.com/v18';

export class GoogleAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('google', settingsRepo, { baseUrl: BASE });
  }

  // Override: Google uses multiple auth headers
  _getConfig() {
    const creds = this.settingsRepo.getCredentials('google');
    if (!creds?.developer_token) {
      throw new ConfigurationError('Google Ads developer token not configured. Go to Settings > Google Ads. Get one at Google Ads > Tools > API Center.');
    }
    if (!creds?.oauth_token) {
      throw new ConfigurationError('Google Ads OAuth token not configured. Complete OAuth flow in Settings.');
    }
    return creds;
  }

  async _query(customerId, gaql) {
    const creds = this._getConfig();
    const res = await safeFetch('google', `${BASE}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.oauth_token}`,
        'developer-token': creds.developer_token,
        'Content-Type': 'application/json',
        ...(creds.login_customer_id && { 'login-customer-id': creds.login_customer_id }),
      },
      body: JSON.stringify({ query: gaql }),
    });
    const data = await res.json();
    
    const results = [];
    for (const batch of (data || [])) {
      if (batch.results) results.push(...batch.results);
    }
    return results;
  }

  async listAccounts() {
    const creds = this._getConfig();
    const res = await safeFetch('google', `${BASE}/customers:listAccessibleCustomers`, {
      headers: {
        'Authorization': `Bearer ${creds.oauth_token}`,
        'developer-token': creds.developer_token,
      },
    });
    const data = await res.json();
    return (data.resourceNames || []).map(r => r.replace('customers/', ''));
  }

  async syncAllAccounts() {
    const customerIds = await this.listAccounts();
    const results = [];
    for (const customerId of customerIds) {
      results.push(await this._syncSingleAccount(customerId));
    }
    return results;
  }

  async _syncSingleAccount(customerId) {
    try {
      const campaigns = await this.getCampaigns(customerId);
      const performance = await this.getCampaignPerformance(customerId);
      return { account: { id: customerId, name: `Google Ads (${customerId})` },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: performance.map(p => this._mapPerformance(p)),
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { account: { id: customerId, name: `Google Ads (${customerId})` }, error: err.message, syncedAt: new Date().toISOString() };
    }
  }

  _mapCampaign(c) {
    return { id: c.campaign.id, name: c.campaign.name, status: c.campaign.status.toLowerCase(),
      budget: parseFloat(c.campaignBudget.amountMicros) / 1000000,
    };
  }

  _mapPerformance(p) {
    return { campaign_id: p.campaign.id, spend: parseFloat(p.metrics.costMicros) / 1000000,
      impressions: parseInt(p.metrics.impressions), clicks: parseInt(p.metrics.clicks),
      conversions: parseFloat(p.metrics.conversions),
    };
  }

  async getCampaigns(customerId) {
    this.log.debug('Fetching Google Ads campaigns', { customerId });
    return this._query(customerId, `
      SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros,
             campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
      LIMIT 100
    `);
  }

  async getCampaignPerformance(customerId, { days = 30 } = {}) {
    return this._query(customerId, `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.ctr, metrics.average_cpc, metrics.conversions,
             metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date DURING LAST_${days}_DAYS
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 100
    `);
  }

  async getAdPerformance(customerId, { days = 30 } = {}) {
    return this._query(customerId, `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.name,
             ad_group_ad.ad.final_urls, ad_group_ad.ad.type,
             ad_group_ad.ad.responsive_search_ad.headlines,
             ad_group_ad.ad.responsive_search_ad.descriptions,
             metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros
      FROM ad_group_ad
      WHERE segments.date DURING LAST_${days}_DAYS
      ORDER BY metrics.impressions DESC
      LIMIT 50
    `);
  }

  async _mutate(customerId, resource, operations) {
    const creds = this._getConfig();
    const res = await safeFetch('google', `${BASE}/customers/${customerId}/${resource}:mutate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.oauth_token}`,
        'developer-token': creds.developer_token,
        'Content-Type': 'application/json',
        ...(creds.login_customer_id && { 'login-customer-id': creds.login_customer_id }),
      },
      body: JSON.stringify({ operations }),
    });
    return await res.json();
  }

  async createCampaign(customerId, { name, status = 'PAUSED', dailyBudgetMicros, advertisingChannelType = 'SEARCH' }) {
    this.log.info('Creating Google Ads campaign', { customerId, name });
    const result = await this._mutate(customerId, 'campaigns', [{
      create: {
        name,
        status,
        advertisingChannelType,
        campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
      },
    }]);
    this.log.info('Google Ads campaign created', { campaignId: result.results?.[0]?.resourceName });
    return { resourceName: result.results?.[0]?.resourceName };
  }

  async updateCampaign(customerId, campaignId, { name, status }) {
    this.log.info('Updating Google Ads campaign', { customerId, campaignId });
    const updateMask = [];
    const updateFields = {};
    if (name) { updateFields.name = name; updateMask.push('name'); }
    if (status) { updateFields.status = status; updateMask.push('status'); }

    const result = await this._mutate(customerId, 'campaigns', [{
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        ...updateFields,
      },
      updateMask: updateMask.join(','),
    }]);
    this.log.info('Google Ads campaign updated', { campaignId });
    return { resourceName: result.results?.[0]?.resourceName };
  }
}
