import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../../lib/errors.js';

const BASE = 'https://advertising-api.amazon.com';

export class AmazonAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('amazon', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('amazon');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Amazon Ads access token not configured. Go to Settings > Amazon to add it.'
    );
  }

  _headers(profileId) {
    const creds = this.settingsRepo?.getCredentials('amazon') || {};
    const headers = {
      'Authorization': `Bearer ${this._getToken()}`,
    };
    if (creds.client_id) {
      headers['Amazon-Advertising-API-ClientId'] = creds.client_id;
    }
    if (profileId) {
      headers['Amazon-Advertising-API-Scope'] = String(profileId);
    }
    return headers;
  }

  async _get(path, params = {}, profileId = undefined) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    const res = await safeFetch('amazon', url.toString(), {
      headers: this._headers(profileId),
    });
    const data = await res.json();
    if (data.code && data.details) {
      throw new PlatformError(`Amazon API error: ${data.details}`, 'amazon', data.code);
    }
    return data;
  }

  async _post(path, body = {}, profileId = undefined) {
    const res = await safeFetch('amazon', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers(profileId) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code && data.details) {
      throw new PlatformError(`Amazon API error: ${data.details}`, 'amazon', data.code);
    }
    return data;
  }

  async _put(path, body = {}, profileId = undefined) {
    const res = await safeFetch('amazon', `${this._baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...this._headers(profileId) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code && data.details) {
      throw new PlatformError(`Amazon API error: ${data.details}`, 'amazon', data.code);
    }
    return data;
  }

  /**
   * List advertising profiles (Amazon's equivalent of ad accounts).
   * GET /v2/profiles
   */
  async getProfiles() {
    this.log.debug('Fetching Amazon advertising profiles');
    const data = await this._get('/v2/profiles');
    return Array.isArray(data) ? data : [];
  }

  /** Alias — satisfies the platform interface contract. */
  async getAccounts() { return this.getProfiles(); }


  /**
   * List campaigns for a profile.
   * GET /v2/sp/campaigns (Sponsored Products)
   */
  async getCampaigns(profileId) {
    this.log.debug('Fetching Amazon campaigns', { profileId });
    const data = await this._get('/v2/sp/campaigns', {}, profileId);
    return Array.isArray(data) ? data : data.campaigns || [];
  }

  /**
   * Create a new Sponsored Products campaign.
   * POST /v2/sp/campaigns
   */
  async createCampaign(profileId, { name, budget, targetingType = 'MANUAL' }) {
    this.log.info('Creating Amazon campaign', { profileId, name });
    const body = [{
      name,
      targetingType,
      state: 'PAUSED',
    }];
    if (budget !== undefined) {
      body[0].dailyBudget = budget;
    }
    const data = await this._post('/v2/sp/campaigns', body, profileId);
    const campaignId = Array.isArray(data) ? data[0]?.campaignId : data.campaignId;
    this.log.info('Amazon campaign created', { campaignId });
    return { campaignId };
  }

  /**
   * Update a campaign.
   * PUT /v2/sp/campaigns
   */
  async updateCampaign(profileId, campaignId, { name, status }) {
    this.log.info('Updating Amazon campaign', { profileId, campaignId });
    const body = [{
      campaignId,
    }];
    if (name) body[0].name = name;
    if (status) body[0].state = status.toUpperCase();

    await this._put('/v2/sp/campaigns', body, profileId);
    this.log.info('Amazon campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all profiles: fetch campaigns per profile.
   * Returns standardized format matching other platforms.
   */
  async syncAllAccounts() {
    this.log.info('Starting Amazon ads sync');
    const profiles = await this.getProfiles();
    const results = [];

    for (const profile of profiles) {
      try {
        const campaigns = await this.getCampaigns(profile.profileId);

        results.push({
          account: {
            id: profile.profileId,
            name: profile.accountInfo?.name || profile.countryCode,
            currency: profile.currencyCode,
            country: profile.countryCode,
          },
          campaigns: campaigns.map(c => this._mapCampaign(c)),
          insights: [],
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account: { id: profile.profileId, name: profile.countryCode },
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    this.log.info('Amazon ads sync complete', { profiles: results.length });
    return results;
  }

  _mapCampaign(c) {
    return {
      id: c.campaignId,
      name: c.name,
      status: c.state ? c.state.toLowerCase() : 'unknown',
      targetingType: c.targetingType,
      dailyBudget: c.dailyBudget,
    };
  }
}
