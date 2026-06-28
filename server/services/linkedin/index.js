import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://api.linkedin.com/rest';

export class LinkedInAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('linkedin', settingsRepo, { baseUrl: BASE });
  }

  // Override: LinkedIn uses OAuth 2.0 Bearer token + version headers
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('linkedin');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'LinkedIn access token not configured. Go to Settings > LinkedIn to add it. Get one at linkedin.com/developers.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  // Override: add LinkedIn-specific headers
  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('linkedin', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    return data;
  }

  // Override: add LinkedIn-specific headers
  async _post(path, body = {}) {
    const res = await safeFetch('linkedin', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data;
  }

  /**
   * List active ad accounts.
   * GET /adAccounts?q=search&search=(status:(values:ACTIVE))&fields=id,name,status,type,currency
   */
  async getAccounts() {
    this.log.debug('Fetching LinkedIn ad accounts');
    return this._get('/adAccounts', {
      q: 'search',
      search: '(status:(values:ACTIVE))',
      fields: 'id,name,status,type,currency',
    });
  }

  /**
   * List campaigns for an ad account.
   * GET /adCampaigns?q=account&account=urn:li:sponsoredAccount:{accountId}&fields=...
   */
  async getCampaigns(accountId, { start = 0, count = 100 } = {}) {
    this.log.debug('Fetching LinkedIn campaigns', { accountId });
    return this._get('/adCampaigns', {
      q: 'account',
      account: `urn:li:sponsoredAccount:${accountId}`,
      fields: 'id,name,status,dailyBudget,type,runSchedule',
      start,
      count,
    });
  }

  /**
   * Get campaign-level analytics.
   * GET /adAnalytics?q=analytics&pivot=CAMPAIGN&dateRange=...&timeGranularity=ALL&campaigns=List(...)&fields=...
   */
  async getCampaignAnalytics(accountId, { startDate, endDate, campaignIds } = {}) {
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 86400000);

    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : now;

    const dateRange = `(start:(year:${start.getUTCFullYear()},month:${start.getUTCMonth() + 1},day:${start.getUTCDate()}),end:(year:${end.getUTCFullYear()},month:${end.getUTCMonth() + 1},day:${end.getUTCDate()}))`;

    const params = {
      q: 'analytics',
      pivot: 'CAMPAIGN',
      dateRange,
      timeGranularity: 'ALL',
      fields: 'impressions,clicks,costInLocalCurrency,conversions,conversionValueInLocalCurrency,ctr,cpc',
    };

    if (campaignIds && campaignIds.length > 0) {
      params.campaigns = `List(${campaignIds.map(id => `urn:li:sponsoredCampaign:${id}`).join(',')})`;
    }

    this.log.debug('Fetching LinkedIn campaign analytics', { accountId, dateRange });
    return this._get('/adAnalytics', params);
  }

  /**
   * Create a new campaign.
   * POST /adCampaigns
   */
  async createCampaign(accountId, { name, status = 'PAUSED', type = 'SPONSORED_UPDATES', dailyBudget, runSchedule }) {
    this.log.info('Creating LinkedIn campaign', { accountId, name });
    const body = {
      account: `urn:li:sponsoredAccount:${accountId}`,
      name,
      status,
      type,
    };
    if (dailyBudget) {
      body.dailyBudget = dailyBudget;
    }
    if (runSchedule) {
      body.runSchedule = runSchedule;
    }
    const data = await this._post('/adCampaigns', body);
    this.log.info('LinkedIn campaign created', { campaignId: data.id });
    return { campaignId: data.id };
  }

  /**
   * Update a campaign using PATCH semantics.
   * POST /adCampaigns/{campaignId} with patch operator
   */
  async updateCampaign(campaignId, { name, status, dailyBudget, runSchedule }) {
    this.log.info('Updating LinkedIn campaign', { campaignId });
    const body = {
      patch: {
        $set: {},
      },
    };
    if (name) body.patch.$set.name = name;
    if (status) body.patch.$set.status = status;
    if (dailyBudget) body.patch.$set.dailyBudget = dailyBudget;
    if (runSchedule) body.patch.$set.runSchedule = runSchedule;

    await this._post(`/adCampaigns/${campaignId}`, body);
    this.log.info('LinkedIn campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * List ad creatives for an account.
   * GET /adCreatives?q=account&account=urn:li:sponsoredAccount:{accountId}
   */
  async getAdCreatives(accountId) {
    this.log.debug('Fetching LinkedIn ad creatives', { accountId });
    return this._get('/adCreatives', {
      q: 'account',
      account: `urn:li:sponsoredAccount:${accountId}`,
    });
  }

  /**
   * List audiences for an account.
   * GET /adAudiences?q=account&account=urn:li:sponsoredAccount:{accountId}
   */
  async getAudiences(accountId) {
    this.log.debug('Fetching LinkedIn audiences', { accountId });
    return this._get('/adAudiences', {
      q: 'account',
      account: `urn:li:sponsoredAccount:${accountId}`,
    });
  }

  /**
   * Sync all active accounts: fetch campaigns + analytics per account.
   * Returns standardized format matching Meta/Google/TikTok pattern.
   */
  async syncAllAccounts() {
    const accountsResp = await this.getAccounts();
    const accounts = accountsResp.elements || [];
    const results = [];

    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }

    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaignsResp = await this.getCampaigns(account.id);
      const campaigns = campaignsResp.elements || [];

      const campaignIds = campaigns.map(c => c.id);
      let insights = [];
      if (campaignIds.length > 0) {
        const analyticsResp = await this.getCampaignAnalytics(account.id, { campaignIds });
        insights = (analyticsResp.elements || []).map(a => this._mapInsight(a));
      }

      return {
        account: { id: account.id, name: account.name, currency: account.currency },
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights,
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
      dailyBudget: c.dailyBudget,
      type: c.type,
    };
  }

  _mapInsight(a) {
    return {
      campaign_id: a.pivotValue,
      impressions: parseInt(a.impressions) || 0,
      clicks: parseInt(a.clicks) || 0,
      spend: parseFloat(a.costInLocalCurrency) || 0,
      conversions: parseFloat(a.conversions) || 0,
      conversionValue: parseFloat(a.conversionValueInLocalCurrency) || 0,
      ctr: parseFloat(a.ctr) || 0,
      cpc: parseFloat(a.cpc) || 0,
    };
  }
}
