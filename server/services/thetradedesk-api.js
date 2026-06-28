import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError } from '../lib/errors.js';

const BASE = 'https://api.thedesk.com/v3';

export class TheTradeDeskAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('thetradedesk', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('thetradedesk');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'The Trade Desk access token not configured. Go to Settings > The Trade Desk to add it.'
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
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('thetradedesk', url.toString(), {
      headers: this._headers(),
    });
    return await res.json();
  }

  async _post(path, body = {}) {
    const res = await safeFetch('thetradedesk', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List advertisers.
   * GET /advertisers
   */
  async getAdvertisers() {
    this.log.debug('Fetching The Trade Desk advertisers');
    return this._get('/advertisers');
  }

  /**
   * List campaigns for an advertiser.
   * GET /campaigns/query
   */
  async getCampaigns(advertiserId) {
    this.log.debug('Fetching The Trade Desk campaigns', { advertiserId });
    return this._get('/campaigns/query', { advertiserId });
  }

  /**
   * Create a new campaign.
   * POST /campaigns
   */
  async createCampaign(advertiserId, { name, budget, status }) {
    this.log.info('Creating The Trade Desk campaign', { advertiserId, name });
    const body = { advertiserId, name };
    if (budget) body.budget = budget;
    if (status) body.status = status;

    const data = await this._post('/campaigns', body);
    this.log.info('The Trade Desk campaign created', { campaignId: data.id });
    return { campaignId: data.id };
  }

  /**
   * Update a campaign.
   * PUT /campaigns/{campaignId}
   */
  async updateCampaign(advertiserId, campaignId, { name, status }) {
    this.log.info('Updating The Trade Desk campaign', { campaignId });
    const body = { advertiserId };
    if (name) body.name = name;
    if (status) body.status = status;

    await this._post(`/campaigns/${campaignId}`, body);
    this.log.info('The Trade Desk campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all advertisers: fetch campaigns per advertiser.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAdvertisers();
    const accounts = accountsResp.data || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.id);
      const campaigns = campaignsResp.data || [];

      return {
        account: { id: account.id, name: account.name, currency: account.currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.id, name: account.name, currency: account.currency },
        error: err.message,
        syncedAt: new Date().toISOString(),
      };
    }
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
