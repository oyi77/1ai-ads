import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://adsapi.snapchat.com/v1';

export class SnapchatAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('snapchat', settingsRepo, { baseUrl: BASE });
  }

  // Override: Snapchat uses OAuth 2.0 Bearer token
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('snapchat');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Snapchat access token not configured. Complete OAuth flow in Settings to connect Snapchat Ads.'
    );
  }

  _authHeaders() {
    return { 'Authorization': `Bearer ${this._getToken()}` };
  }

  async _get(path, params = {}) {
    return super._get(path, params, this._authHeaders());
  }

  async _post(path, body = {}) {
    return super._post(path, body, this._authHeaders());
  }

  async _put(path, body = {}) {
    const res = await safeFetch('snapchat', `${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List organizations the authenticated user belongs to.
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async getOrganizations() {
    this.log.debug('Fetching Snapchat organizations');
    const data = await this._get('/me/organizations');
    return (data.organizations || []).map(o => ({
      id: o.id,
      name: o.name,
    }));
  }

  /**
   * List ad accounts for an organization.
   * @param {string} orgId
   * @returns {Promise<Array<{id: string, name: string, currency: string, status: string}>>}
   */
  async getAdAccounts(orgId) {
    this.log.debug('Fetching Snapchat ad accounts', { orgId });
    const data = await this._get(`/organizations/${orgId}/adaccounts`);
    return (data.ad_accounts || []).map(a => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      status: a.status,
    }));
  }

  /** Alias — satisfies the platform interface contract. */
  async getAccounts() { return this.getAdAccounts(); }


  /**
   * Fetch campaigns for an ad account.
   * @param {string} adAccountId
   * @param {object} [opts]
   * @param {string[]} [opts.fields] - Fields to include
   * @returns {Promise<Array>}
   */
  async getCampaigns(adAccountId, opts = {}) {
    this.log.debug('Fetching Snapchat campaigns', { adAccountId });
    const fields = opts.fields || ['id', 'name', 'status', 'daily_budget_micro', 'type'];
    const data = await this._get(`/adaccounts/${adAccountId}/campaigns`, { fields: fields.join(',') });
    return (data.campaigns || []).map(c => ({
      id: c.campaign?.id,
      name: c.campaign?.name,
      status: c.campaign?.status,
      daily_budget_micro: c.campaign?.daily_budget_micro,
      type: c.campaign?.type,
    }));
  }

  /**
   * Fetch stats for a specific campaign.
   * @param {string} adAccountId
   * @param {string} campaignId
   * @param {object} [opts]
   * @param {string} [opts.startDate] - YYYY-MM-DD
   * @param {string} [opts.endDate] - YYYY-MM-DD
   * @param {string} [opts.granularity] - DAY, WEEK, MONTH, LIFETIME
   * @returns {Promise<object>}
   */
  async getCampaignStats(adAccountId, campaignId, opts = {}) {
    this.log.debug('Fetching Snapchat campaign stats', { adAccountId, campaignId });
    const params = {};
    if (opts.startDate) params.start_time = opts.startDate;
    if (opts.endDate) params.end_time = opts.endDate;
    if (opts.granularity) params.granularity = opts.granularity;

    const data = await this._get(`/adaccounts/${adAccountId}/campaigns/${campaignId}/stats`, params);
    const stats = data.stats || {};
    return {
      impressions: stats.impressions ?? 0,
      swipes: stats.swipes ?? 0,
      spend: stats.spend ?? 0,
      conversions: stats.conversions ?? 0,
    };
  }

  /**
   * Fetch ad squads (ad sets) for a campaign.
   * @param {string} adAccountId
   * @param {string} campaignId
   * @returns {Promise<Array>}
   */
  async getAdSquads(adAccountId, campaignId) {
    this.log.debug('Fetching Snapchat ad squads', { adAccountId, campaignId });
    const data = await this._get(`/campaigns/${campaignId}/adsquads`);
    return data.adsquads || [];
  }

  /**
   * Create a new campaign.
   * @param {string} adAccountId
   * @param {object} params
   * @param {string} params.name
   * @param {string} [params.status] - ACTIVE or PAUSED
   * @param {number} [params.daily_budget_micro]
   * @param {string} [params.objective] - SWIPES, APP_INSTALLS, etc.
   * @returns {Promise<object>}
   */
  async createCampaign(adAccountId, params) {
    this.log.info('Creating Snapchat campaign', { adAccountId, name: params.name });
    const data = await this._post(`/adaccounts/${adAccountId}/campaigns`, {
      campaigns: [{
        name: params.name,
        status: params.status || 'PAUSED',
        daily_budget_micro: params.daily_budget_micro,
        objective_type: params.objective || 'SWIPES',
      }],
    });
    this.log.info('Snapchat campaign created', { campaignId: data.campaigns?.[0]?.id });
    return data.campaigns?.[0] || data;
  }

  /**
   * Update an existing campaign.
   * @param {string} adAccountId
   * @param {string} campaignId
   * @param {object} updates - Fields to update (name, status, daily_budget_micro)
   * @returns {Promise<object>}
   */
  async updateCampaign(adAccountId, campaignId, updates) {
    this.log.info('Updating Snapchat campaign', { adAccountId, campaignId });
    const data = await this._put(`/adaccounts/${adAccountId}/campaigns/${campaignId}`, {
      campaigns: [updates],
    });
    this.log.info('Snapchat campaign updated', { campaignId });
    return data.campaigns?.[0] || data;
  }

  /**
   * Fetch audiences for an ad account.
   * @param {string} adAccountId
   * @returns {Promise<Array>}
   */
  async getAudiences(adAccountId) {
    this.log.debug('Fetching Snapchat audiences', { adAccountId });
    const data = await this._get(`/adaccounts/${adAccountId}/audiences`);
    return data.audiences || [];
  }

  /**
   * Sync all ad accounts: campaigns + stats for each.
   * Iterates through all organizations, then all ad accounts in each.
   * @returns {Promise<Array<{account: object, campaigns: Array, insights: Array, syncedAt: string}>>}
   */
  async syncAllAccounts() {
    this.log.info('Starting Snapchat full sync');
    const orgs = await this.getOrganizations();
    const results = [];

    for (const org of orgs) {
      let accounts;
      try {
        accounts = await this.getAdAccounts(org.id);
      } catch (err) {
        this.log.error('Failed to fetch ad accounts for org', { orgId: org.id, error: err.message });
        continue;
      }

      for (const account of accounts) {
        results.push(await this._syncSingleAccount(account));
      }
    }

    this.log.info('Snapchat sync complete', { accountCount: results.length });
    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaigns = await this.getCampaigns(account.id);
      const insights = [];

      for (const campaign of campaigns) {
        try {
          const stats = await this.getCampaignStats(account.id, campaign.id);
          insights.push({ campaign_id: campaign.id, ...stats });
        } catch (err) {
          this.log.warn('Failed to fetch stats for campaign', { campaignId: campaign.id, error: err.message });
        }
      }

      return {
        account,
        campaigns,
        insights,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account,
        error: err.message,
        syncedAt: new Date().toISOString(),
      };
    }
  }
}
