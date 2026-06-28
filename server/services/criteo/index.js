import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.criteo.com/2024-01';

export class CriteoAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('criteo', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('criteo');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Criteo access token not configured. Go to Settings > Criteo to add it.'
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
    const res = await safeFetch('criteo', url.toString(), {
      headers: this._headers(),
    });
    return await res.json();
  }

  async _post(path, body = {}) {
    const res = await safeFetch('criteo', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List advertisers.
   * GET /advertisers/me
   */
  async getAdvertisers() {
    this.log.debug('Fetching Criteo advertisers');
    return this._get('/advertisers/me');
  }

  /** Alias — satisfies the platform interface contract. */
  async getAccounts() { return this.getAdvertisers(); }


  /**
   * List campaigns for an advertiser.
   * GET /advertisers/{advertiserId}/campaigns
   */
  async getCampaigns(advertiserId) {
    this.log.debug('Fetching Criteo campaigns', { advertiserId });
    return this._get(`/advertisers/${advertiserId}/campaigns`);
  }

  /**
   * Create a new campaign.
   * POST /advertisers/{advertiserId}/campaigns
   */
  async createCampaign(advertiserId, { name, budget, status }) {
    this.log.info('Creating Criteo campaign', { advertiserId, name });
    const body = { name };
    if (budget) body.budget = budget;
    if (status) body.status = status;

    const data = await this._post(`/advertisers/${advertiserId}/campaigns`, body);
    this.log.info('Criteo campaign created', { campaignId: data.id });
    return { campaignId: data.id };
  }

  /**
   * Update a campaign.
   * PUT /advertisers/{advertiserId}/campaigns/{campaignId}
   */
  async updateCampaign(advertiserId, campaignId, { name, status }) {
    this.log.info('Updating Criteo campaign', { campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    await this._post(`/advertisers/${advertiserId}/campaigns/${campaignId}`, body);
    this.log.info('Criteo campaign updated', { campaignId });
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
