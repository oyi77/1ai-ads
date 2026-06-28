import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../../lib/errors.js';

/**
 * Reddit Ads API v3 client.
 * @see https://ads-api.reddit.com/docs/v3/
 */
const BASE = 'https://ads-api.reddit.com/api/v3';

export class RedditAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('reddit', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('reddit');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Reddit Ads access token not configured. Go to Settings > Reddit to add it.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
    };
  }

  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    const res = await safeFetch('reddit', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(`Reddit API error: ${data.error}`, 'reddit', data.error_code);
    }
    return data;
  }

  async _post(path, body = {}) {
    const res = await safeFetch('reddit', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(`Reddit API error: ${data.error}`, 'reddit', data.error_code);
    }
    return data;
  }

  async _patch(path, body = {}) {
    const res = await safeFetch('reddit', `${this._baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(`Reddit API error: ${data.error}`, 'reddit', data.error_code);
    }
    return data;
  }

  /**
   * List ad accounts for the authenticated user.
   * GET /ad_accounts
   */
  async getAccounts() {
    this.log.debug('Fetching Reddit ad accounts');
    const data = await this._get('/ad_accounts');
    return data.data || [];
  }

  /**
   * List campaigns for an ad account.
   * GET /ad_accounts/{accountId}/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Reddit campaigns', { accountId });
    const data = await this._get(`/ad_accounts/${accountId}/campaigns`);
    return data.data || [];
  }

  /**
   * Create a new campaign.
   * POST /ad_accounts/{accountId}/campaigns
   */
  async createCampaign(accountId, { name, budget, status = 'PAUSED' }) {
    this.log.info('Creating Reddit campaign', { accountId, name });
    const body = { name, status };
    if (budget !== undefined) {
      body.budget = budget;
    }
    const data = await this._post(`/ad_accounts/${accountId}/campaigns`, body);
    this.log.info('Reddit campaign created', { campaignId: data.data?.id });
    return { campaignId: data.data?.id };
  }

  /**
   * Update a campaign.
   * PATCH /ad_accounts/{accountId}/campaigns/{campaignId}
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Reddit campaign', { accountId, campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    await this._patch(`/ad_accounts/${accountId}/campaigns/${campaignId}`, body);
    this.log.info('Reddit campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all active accounts: fetch campaigns per account.
   * Returns standardized format matching other platforms.
   */
  async syncAllAccounts() {
    this.log.info('Starting Reddit ads sync');
    const accounts = await this.getAccounts();
    const results = [];

    for (const account of accounts) {
      try {
        const campaigns = await this.getCampaigns(account.id);

        results.push({
          account: { id: account.id, name: account.name, currency: account.currency },
          campaigns: campaigns.map(c => this._mapCampaign(c)),
          insights: [],
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account: { id: account.id, name: account.name },
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    this.log.info('Reddit ads sync complete', { accounts: results.length });
    return results;
  }

  _mapCampaign(c) {
    return {
      id: c.id,
      name: c.name,
      status: c.status ? c.status.toLowerCase() : 'unknown',
      budget: c.budget,
    };
  }
}
