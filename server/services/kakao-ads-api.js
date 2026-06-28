import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError } from '../lib/errors.js';

const BASE = 'https://bizapi.kakao.com';

export class KakaoAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('kakao', settingsRepo, { baseUrl: BASE });
  }

  // Override: Kakao uses OAuth 2.0 Bearer token
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('kakao');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Kakao Ads access token not configured. Go to Settings > Kakao to add it.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  // Override: add Kakao-specific headers
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('kakao', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    return data;
  }

  // Override: add Kakao-specific headers
  async _post(path, body = {}) {
    const res = await safeFetch('kakao', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List ad accounts.
   * GET /v1/ad_accounts
   */
  async getAccounts() {
    this.log.debug('Fetching Kakao ad accounts');
    return this._get('/v1/ad_accounts');
  }

  /**
   * List campaigns for an account.
   * GET /v1/ad_accounts/{accountId}/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Kakao campaigns', { accountId });
    return this._get(`/v1/ad_accounts/${accountId}/campaigns`);
  }

  /**
   * Create a new campaign.
   * POST /v1/ad_accounts/{accountId}/campaigns
   */
  async createCampaign(accountId, { name, budget, status = 'PAUSED' }) {
    this.log.info('Creating Kakao campaign', { accountId, name });
    const body = {
      name,
      status,
    };
    if (budget) {
      body.budget = { amount: budget };
    }
    const data = await this._post(`/v1/ad_accounts/${accountId}/campaigns`, body);
    const campaignId = data.id;
    this.log.info('Kakao campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * PUT /v1/ad_accounts/{accountId}/campaigns/{campaignId}
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Kakao campaign', { campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    const res = await safeFetch('kakao', `${this._baseUrl}/v1/ad_accounts/${accountId}/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    this.log.info('Kakao campaign updated', { campaignId });
    return { campaignId, ...data };
  }

  /**
   * Sync all accounts: fetch campaigns per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
    const accounts = accountsResp.ad_accounts || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.id);
      const campaigns = campaignsResp.campaigns || [];

      return {
        account: { id: account.id, name: account.name, currency: account.currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.id, name: account.name },
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
