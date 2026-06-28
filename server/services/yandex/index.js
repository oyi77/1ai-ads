import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.direct.yandex.com/json/v5/campaigns';

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

  _headers(clientLogin) {
    const h = {
      'Authorization': `Bearer ${this._getToken()}`,
      'Accept-Language': 'en',
    };
    if (clientLogin) h['Client-Login'] = clientLogin;
    return h;
  }

  // Override: add Yandex-specific headers
  async _get(path, params = {}, clientLogin) {
    const url = new URL(path);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('yandex', url.toString(), {
      headers: this._headers(clientLogin),
    });
    const data = await res.json();
    return data;
  }

  // Override: add Yandex-specific headers
  async _post(path, body = {}, clientLogin) {
    const res = await safeFetch('yandex', path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers(clientLogin) },
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
    return this._post(`${BASE.replace('/campaigns', '')}/clients`, {
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
    return this._post(BASE, {
      method: 'get',
      params: {
        SelectionCriteria: {},
        FieldNames: ['Id', 'Name', 'StatusImpressions', 'DailyBudget', 'Type', 'State'],
      },
    }, accountId);
  }

  /**
   * Create a new campaign.
   * POST /campaigns with method add
   */
  async createCampaign(accountId, { name, budget, status = 'ON' }) {
    this.log.info('Creating Yandex campaign', { accountId, name });
    const campaign = {
      Name: name,
      StatusImpressions: status,
    };
    if (budget) {
      campaign.DailyBudget = { Amount: String(budget), Mode: 'STANDARD' };
    }
    const data = await this._post(BASE, {
      method: 'add',
      params: { Campaigns: [campaign] },
    }, accountId);
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
    if (status) update.StatusImpressions = status;

    await this._post(BASE, {
      method: 'update',
      params: { Campaigns: [update] },
    }, accountId);
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
      status: c.StatusImpressions ? c.StatusImpressions.toLowerCase() : 'unknown',
      dailyBudget: c.DailyBudget?.Amount,
      type: c.Type,
    };
  }
}
