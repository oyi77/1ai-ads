import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export class TikTokAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('tiktok', settingsRepo, { baseUrl: BASE });
  }

  // Override: TikTok uses Access-Token header, not Bearer
  _getToken() {
    const creds = this.settingsRepo.getCredentials('tiktok');
    if (!creds?.access_token) {
      throw new ConfigurationError('TikTok access token not configured. Go to Settings > TikTok to add it. Get one at business-api.tiktok.com/portal');
    }
    return creds.access_token;
  }

  // Override: TikTok returns data in nested { data: ... } structure
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('tiktok', url.toString(), {
      headers: { 'Access-Token': this._getToken() },
    });
    const data = await res.json();
    return data.data;
  }

  // Override: TikTok uses Access-Token header
  async _post(path, body = {}) {
    const res = await safeFetch('tiktok', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Access-Token': this._getToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data.data;
  }

  async syncAllAccounts(advertiserIds = []) {
    const results = [];

    for (const advertiserId of advertiserIds) {
      try {
        const campaignData = await this.getCampaigns(advertiserId);
        const campaigns = campaignData.list || [];
        
        let insights = [];
        if (campaigns.length > 0) {
          const campaignIds = campaigns.map(c => c.campaign_id);
          const insightData = await this.getCampaignInsights(advertiserId, campaignIds);
          insights = insightData.list || [];
        }

        results.push({
          account: { id: advertiserId, name: `TikTok Ads (${advertiserId})` },
          campaigns: campaigns.map(c => ({
            id: c.campaign_id,
            name: c.campaign_name,
            status: c.status.toLowerCase(),
            budget: parseFloat(c.budget || 0),
          })),
          insights: insights.map(i => ({
            campaign_id: i.dimensions.campaign_id,
            spend: parseFloat(i.metrics.spend || 0),
            impressions: parseInt(i.metrics.impressions || 0),
            clicks: parseInt(i.metrics.clicks || 0),
            conversions: parseInt(i.metrics.conversions || 0),
          })),
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account: { id: advertiserId, name: `TikTok Ads (${advertiserId})` },
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async getAdvertiserInfo(advertiserId) {
    return this._get('/advertiser/info/', { advertiser_ids: [advertiserId], fields: ['name', 'status', 'currency', 'balance'] });
  }

  async getCampaigns(advertiserId, { page = 1, pageSize = 50 } = {}) {
    this.log.debug('Fetching TikTok campaigns', { advertiserId, page });
    return this._get('/campaign/get/', {
      advertiser_id: advertiserId,
      page,
      page_size: pageSize,
      fields: ['campaign_id', 'campaign_name', 'objective_type', 'budget', 'status', 'create_time'],
    });
  }

  async getCampaignInsights(advertiserId, campaignIds, { startDate, endDate } = {}) {
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    return this._get('/report/integrated/get/', {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      dimensions: ['campaign_id'],
      data_level: 'AUCTION_CAMPAIGN',
      start_date: start,
      end_date: end,
      metrics: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'conversions', 'cost_per_conversion'],
      filters: [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify(campaignIds) }],
    });
  }

  async getAds(advertiserId, { page = 1, pageSize = 50 } = {}) {
    return this._get('/ad/get/', {
      advertiser_id: advertiserId,
      page,
      page_size: pageSize,
      fields: ['ad_id', 'ad_name', 'status', 'ad_text', 'image_ids', 'video_id', 'call_to_action'],
    });
  }

  async _post(path, body = {}) {
    const token = this._getToken();
    const res = await safeFetch('tiktok', `${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new PlatformError(`TikTok API error: ${data.message}`, 'tiktok');
    }
    return data.data;
  }

  async createCampaign(advertiserId, { name, objectiveType = 'CONVERSIONS', budget, status = 'DISABLE' }) {
    this.log.info('Creating TikTok campaign', { advertiserId, name });
    const data = await this._post('/campaign/create/', {
      advertiser_id: advertiserId,
      campaign_name: name,
      objective_type: objectiveType,
      budget: budget || 0,
      budget_mode: budget ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_INFINITE',
      status,
    });
    this.log.info('TikTok campaign created', { campaignId: data.campaign_id });
    return { campaignId: data.campaign_id };
  }

  async updateCampaign(advertiserId, campaignId, { name, status, budget }) {
    this.log.info('Updating TikTok campaign', { advertiserId, campaignId });
    const updateFields = { advertiser_id: advertiserId, campaign_ids: [campaignId] };
    if (name) updateFields.campaign_name = name;
    if (status) updateFields.status = status;
    if (budget !== undefined) updateFields.budget = budget;

    await this._post('/campaign/update/', updateFields);
    this.log.info('TikTok campaign updated', { campaignId });
    return { campaignId };
  }
}
