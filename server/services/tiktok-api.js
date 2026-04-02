/**
 * TikTok Marketing API client.
 * Base URL: https://business-api.tiktok.com/open_api/v1.3
 * Auth: Access token from TikTok Business Center
 * Docs: https://business-api.tiktok.com/portal/docs
 *
 * Free to use - you only pay for ad spend.
 * Requires: TikTok Business account + approved app.
 */

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export class TikTokAdsAPI {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  _getToken() {
    const creds = this.settingsRepo.getCredentials('tiktok');
    if (!creds?.access_token) {
      throw new Error('TikTok access token not configured. Go to Settings > TikTok to add it. Get one at business-api.tiktok.com/portal');
    }
    return creds.access_token;
  }

  async _get(path, params = {}) {
    const token = this._getToken();
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { 'Access-Token': token },
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`TikTok API: ${data.message}`);
    return data.data;
  }

  async getAdvertiserInfo(advertiserId) {
    return this._get('/advertiser/info/', { advertiser_ids: [advertiserId], fields: ['name', 'status', 'currency', 'balance'] });
  }

  async getCampaigns(advertiserId, { page = 1, pageSize = 50 } = {}) {
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
}
