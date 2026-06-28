import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError } from '../lib/errors.js';

const BASE = 'https://ads.line.me/api/v1';

export class LineAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('line', settingsRepo, { baseUrl: BASE });
  }

  // Override: LINE uses OAuth 2.0 Bearer token
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('line');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'LINE Ads access token not configured. Go to Settings > LINE to add it.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  // Override: add LINE-specific headers
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('line', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    return data;
  }

  // Override: add LINE-specific headers
  async _post(path, body = {}) {
    const res = await safeFetch('line', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List ad accounts.
   * GET /adaccounts
   */
  async getAccounts() {
    this.log.debug('Fetching LINE ad accounts');
    return this._get('/adaccounts');
  }

  /**
   * List campaigns for an account.
   * GET /adaccounts/{accountId}/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching LINE campaigns', { accountId });
    return this._get(`/adaccounts/${accountId}/campaigns`);
  }

  /**
   * Create a new campaign.
   * POST /adaccounts/{accountId}/campaigns
   */
  async createCampaign(accountId, { name, budget, status = 'PAUSED' }) {
    this.log.info('Creating LINE campaign', { accountId, name });
    const body = {
      name,
      status,
    };
    if (budget) {
      body.budget = { amount: budget };
    }
    const data = await this._post(`/adaccounts/${accountId}/campaigns`, body);
    const campaignId = data.campaign?.id;
    this.log.info('LINE campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * PUT /adaccounts/{accountId}/campaigns/{campaignId}
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating LINE campaign', { campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    const res = await safeFetch('line', `${this._baseUrl}/adaccounts/${accountId}/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    this.log.info('LINE campaign updated', { campaignId });
    return { campaignId, ...data };
  }

  /**
   * Sync all accounts: fetch campaigns per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
    const accounts = accountsResp.adAccounts || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.adAccountId);
      const campaigns = campaignsResp.campaigns || [];

      return {
        account: { id: account.adAccountId, name: account.name, currency: account.currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.adAccountId, name: account.name },
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
      dailyBudget: c.budget?.amount,
      type: c.objective,
    };
  }
}
