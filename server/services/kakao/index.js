import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://apis.moment.kakao.com';

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

  _headers(adAccountId) {
    const h = {
      'Authorization': `Bearer ${this._getToken()}`,
      'Content-Type': 'application/json',
    };
    if (adAccountId) h['adAccountId'] = adAccountId;
    return h;
  }

  // Override: add Kakao-specific headers
  async _get(path, params = {}, adAccountId) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('kakao', url.toString(), {
      headers: this._headers(adAccountId),
    });
    const data = await res.json();
    return data;
  }

  // Override: add Kakao-specific headers
  async _post(path, body = {}, adAccountId) {
    const res = await safeFetch('kakao', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(adAccountId),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List ad accounts.
   * GET /openapi/v4/campaigns
   */
  async getAccounts() {
    this.log.debug('Fetching Kakao ad accounts');
    return this._get('/openapi/v4/campaigns');
  }
  /**
   * List campaigns for an account.
   * GET /openapi/v4/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Kakao campaigns', { accountId });
    return this._get('/openapi/v4/campaigns', {}, accountId);
  }

  /**
   * Create a new campaign.
   * POST /openapi/v4/campaigns
   */
  async createCampaign(accountId, { name, budget, status = 'ON' }) {
    this.log.info('Creating Kakao campaign', { accountId, name });
    const body = {
      name,
      status,
    };
    if (budget) {
      body.budget = { amount: budget };
    }
    const data = await this._post('/openapi/v4/campaigns', body, accountId);
    const campaignId = data.id;
    this.log.info('Kakao campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * PUT /openapi/v4/campaigns
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Kakao campaign', { campaignId });
    const body = { id: campaignId };
    if (name) body.name = name;
    if (status) body.status = status;

    const res = await safeFetch('kakao', `${this._baseUrl}/openapi/v4/campaigns`, {
      method: 'PUT',
      headers: this._headers(accountId),
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
