import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('microsoft-ads-api');

export class MicrosoftAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken, options = {}) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('microsoft', settingsRepo, { baseUrl: 'https://campaign.api.bingads.microsoft.com/v13' });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
    this.developerToken = options.developerToken || '';
    this.customerId = options.customerId || '';
    this.accountId = options.accountId || '';
  }

  static withToken(token, options = {}) {
    return new MicrosoftAdsAPI(token, options);
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('microsoft');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('Microsoft Ads access token not configured.');
  }

  _msHeaders() {
    return {
      'AuthenticationToken': this._getToken(),
      'DeveloperToken': this.developerToken,
      'CustomerId': this.customerId,
      'AccountId': this.accountId,
    };
  }

  async _request(method, path, data = null) {
    try {
      const response = await fetch(`${this._baseUrl}${path}`, {
        method,
        headers: { ...this._msHeaders(), 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Microsoft Ads API error ${response.status}: ${error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      log.error('Microsoft Ads API request failed', { error: err.message, path });
      throw err;
    }
  }

  async getAdAccounts() {
    try {
      const data = await this._request('GetAccountsInfo', '/CustomerManagement/v13/AccountsInfo');
      return (data?.AccountsInfo || []).map(item => ({
        item: item.AccountId,
        name: item.AccountName,
        status: item.AccountStatus,
        currency: item.CurrencyCode,
      }));
    } catch (err) {
      log.error('Failed to list Microsoft ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  async getCampaigns(accountId, { limit = 50 } = {}) {
    try {
      const data = await this._request('GetCampaignsByAccountId', `/CampaignManagement/v13/Campaigns/${accountId}`, {
        AccountId: accountId,
        CampaignType: 'Search Shopping',
      });
      return (data?.Campaigns || []).map(item => ({
        item: item.Campaign.Id,
        name: item.Campaign.Name,
        status: this._mapStatus(item.Campaign.Status),
        budget: item.Campaign.DailyBudget || 0,
      }));
    } catch (err) {
      log.error('Failed to get Microsoft campaigns', { error: err.message });
      return [];
    }
  }

  async getCampaignInsights(accountId, campaignId, { startDate, endDate } = {}) {
    try {
      const data = await this._request('GetCampaignMetrics', `/Reporting/v13/CampaignMetrics`, {
        AccountId: accountId,
        CampaignId: campaignId,
        StartDate: startDate,
        EndDate: endDate,
      });
      if (!data?.CampaignMetrics || data.CampaignMetrics.length === 0) return null;
      const row = data.CampaignMetrics[0];
      return {
        campaignId,
        impressions: row.Impressions || 0,
        clicks: row.Clicks || 0,
        cost: row.Spend || 0,
        conversions: row.Conversions || 0,
        ctr: row.Ctr || 0,
        averageCpc: row.AverageCpc || 0,
      };
    } catch (err) {
      log.error('Failed to get Microsoft campaign insights', { error: err.message });
      return null;
    }
  }

  async getMultiCampaignInsights(accountId, campaignIds, { startDate, endDate } = {}) {
    if (!campaignIds || campaignIds.length === 0) return {};
    const insights = {};
    for (const id of campaignIds) {
      insights[id] = await this.getCampaignInsights(accountId, id, { startDate, endDate });
    }
    return insights;
  }

  async getAccountInsights(accountId, { startDate, endDate } = {}) {
    try {
      const data = await this._request('GetAccountMetrics', `/Reporting/v13/AccountMetrics`, {
        AccountId: accountId,
        StartDate: startDate,
        EndDate: endDate,
      });
      if (!data?.AccountMetrics || data.AccountMetrics.length === 0) return null;
      const row = data.AccountMetrics[0];
      return {
        accountId,
        impressions: row.Impressions || 0,
        clicks: row.Clicks || 0,
        cost: row.Spend || 0,
        conversions: row.Conversions || 0,
      };
    } catch (err) {
      log.error('Failed to get Microsoft account insights', { error: err.message });
      return null;
    }
  }

  async updateCampaign(accountId, campaignId, { status, budget } = {}) {
    try {
      const data = await this._request('UpdateCampaign', `/CampaignManagement/v13/Campaigns/${accountId}`, {
        AccountId: accountId,
        Campaigns: [{ Id: campaignId, Status: this._reverseMapStatus(status) }],
      });
      return { id: campaignId, updated: true, data };
    } catch (err) {
      log.error('Failed to update Microsoft campaign', { error: err.message });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  async createCampaign(accountId, data = {}) {
    try {
      const body = {
        AccountId: accountId,
        Campaigns: [{
          Name: data.name || `Campaign ${Date.now()}`,
          Status: 'Paused',
          DailyBudget: data.budget || 10,
          BudgetType: 'DailyBudgetStandard',
        }],
      };
      const result = await this._request('AddCampaigns', `/CampaignManagement/v13/Campaigns/${accountId}`, body);
      return { campaignId: result?.CampaignIds?.[0], name: body.Campaigns[0].Name, status: 'paused' };
    } catch (err) {
      log.error('Failed to create Microsoft campaign', { error: err.message });
      return { campaignId: null, error: err.message };
    }
  }

  async syncAllAccounts() {
    try {
      const accounts = await this.getAdAccounts();
      const synced = [];
      for (const account of accounts) {
        const campaigns = await this.getCampaigns(account.id);
        synced.push({ ...account, campaigns, campaignCount: campaigns.length });
      }
      return synced;
    } catch (err) {
      log.error('Failed to sync Microsoft accounts', { error: err.message });
      return [];
    }
  }

  _mapStatus(status) {
    const statusMap = {
      'Active': 'active',
      'Paused': 'paused',
      'Deleted': 'removed',
      'Expired': 'removed',
    };
    return statusMap[status] || status?.toLowerCase() || 'unknown';
  }

  _reverseMapStatus(status) {
    const statusMap = {
      'active': 'Active',
      'paused': 'Paused',
      'removed': 'Deleted',
    };
    return statusMap[status] || 'Paused';
  }

  isExpiredToken(err) {
    const msg = `${err?.message || ''}`.toLowerCase();
    return err?.code === 401 || err?.code === 403 || msg.includes('unauthorized') || msg.includes('token expired');
  }
}

export default MicrosoftAdsAPI;
