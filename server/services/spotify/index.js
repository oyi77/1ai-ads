import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../../lib/errors.js';

const BASE = 'https://api-partner.spotify.com/ads/v3';

export class SpotifyAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('spotify', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('spotify');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      'Spotify Ads access token not configured. Go to Settings > Spotify to add it.'
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
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    const res = await safeFetch('spotify', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(
        `Spotify API error: ${data.error.message || data.error}`,
        'spotify',
        data.error.status
      );
    }
    return data;
  }

  async _post(path, body = {}) {
    const res = await safeFetch('spotify', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(
        `Spotify API error: ${data.error.message || data.error}`,
        'spotify',
        data.error.status
      );
    }
    return data;
  }

  /**
   * List ad accounts for the authenticated user.
   * GET /ad-accounts
   */
  async getAccounts() {
    this.log.debug('Fetching Spotify ad accounts');
    const data = await this._get('/ad-accounts');
    return data.ad_accounts || data.data || [];
  }

  /**
   * List campaigns for an ad account.
   * GET /ad-accounts/{accountId}/campaigns
   */
  async getCampaigns(accountId) {
    this.log.debug('Fetching Spotify campaigns', { accountId });
    const data = await this._get(`/ad-accounts/${accountId}/campaigns`);
    return data.campaigns || data.data || [];
  }

  /**
   * Create a new campaign.
   * POST /ad-accounts/{accountId}/campaigns
   */
  async createCampaign(accountId, { name, budget, status = 'PAUSED' }) {
    this.log.info('Creating Spotify campaign', { accountId, name });
    const body = { name, status };
    if (budget !== undefined) {
      body.budget = budget;
    }
    const data = await this._post(`/ad-accounts/${accountId}/campaigns`, body);
    this.log.info('Spotify campaign created', { campaignId: data.campaign?.id || data.id });
    return { campaignId: data.campaign?.id || data.id };
  }

  /**
   * Update a campaign.
   * PATCH /ad-accounts/{accountId}/campaigns/{campaignId}
   */
  async updateCampaign(accountId, campaignId, { name, status }) {
    this.log.info('Updating Spotify campaign', { accountId, campaignId });
    const body = {};
    if (name) body.name = name;
    if (status) body.status = status;

    const res = await safeFetch('spotify', `${this._baseUrl}/ad-accounts/${accountId}/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(
        `Spotify API error: ${data.error.message || data.error}`,
        'spotify',
        data.error.status
      );
    }
    this.log.info('Spotify campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Sync all active accounts: fetch campaigns per account.
   * Returns standardized format matching other platforms.
   */
  async syncAllAccounts() {
    this.log.info('Starting Spotify ads sync');
    const accounts = await this.getAccounts();
    const results = [];

    for (const account of accounts) {
      try {
        const campaigns = await this.getCampaigns(account.id);

        results.push({
          account: { id: account.id, name: account.name, currency: account.currency },
          campaigns: campaigns.map(c => this._mapCampaign(c)),
          insights: [],
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account: { id: account.id, name: account.name },
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    this.log.info('Spotify ads sync complete', { accounts: results.length });
    return results;
  }

  _mapCampaign(c) {
    return {
      id: c.id,
      name: c.name,
      status: c.status ? c.status.toLowerCase() : 'unknown',
      budget: c.budget,
    };
  }
}
