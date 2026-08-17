import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.baidu.com/json/sms/service';

export class BaiduAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('baidu', settingsRepo, { baseUrl: BASE });
  }

  // Override: Baidu uses OAuth 2.0 Bearer token
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('baidu');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Baidu Ads access token not configured. Go to Settings > Baidu to add it.'
    );
  }

  _headers() {
    return {
      'Content-Type': 'application/json;charset=UTF-8',
    };
  }

  // Override: add Baidu-specific headers
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('baidu', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    return data;
  }

  // Override: add Baidu-specific headers
  async _post(path, body = {}) {
    const res = await safeFetch('baidu', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List ad accounts.
   * POST /AccountService/getAccountInfo
   */
  async getAccounts() {
    this.log.debug('Fetching Baidu ad accounts');
    return this._post('/AccountService/getAccountInfo', {
      header: { username: '', token: this._getToken(), level: 0 },
    });
  }

  /**
   * List campaigns for an account.
   * POST /CampaignService/getCampaignByPage
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Baidu campaigns', { accountId });
    return this._post('/CampaignService/getCampaignByPage', {
      header: { username: accountId, token: this._getToken(), level: 0 },
      body: {
        getCampaignByPageRequest: {
          paging: { start: 0, num: 100 },
        },
      },
    });
  }

  /**
   * Create a new campaign.
   * POST /CampaignService/addCampaign
   */
  async createCampaign(accountId, { name, budget, status = 'PAUSE' }) {
    this.log.info('Creating Baidu campaign', { accountId, name });
    const campaign = {
      campaignName: name,
      budget: budget ? { budget: budget.toString(), showOnProduct: 'SHOW_ON_SEM' } : undefined,
      status,
    };
    const data = await this._post('/CampaignService/addCampaign', {
      header: { username: accountId, token: this._getToken(), level: 0 },
      body: { addCampaignRequest: { campaignTypes: [campaign] } },
    });
    const campaignId = data.body?.data?.[0]?.campaignId;
    this.log.info('Baidu campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * POST /CampaignService/updateCampaign
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Baidu campaign', { campaignId });
    const update = { campaignId };
    if (name) update.campaignName = name;
    if (status) update.status = status;

    await this._post('/CampaignService/updateCampaign', {
      header: { username: accountId, token: this._getToken(), level: 0 },
      body: { updateCampaignRequest: { campaignTypes: [update] } },
    });
    this.log.info('Baidu campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all accounts: fetch campaigns per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
    const accounts = accountsResp.body?.data || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.userName || account.userId);
      const campaigns = campaignsResp.body?.data?.listData || [];

      return {
        account: { id: account.userId, name: account.userName, currency: account.currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.userId, name: account.userName },
        error: err.message,
        syncedAt: new Date().toISOString(),
      };
    }
  }

  _mapCampaign(c) {
    return {
      id: c.campaignId,
      name: c.campaignName,
      status: c.status ? c.status.toLowerCase() : 'unknown',
      dailyBudget: c.budget?.budget,
      type: c.campaignType,
    };
  }
}
