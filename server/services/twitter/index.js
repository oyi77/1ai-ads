import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../../lib/errors.js';

export class TwitterAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('twitter', settingsRepo, { baseUrl: 'https://ads-api.twitter.com/12' });
  }
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('twitter');
      if (!creds?.access_token) {
        throw new ConfigurationError(
          'Twitter/X access token not configured. Go to Settings > Twitter to add it. Create one at developer.twitter.com'
        );
      }
      return creds.access_token;
    }
    throw new ConfigurationError(
      'Twitter/X access token not configured. Go to Settings > Twitter to add it. Create one at developer.twitter.com'
    );
  }

  // Override: Twitter wraps responses in { data: [...], next_cursor: ... }
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    const res = await safeFetch('twitter', url.toString(), {
      headers: { Authorization: `Bearer ${this._getToken()}` },
    });
    const body = await res.json();
    if (body.errors?.length) {
      throw new PlatformError(
        `Twitter API error: ${body.errors.map(e => e.message).join(', ')}`,
        'twitter',
        body.errors[0]?.code
      );
    }
    return body.data ?? body;
  }

  async _post(path, body = {}) {
    const res = await safeFetch('twitter', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.errors?.length) {
      throw new PlatformError(
        `Twitter API error: ${data.errors.map(e => e.message).join(', ')}`,
        'twitter',
        data.errors[0]?.code
      );
    }
    return data.data ?? data;
  }

  async _put(path, body = {}) {
    const res = await safeFetch('twitter', `${this._baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this._getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.errors?.length) {
      throw new PlatformError(
        `Twitter API error: ${data.errors.map(e => e.message).join(', ')}`,
        'twitter',
        data.errors[0]?.code
      );
    }
    return data.data ?? data;
  }

  async getAccounts() {
    this.log.debug('Fetching Twitter ads accounts');
    const data = await this._get('/accounts');
    const accounts = Array.isArray(data) ? data : [];
    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      business_name: a.business_name,
      currency: a.currency,
      timezone: a.timezone,
    }));
  }

  async getCampaigns(accountId, { cursor, count = 200 } = {}) {
    this.log.debug('Fetching Twitter campaigns', { accountId });
    const params = { count };
    if (cursor) params.cursor = cursor;
    const data = await this._get(`/accounts/${accountId}/campaigns`, params);
    const campaigns = Array.isArray(data) ? data : [];
    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      funding_instrument_id: c.funding_instrument_id,
      daily_budget_amount_local: c.daily_budget_amount_local,
      entity_status: c.entity_status,
      started_at: c.started_at,
      ended_at: c.ended_at,
    }));
  }

  async getCampaignStats(accountId, { campaignIds, startDate, endDate, granularity = 'TOTAL' } = {}) {
    this.log.debug('Fetching Twitter campaign stats', { accountId });
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    const params = {
      metric_groups: 'ENGAGEMENT',
      start_time: start,
      end_time: end,
      granularity,
      placement: 'ALL_ON_TWITTER',
    };
    if (campaignIds?.length) {
      params.entity_ids = campaignIds.join(',');
    }

    const data = await this._get(`/stats/accounts/${accountId}/campaigns`, params);
    const results = Array.isArray(data) ? data : [];
    return results.map(r => ({
      id: r.id,
      impressions: parseInt(r.impressions || 0),
      clicks: parseInt(r.clicks || 0),
      spend: parseFloat(r.spend_local_micro || 0) / 1_000_000,
      conversions: parseInt(r.conversions || 0),
      follows: parseInt(r.follows || 0),
      impressions_organic: parseInt(r.impressions_organic || 0),
      billed_charge_local_micro: parseFloat(r.billed_charge_local_micro || 0) / 1_000_000,
    }));
  }

  async getLineItems(accountId, campaignId) {
    this.log.debug('Fetching Twitter line items', { accountId, campaignId });
    const params = {};
    if (campaignId) params.campaign_ids = campaignId;
    const data = await this._get(`/accounts/${accountId}/line_items`, params);
    return Array.isArray(data) ? data : [];
  }

  async createCampaign(accountId, { name, fundingInstrumentId, dailyBudget, status = 'ACTIVE', startedAt }) {
    this.log.info('Creating Twitter campaign', { accountId, name });
    const body = {
      name,
      entity_status: status,
    };
    if (fundingInstrumentId) body.funding_instrument_id = fundingInstrumentId;
    if (dailyBudget !== undefined) body.daily_budget_amount_local = String(dailyBudget);
    if (startedAt) body.started_at = startedAt;

    const data = await this._post(`/accounts/${accountId}/campaigns`, body);
    this.log.info('Twitter campaign created', { campaignId: data.id });
    return { campaignId: data.id, name: data.name, entity_status: data.entity_status };
  }

  async updateCampaign(accountId, campaignId, { name, status, dailyBudget }) {
    this.log.info('Updating Twitter campaign', { accountId, campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.entity_status = status;
    if (dailyBudget !== undefined) body.daily_budget_amount_local = String(dailyBudget);

    const data = await this._put(`/accounts/${accountId}/campaigns/${campaignId}`, body);
    this.log.info('Twitter campaign updated', { campaignId });
    return { campaignId: data.id, name: data.name, entity_status: data.entity_status };
  }

  async getTargetingCriteria(accountId) {
    this.log.debug('Fetching Twitter targeting criteria', { accountId });
    const data = await this._get('/targeting_criteria', { account_id: accountId });
    return Array.isArray(data) ? data : [];
  }

  async syncAllAccounts() {
    this.log.info('Starting Twitter ads sync');
    const accounts = await this.getAccounts();
    const results = [];

    for (const account of accounts) {
      try {
        const campaigns = await this.getCampaigns(account.id);
        let insights = [];
        if (campaigns.length > 0) {
          const campaignIds = campaigns.map(c => c.id);
          insights = await this.getCampaignStats(account.id, { campaignIds });
        }

        results.push({
          account,
          campaigns,
          insights,
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account,
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    this.log.info('Twitter ads sync complete', { accounts: results.length });
    return results;
  }
}
