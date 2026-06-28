import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.taboola.com/1.2';

export class TaboolaAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('taboola', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('taboola');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Taboola access token not configured. Go to Settings > Taboola to add it.'
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
    const res = await safeFetch('taboola', url.toString(), {
      headers: this._headers(),
    });
    return await res.json();
  }

  async _post(path, body = {}) {
    const res = await safeFetch('taboola', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List accounts.
   * GET /users/current
   */
  async getAccounts() {
    this.log.debug('Fetching Taboola accounts');
    return this._get('/users/current');
  }

  /**
   * List campaigns for an account.
   * GET /accounts/{accountId}/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Taboola campaigns', { accountId });
    return this._get(`/accounts/${accountId}/campaigns`);
  }

  /**
   * Create a new campaign.
   * POST /accounts/{accountId}/campaigns
   */
  async createCampaign(accountId, { name, budget, status }) {
    this.log.info('Creating Taboola campaign', { accountId, name });
    const body = { name };
    if (budget) body.budget = budget;
    if (status) body.status = status;

    const data = await this._post(`/accounts/${accountId}/campaigns`, body);
    this.log.info('Taboola campaign created', { campaignId: data.id });
    return { campaignId: data.id };
  }

  /**
   * Update a campaign.
   * PUT /accounts/{accountId}/campaigns/{campaignId}
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Taboola campaign', { campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    await this._post(`/accounts/${accountId}/campaigns/${campaignId}`, body);
    this.log.info('Taboola campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all accounts: fetch campaigns per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
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
      const campaigns = campaignsResp.results || [];

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
