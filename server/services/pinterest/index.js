import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../../lib/errors.js';

export class PinterestAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('pinterest', settingsRepo, { baseUrl: 'https://api.pinterest.com/v5' });
  }

  /**
   * Resolve Pinterest OAuth 2.0 Bearer token.
   * Checks explicit token > settingsRepo credentials > throws.
   */
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('pinterest');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Pinterest access token not configured. Go to Settings to connect your Pinterest account.'
    );
  }

  /**
   * Build auth headers for Pinterest API requests.
   */
  _authHeaders() {
    const token = this._getToken();
    return { 'Authorization': `Bearer ${token}` };
  }

  /**
   * GET /ad_accounts — list ad accounts the token has access to.
   * @returns {Array<{id: string, name: string, currency: string, country: string}>}
   */
  async getAdAccounts() {
    this.log.debug('Fetching Pinterest ad accounts');
    try {
      const data = await this._get('/ad_accounts', {}, this._authHeaders());
      return (data.items || []).map(a => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        country: a.country,
      }));
    } catch (err) {
      this.log.error('Failed to fetch Pinterest ad accounts', { error: err.message });
      throw new PlatformError(`Failed to fetch ad accounts: ${err.message}`, 'pinterest');
    }
  }

  /** Alias — satisfies the platform interface contract. */
  async getAccounts() { return this.getAdAccounts(); }


  /**
   * GET /ad_accounts/:id/campaigns — list campaigns for an ad account.
   * Filters by entity_status (ACTIVE, PAUSED, ARCHIVED).
   */
  async getCampaigns(adAccountId, { entityStatus, pageSize = 100 } = {}) {
    this.log.debug('Fetching Pinterest campaigns', { adAccountId });
    const params = { page_size: pageSize };
    if (entityStatus) params.entity_statuses = entityStatus;
    try {
      const data = await this._get(
        `/ad_accounts/${adAccountId}/campaigns`,
        params,
        this._authHeaders(),
      );
      return (data.items || []).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        daily_spend_cap: c.daily_spend_cap,
        lifetime_spend_cap: c.lifetime_spend_cap,
        objective_type: c.objective_type,
        created_time: c.created_time,
        updated_time: c.updated_time,
      }));
    } catch (err) {
      this.log.error('Failed to fetch Pinterest campaigns', { adAccountId, error: err.message });
      throw new PlatformError(`Failed to fetch campaigns: ${err.message}`, 'pinterest');
    }
  }

  /**
   * GET /ad_accounts/:id/analytics — aggregate analytics for an ad account.
   * Returns impressions, clicks, spend, conversions, CPC, CTR.
   */
  async getCampaignAnalytics(adAccountId, { startDate, endDate, granularity = 'TOTAL' } = {}) {
    this.log.debug('Fetching Pinterest ad account analytics', { adAccountId });
    const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);
    const params = {
      start_date: start,
      end_date: end,
      granularity,
      columns: 'IMPRESSIONS,CLICKS,SPEND_IN_MICRO_DOLLAR,CTR,CPC_IN_MICRO_DOLLAR,TOTAL_CONVERSIONS,ENGAGEMENT',
    };
    try {
      const data = await this._get(
        `/ad_accounts/${adAccountId}/analytics`,
        params,
        this._authHeaders(),
      );
      return (data || []).map(row => ({
        impressions: row.IMPRESSIONS ?? 0,
        clicks: row.CLICKS ?? 0,
        spend: (row.SPEND_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
        ctr: row.CTR ?? 0,
        cpc: (row.CPC_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
        conversions: row.TOTAL_CONVERSIONS ?? 0,
        engagement: row.ENGAGEMENT ?? 0,
      }));
    } catch (err) {
      this.log.error('Failed to fetch Pinterest ad account analytics', { adAccountId, error: err.message });
      throw new PlatformError(`Failed to fetch analytics: ${err.message}`, 'pinterest');
    }
  }

  /**
   * GET /campaigns/:id/analytics — analytics for a specific campaign.
   */
  async getCampaignInsights(campaignId, { startDate, endDate, granularity = 'TOTAL' } = {}) {
    this.log.debug('Fetching Pinterest campaign insights', { campaignId });
    const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);
    const params = {
      start_date: start,
      end_date: end,
      granularity,
      columns: 'IMPRESSIONS,CLICKS,SPEND_IN_MICRO_DOLLAR,CTR,CPC_IN_MICRO_DOLLAR,TOTAL_CONVERSIONS,ENGAGEMENT',
    };
    try {
      const data = await this._get(
        `/campaigns/${campaignId}/analytics`,
        params,
        this._authHeaders(),
      );
      return (data || []).map(row => ({
        campaign_id: campaignId,
        impressions: row.IMPRESSIONS ?? 0,
        clicks: row.CLICKS ?? 0,
        spend: (row.SPEND_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
        ctr: row.CTR ?? 0,
        cpc: (row.CPC_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
        conversions: row.TOTAL_CONVERSIONS ?? 0,
        engagement: row.ENGAGEMENT ?? 0,
      }));
    } catch (err) {
      this.log.error('Failed to fetch Pinterest campaign insights', { campaignId, error: err.message });
      throw new PlatformError(`Failed to fetch campaign insights: ${err.message}`, 'pinterest');
    }
  }

  /**
   * POST /ad_accounts/:id/campaigns — create a new campaign.
   */
  async createCampaign(adAccountId, { name, status = 'PAUSED', dailySpendCap, objectiveType = 'AWARENESS' }) {
    this.log.info('Creating Pinterest campaign', { adAccountId, name });
    if (!name) throw new ConfigurationError('Campaign name is required');
    const body = {
      name,
      status,
      objective_type: objectiveType,
      ...(dailySpendCap !== null && dailySpendCap !== undefined && { daily_spend_cap: dailySpendCap }),
    };
    try {
      const data = await this._post(
        `/ad_accounts/${adAccountId}/campaigns`,
        body,
        this._authHeaders(),
      );
      this.log.info('Pinterest campaign created', { campaignId: data.id });
      return { id: data.id, name: data.name, status: data.status };
    } catch (err) {
      this.log.error('Failed to create Pinterest campaign', { adAccountId, error: err.message });
      throw new PlatformError(`Failed to create campaign: ${err.message}`, 'pinterest');
    }
  }

  /**
   * PATCH /campaigns/:id — update an existing campaign.
   */
  async updateCampaign(campaignId, updates) {
    this.log.info('Updating Pinterest campaign', { campaignId });
    const body = {};
    if (updates.name !== null && updates.name !== undefined) body.name = updates.name;
    if (updates.status !== null && updates.status !== undefined) body.status = updates.status;
    if (updates.dailySpendCap !== null && updates.dailySpendCap !== undefined) body.daily_spend_cap = updates.dailySpendCap;
    try {
      const res = await safeFetch('pinterest', `${this._baseUrl}/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      this.log.info('Pinterest campaign updated', { campaignId });
      return { id: data.id, name: data.name, status: data.status };
    } catch (err) {
      this.log.error('Failed to update Pinterest campaign', { campaignId, error: err.message });
      throw new PlatformError(`Failed to update campaign: ${err.message}`, 'pinterest');
    }
  }

  /**
   * GET /campaigns/:id/ad_groups — list ad groups under a campaign.
   */
  async getAdGroups(adAccountId, campaignId) {
    this.log.debug('Fetching Pinterest ad groups', { adAccountId, campaignId });
    try {
      const data = await this._get(
        `/campaigns/${campaignId}/ad_groups`,
        {},
        this._authHeaders(),
      );
      return (data.items || []).map(ag => ({
        id: ag.id,
        name: ag.name,
        status: ag.status,
        campaign_id: ag.campaign_id,
        bid_strategy_type: ag.bid_strategy_type,
      }));
    } catch (err) {
      this.log.error('Failed to fetch Pinterest ad groups', { campaignId, error: err.message });
      throw new PlatformError(`Failed to fetch ad groups: ${err.message}`, 'pinterest');
    }
  }

  /**
   * GET /ad_accounts/:id/targeting/keywords — targeting keywords for an ad account.
   */
  async getTargetingKeywords(adAccountId) {
    this.log.debug('Fetching Pinterest targeting keywords', { adAccountId });
    try {
      const data = await this._get(
        `/ad_accounts/${adAccountId}/targeting/keywords`,
        {},
        this._authHeaders(),
      );
      return data.items || [];
    } catch (err) {
      this.log.error('Failed to fetch Pinterest targeting keywords', { adAccountId, error: err.message });
      throw new PlatformError(`Failed to fetch targeting keywords: ${err.message}`, 'pinterest');
    }
  }

  /**
   * GET /targeting/interests — search available targeting interests.
   */
  async searchTargeting(interest, { limit = 25 } = {}) {
    this.log.debug('Searching Pinterest targeting interests', { interest });
    try {
      const data = await this._get(
        '/targeting/interests',
        { interest, limit },
        this._authHeaders(),
      );
      return data.items || [];
    } catch (err) {
      this.log.error('Failed to search Pinterest targeting interests', { interest, error: err.message });
      throw new PlatformError(`Failed to search targeting interests: ${err.message}`, 'pinterest');
    }
  }

  /**
   * Sync all ad accounts: campaigns + analytics for each.
   * @returns {Array<{account, campaigns, insights, syncedAt}>}
   */
  async syncAllAccounts() {
    this.log.info('Syncing all Pinterest ad accounts');
    const accounts = await this.getAdAccounts();
    const results = [];
    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }
    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaigns = await this.getCampaigns(account.id);
      const analytics = await this.getCampaignAnalytics(account.id);
      return {
        account: { id: account.id, name: account.name, currency: account.currency, country: account.country },
        campaigns,
        insights: analytics,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        account: { id: account.id, name: account.name, currency: account.currency, country: account.country },
        error: err.message,
        syncedAt: new Date().toISOString(),
      };
    }
  }
}
