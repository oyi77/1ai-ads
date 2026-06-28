import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.direct.yandex.com/json/v5';

export class YandexAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('yandex', settingsRepo, { baseUrl: BASE });
  }

  // Override: Yandex uses OAuth 2.0 Bearer token
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('yandex');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Yandex Direct access token not configured. Go to Settings > Yandex to add it.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
      'Accept-Language': 'en',
    };
  }

  // Override: add Yandex-specific headers
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('yandex', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    return data;
  }

  // Override: add Yandex-specific headers
  async _post(path, body = {}) {
    const res = await safeFetch('yandex', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List ad accounts.
   * POST /clients with method get
   */
  async getAccounts() {
    this.log.debug('Fetching Yandex Direct accounts');
    return this._post('/clients', {
      method: 'get',
      params: { FieldNames: ['Login', 'ClientId', 'Currency', 'Role'] },
    });
  }

  /**
   * List campaigns for an account.
   * POST /campaigns with method get
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Yandex campaigns', { accountId });
    return this._post('/campaigns', {
      method: 'get',
      params: {
        SelectionCriteria: {},
        FieldNames: ['Id', 'Name', 'Status', 'DailyBudget', 'Type'],
      },
    });
  }

  /**
   * Create a new campaign.
   * POST /campaigns with method add
   */
  async createCampaign(accountId, { name, budget, status = 'OFF' }) {
    this.log.info('Creating Yandex campaign', { accountId, name });
    const campaign = {
      Name: name,
      Status: status,
    };
    if (budget) {
      campaign.DailyBudget = { Amount: budget.toString() };
    }
    const data = await this._post('/campaigns', {
      method: 'add',
      params: { Campaigns: [campaign] },
    });
    const campaignId = data.result?.AddResults?.[0]?.Id;
    this.log.info('Yandex campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * POST /campaigns with method update
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Yandex campaign', { campaignId });
    const update = { Id: campaignId };
    if (name) update.Name = name;
    if (status) update.Status = status;

    await this._post('/campaigns', {
      method: 'update',
      params: { Campaigns: [update] },
    });
    this.log.info('Yandex campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all accounts: fetch campaigns per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
    const accounts = accountsResp.result?.Clients || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.Login);
      const campaigns = campaignsResp.result?.Campaigns || [];

      return {
        account: { id: account.Login, name: account.Login, currency: account.Currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.Login, name: account.Login, currency: account.Currency },
        error: err.message,
        syncedAt: new Date().toISOString(),
      };
    }
  }

  _mapCampaign(c) {
    return {
      id: c.Id,
      name: c.Name,
      status: c.Status ? c.Status.toLowerCase() : 'unknown',
      dailyBudget: c.DailyBudget?.Amount,
      type: c.Type,
    };
  }
}
