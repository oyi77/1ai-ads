import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.searchads.apple.com/api/v5';

export class AppleAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('apple', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('apple');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Apple Search Ads access token not configured. Go to Settings > Apple to add it.'
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
    const res = await safeFetch('apple', url.toString(), {
      headers: this._headers(),
    });
    return await res.json();
  }

  async _post(path, body = {}) {
    const res = await safeFetch('apple', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List ad accounts (organizations).
   * GET /searchads/campaigns/find
   */
  async getAccounts() {
    this.log.debug('Fetching Apple Search Ads accounts');
    return this._get('/orgs');
  }

  /**
   * List campaigns for an organization.
   * POST /campaigns/find (selector-based query)
   */
  async getCampaigns(orgId) {
    this.log.debug('Fetching Apple campaigns', { orgId });
    return this._post('/campaigns/find', { conditions: [], paging: { offset: 0, limit: 100 } });
  }

  /**
   * Create a new campaign.
   * POST /campaigns
   */
  async createCampaign(orgId, { name, budget, countries }) {
    this.log.info('Creating Apple campaign', { orgId, name });
    const body = {
      orgId,
      campaign: { name },
    };
    if (budget) body.campaign.budget = budget;
    if (countries) body.campaign.countries = countries;

    const data = await this._post('/campaigns', body);
    this.log.info('Apple campaign created', { campaignId: data.data?.id });
    return { campaignId: data.data?.id };
  }

  /**
   * Update a campaign.
   * PUT /campaigns/{campaignId}
   */
  async updateCampaign(orgId, campaignId, { name, status }) {
    this.log.info('Updating Apple campaign', { campaignId });
    const body = { id: campaignId };
    if (name) body.name = name;
    if (status) body.status = status;

    const res = await safeFetch('apple', `${BASE}/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    await res.json();
    this.log.info('Apple campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all organizations: fetch campaigns per org.
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
      countries: c.countries,
    };
  }
}
