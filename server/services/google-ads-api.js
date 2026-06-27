import GoogleAdsApi from 'google-ads-api';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError } from '../lib/errors.js';

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

  _initClient() {
    const cfg = this._getConfig();
    return new GoogleAdsApi({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      developer_token: cfg.developer_token,
    });
  }

  _getCustomer(customerId) {
    const cfg = this._getConfig();
    const client = this._initClient();
    return client.Customer({
      refresh_token: cfg.oauth_token,
      customer_id: customerId,
      ...(cfg.login_customer_id && { login_customer_id: cfg.login_customer_id }),
    });
  }

  async _query(customerId, gaql) {
    const customer = this._getCustomer(customerId);
    return customer.query(gaql);
  }

  async listAccounts() {
    const creds = this._getConfig();
    const client = this._initClient();
    const response = await client.listAccessibleCustomers(creds.oauth_token);
    return (response.resource_names || []).map(r => r.replace('customers/', ''));
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

  async createCampaign(customerId, { name, status = 'PAUSED', dailyBudgetMicros: _dailyBudgetMicros, advertisingChannelType = 'SEARCH' }) {
    this.log.info('Creating Google Ads campaign', { customerId, name });
    const customer = this._getCustomer(customerId);
    const response = await customer.campaigns.create([{
      name,
      status,
      advertising_channel_type: advertisingChannelType,
      campaign_budget: `customers/${customerId}/campaignBudgets/-1`,
    }]);
    this.log.info('Google Ads campaign created', { campaignId: response.results?.[0]?.resource_name });
    return { resourceName: response.results?.[0]?.resource_name };
  }

  async updateCampaign(customerId, campaignId, { name, status }) {
    this.log.info('Updating Google Ads campaign', { customerId, campaignId });
    const customer = this._getCustomer(customerId);
    const campaign = { resource_name: `customers/${customerId}/campaigns/${campaignId}` };
    if (name) campaign.name = name;
    if (status) campaign.status = status;

    const response = await customer.campaigns.update([campaign]);
    this.log.info('Google Ads campaign updated', { campaignId });
    return { resourceName: response.results?.[0]?.resource_name };
  }
}
