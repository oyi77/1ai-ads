import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('tiktok-ads-api');

export class TikTokAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken, options = {}) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('tiktok', settingsRepo, { baseUrl: 'https://business-api.tiktok.com/open_api/v1.3' });
    
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
    
    this.appId = options.appId || '';
    this.secret = options.secret || '';
    this.advertiserId = options.advertiserId || '';
  }

  static withToken(token, options = {}) {
    return new TikTokAdsAPI(token, options);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('tiktok');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('TikTok Ads access token not configured. Connect a TikTok account in Settings.');
  }

  _tiktokHeaders() {
    return {
      'Access-Token': this._getToken(),
      'Content-Type': 'application/json',
    };
  }

  async _request(method, path, params = {}, body = null) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this._tiktokHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`TikTok API error ${response.status}: ${error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`TikTok API error: ${data.message || 'Unknown error'}`);
      }
      
      return data.data;
    } catch (err) {
      log.error('TikTok API request failed', { error: err.message, path });
      throw err;
    }
  }

  async getAdAccounts() {
    try {
      const data = await this._request('GET', '/advertiser/info/', {
        app_id: this.appId,
        secret: this.secret,
      });

      return (data?.list || []).map(item => ({
        id: item.advertiser_id,
        name: item.advertiser_name,
        company: item.company,
        status: item.status,
        currency: item.currency,
        timezone: item.timezone,
      }));
    } catch (err) {
      log.error('Failed to list TikTok advertisers', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  async getCampaigns(advertiserId, { limit = 50, status = null } = {}) {
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        page: 1,
        page_size: limit,
      };
      
      if (status) {
        params.filtering = JSON.stringify({ status: [status] });
      }

      const data = await this._request('GET', '/campaign/get/', params);
      
      return (data?.list || []).map(row => ({
        id: row.campaign_id,
        name: row.campaign_name,
        status: this._mapStatus(row.status),
        budget: row.budget || 0,
        objective: row.objective,
        created_time: row.create_time,
        modified_time: row.modify_time,
      }));
    } catch (err) {
      log.error('Failed to get TikTok campaigns', { error: err.message });
      return [];
    }
  }

  async getAdGroups(advertiserId, campaignId, { limit = 50 } = {}) {
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        page: 1,
        page_size: limit,
      };
      
      if (campaignId) {
        params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
      }

      const data = await this._request('GET', '/adgroup/get/', params);
      
      return (data?.list || []).map(row => ({
        id: row.adgroup_id,
        name: row.adgroup_name,
        status: this._mapStatus(row.status),
        budget: row.budget || 0,
        campaign_id: row.campaign_id,
        created_time: row.create_time,
      }));
    } catch (err) {
      log.error('Failed to get TikTok ad groups', { error: err.message });
      return [];
    }
  }

  async getAds(advertiserId, adgroupId, { limit = 50 } = {}) {
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        page: 1,
        page_size: limit,
      };
      
      if (adgroupId) {
        params.filtering = JSON.stringify({ adgroup_ids: [adgroupId] });
      }

      const data = await this._request('GET', '/ad/get/', params);
      
      return (data?.list || []).map(row => ({
        id: row.ad_id,
        name: row.ad_name,
        status: this._mapStatus(row.status),
        adgroup_id: row.adgroup_id,
        created_time: row.create_time,
      }));
    } catch (err) {
      log.error('Failed to get TikTok ads', { error: err.message });
      return [];
    }
  }

  async getCampaignInsights(advertiserId, campaignId, { startDate, endDate } = {}) {
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        service_type: 'AUCTION',
        report_type: 'BASIC',
        data_dimensions: ['campaign_id', 'stat_time_day'],
        metrics: [
          'campaign_name', 'spend', 'impressions', 'clicks', 'cost_per_click',
          'cpc', 'ctr', 'reach', 'cost_per_1k_reached', 'conversion',
          'cost_per_conversion', 'conversion_rate', 'real_time_conversion',
          'real_time_cost_per_conversion', 'real_time_conversion_rate', 'result',
          'cost_per_result', 'result_rate', 'real_time_result', 'real_time_cost_per_result',
          'real_time_result_rate', 'video_play_actions', 'video_watched_2s',
          'video_watched_6s', 'average_video_play', 'video_views_p25', 'video_views_p50',
          'video_views_p75', 'video_views_p100', 'profile_visits', 'likes', 'comments',
          'shares', 'follows', 'clicks_on_card', 'clicks_on_download_buttons',
        ],
        page: 1,
        page_size: 1000,
      };

      if (startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      if (campaignId) {
        params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
      }

      const data = await this._request('GET', '/reports/integrated/get/', params);
      
      if (!data?.list || data.list.length === 0) return null;
      
      const row = data.list[0];
      return {
        campaignId: row.dimensions?.campaign_id,
        campaignName: row.dimensions?.campaign_name,
        impressions: parseInt(row.metrics?.impressions) || 0,
        clicks: parseInt(row.metrics?.clicks) || 0,
        spend: parseFloat(row.metrics?.spend) || 0,
        ctr: parseFloat(row.metrics?.ctr) || 0,
        cpc: parseFloat(row.metrics?.cpc) || 0,
        reach: parseInt(row.metrics?.reach) || 0,
        conversion: parseInt(row.metrics?.conversion) || 0,
        conversionRate: parseFloat(row.metrics?.conversion_rate) || 0,
        costPerConversion: parseFloat(row.metrics?.cost_per_conversion) || 0,
        videoViews: parseInt(row.metrics?.video_play_actions) || 0,
        likes: parseInt(row.metrics?.likes) || 0,
        comments: parseInt(row.metrics?.comments) || 0,
        shares: parseInt(row.metrics?.shares) || 0,
      };
    } catch (err) {
      log.error('Failed to get TikTok campaign insights', { error: err.message });
      return null;
    }
  }

  async getMultiCampaignInsights(advertiserId, campaignIds, { startDate, endDate } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        service_type: 'AUCTION',
        report_type: 'BASIC',
        data_dimensions: ['campaign_id', 'stat_time_day'],
        metrics: ['campaign_name', 'spend', 'impressions', 'clicks', 'cost_per_click', 'cpc', 'ctr', 'reach', 'conversion', 'conversion_rate'],
        filtering: JSON.stringify({ campaign_ids: campaignIds }),
        page: 1,
        page_size: 1000,
      };

      if (startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      const data = await this._request('GET', '/reports/integrated/get/', params);
      
      const insights = {};
      for (const row of data?.list || []) {
        const id = row.dimensions?.campaign_id;
        insights[id] = {
          campaignId: id,
          campaignName: row.dimensions?.campaign_name,
          impressions: parseInt(row.metrics?.impressions) || 0,
          clicks: parseInt(row.metrics?.clicks) || 0,
          spend: parseFloat(row.metrics?.spend) || 0,
          ctr: parseFloat(row.metrics?.ctr) || 0,
          cpc: parseFloat(row.metrics?.cpc) || 0,
          reach: parseInt(row.metrics?.reach) || 0,
          conversion: parseInt(row.metrics?.conversion) || 0,
          conversionRate: parseFloat(row.metrics?.conversion_rate) || 0,
        };
      }
      
      return insights;
    } catch (err) {
      log.error('Failed to get TikTok multi-campaign insights', { error: err.message });
      return {};
    }
  }

  async getAccountInsights(advertiserId, { startDate, endDate } = {}) {
    try {
      const params = {
        advertiser_id: advertiserId || this.advertiserId,
        service_type: 'AUCTION',
        report_type: 'BASIC',
        data_dimensions: ['advertiser_id', 'stat_time_day'],
        metrics: ['spend', 'impressions', 'clicks', 'cost_per_click', 'cpc', 'ctr', 'reach', 'conversion', 'conversion_rate'],
        page: 1,
        page_size: 1000,
      };

      if (startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      const data = await this._request('GET', '/reports/integrated/get/', params);
      
      if (!data?.list || data.list.length === 0) return null;
      
      const row = data.list[0];
      return {
        advertiserId: row.dimensions?.advertiser_id,
        impressions: parseInt(row.metrics?.impressions) || 0,
        clicks: parseInt(row.metrics?.clicks) || 0,
        spend: parseFloat(row.metrics?.spend) || 0,
        ctr: parseFloat(row.metrics?.ctr) || 0,
        cpc: parseFloat(row.metrics?.cpc) || 0,
        reach: parseInt(row.metrics?.reach) || 0,
        conversion: parseInt(row.metrics?.conversion) || 0,
        conversionRate: parseFloat(row.metrics?.conversion_rate) || 0,
      };
    } catch (err) {
      log.error('Failed to get TikTok account insights', { error: err.message });
      return null;
    }
  }

  async updateCampaign(advertiserId, campaignId, { status, budget } = {}) {
    try {
      const body = {
        advertiser_id: advertiserId || this.advertiserId,
        campaign_id: campaignId,
      };
      
      if (status) {
        body.operation_status = this._reverseMapStatus(status);
      }
      
      if (budget !== undefined) {
        body.budget = budget;
      }

      const data = await this._request('POST', '/campaign/update/', {}, body);
      
      log.info('TikTok campaign updated', { advertiserId, campaignId, status, budget });
      
      return {
        id: campaignId,
        updated: true,
        data,
      };
    } catch (err) {
      log.error('Failed to update TikTok campaign', { error: err.message, campaignId });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  async createCampaign(advertiserId, data = {}) {
    try {
      const body = {
        advertiser_id: advertiserId || this.advertiserId,
        campaign_name: data.name || `Campaign ${Date.now()}`,
        objective_type: data.objective || 'TRAFFIC',
        budget_mode: 'BUDGET_MODE_DAY',
        budget: data.budget || 10,
        operation_status: 'ENABLE',
      };

      const result = await this._request('POST', '/campaign/create/', {}, body);
      
      log.info('TikTok campaign created', { advertiserId, campaignId: result?.campaign_id });
      
      return {
        campaignId: result?.campaign_id,
        name: body.campaign_name,
        status: 'active',
      };
    } catch (err) {
      log.error('Failed to create TikTok campaign', { error: err.message });
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
      
      log.info('TikTok sync complete', { accounts: synced.length });
      return synced;
    } catch (err) {
      log.error('Failed to sync TikTok accounts', { error: err.message });
      return [];
    }
  }

  _mapStatus(tiktokStatus) {
    const statusMap = {
      'ENABLE': 'active',
      'DISABLE': 'paused',
      'DELETE': 'removed',
      'CAMPAIGN_STATUS_ENABLE': 'active',
      'CAMPAIGN_STATUS_DISABLE': 'paused',
      'CAMPAIGN_STATUS_DELETE': 'removed',
    };
    return statusMap[tiktokStatus] || tiktokStatus?.toLowerCase() || 'unknown';
  }

  _reverseMapStatus(status) {
    const statusMap = {
      'active': 'ENABLE',
      'paused': 'DISABLE',
      'removed': 'DELETE',
    };
    return statusMap[status] || 'DISABLE';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''} ${err?.error?.message || ''}`.toLowerCase();
    return (
      err?.code === 401 ||
      err?.code === 403 ||
      msg.includes('unauthorized') ||
      msg.includes('invalid credentials') ||
      msg.includes('token expired') ||
      msg.includes('authentication failed') ||
      msg.includes('access token is invalid')
    );
  }
}

export default TikTokAdsAPI;
