import { safeFetch } from '../../lib/platform-client.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';

const BASE = 'https://campaign.api.bingads.microsoft.com';

export class MicrosoftAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('microsoft', settingsRepo, { baseUrl: BASE });
  }

  /**
   * Resolve OAuth token from settings.
   */
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('microsoft');
      if (creds?.oauth_token) return creds.oauth_token;
    }
    throw new ConfigurationError(
      'Microsoft Ads OAuth token not configured. Complete OAuth flow in Settings.'
    );
  }

  /**
   * Resolve developer token from settings.
   */
  _getDevToken() {
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('microsoft');
      if (creds?.developer_token) return creds.developer_token;
    }
    throw new ConfigurationError(
      'Microsoft Ads developer token not configured. Go to Settings > Microsoft Ads. Get one at Microsoft Advertising > Tools > API Center.'
    );
  }

  /**
   * Build standard auth headers for Microsoft Advertising API.
   */
  _buildHeaders(accountId) {
    const headers = {
      'Authorization': `Bearer ${this._getToken()}`,
      'Microsoft-Ads-Developer-Token': this._getDevToken(),
      'Content-Type': 'application/json',
    };
    if (accountId) headers['CustomerId'] = String(accountId);
    if (this._activeAccountId && !accountId) headers['CustomerId'] = String(this._activeAccountId);
    return headers;
  }

  async _get(path, params = {}, extraHeaders = {}) {
    const accountId = extraHeaders['CustomerId'] || this._activeAccountId;
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch('microsoft', url.toString(), {
      headers: { ...this._buildHeaders(accountId), ...extraHeaders },
    });
    return await res.json();
  }

  async _post(path, body = {}, extraHeaders = {}) {
    const accountId = extraHeaders['CustomerId'] || this._activeAccountId;
    const res = await safeFetch('microsoft', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this._buildHeaders(accountId), ...extraHeaders },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * List all accounts accessible to the authenticated user.
   * POST /CustomerManagement/GetAccountsInfo
   */
  async listAccounts() {
    this.log.debug('Fetching Microsoft Ads accounts');
    const data = await this._post('/CustomerManagement/GetAccountsInfo', {});
    return (data.AccountInfo || data || []).map(a => ({
      id: a.Id,
      name: a.Name,
      number: a.Number,
      accountLifeCycleStatus: a.AccountLifeCycleStatus,
    }));
  }

  /** Alias — satisfies the platform interface contract. */
  async getAccounts() { return this.listAccounts(); }


  /**
   * Sync all accounts: campaigns + performance for each.
   */
  async syncAllAccounts() {
    const accounts = await this.listAccounts();
    const results = [];
    for (const acct of accounts) {
      results.push(await this._syncSingleAccount(acct));
    }
    return results;
  }

  async _syncSingleAccount(account) {
    try {
      const campaigns = await this.getCampaigns(account.id);
      const performance = await this.getCampaignPerformance(account.id);
      return {
        account,
        campaigns: campaigns.map(c => this._mapCampaign(c)),
        insights: performance.map(p => this._mapPerformance(p)),
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

  _mapCampaign(c) {
    return {
      id: c.Id,
      name: c.Name,
      status: (c.Status || '').toLowerCase(),
      budget: c.DailyBudget,
      campaignType: c.CampaignType,
      bidStrategyType: c.BidStrategyType,
    };
  }

  _mapPerformance(p) {
    return {
      campaign_id: p.CampaignId,
      impressions: parseInt(p.Impressions) || 0,
      clicks: parseInt(p.Clicks) || 0,
      spend: parseFloat(p.Spend) || 0,
      conversions: parseFloat(p.Conversions) || 0,
      ctr: parseFloat(p.Ctr) || 0,
      cpc: parseFloat(p.AverageCpc) || 0,
    };
  }

  /**
   * Get campaigns for an account.
   * POST /Campaigns/GetByCondition
   */
  async getCampaigns(accountId, opts = {}) {
    this.log.debug('Fetching Microsoft Ads campaigns', { accountId });
    const fields = opts.fields || ['Id', 'Name', 'Status', 'DailyBudget', 'CampaignType', 'BidStrategyType'];
    const data = await this._post('/Campaigns/GetByCondition', {
      Field: fields,
      Ordering: [{ Field: 'Name', Order: 'Ascending' }],
      PageInfo: { Index: 0, Size: opts.pageSize || 100 },
      Predicates: [
        { Field: 'Status', Operator: 'NotEquals', Values: ['Deleted'] },
      ],
    }, { 'CustomerId': accountId });
    return data.Campaigns || data.CampaignValues || [];
  }

  /**
   * Get campaign performance report.
   * POST /Reporting/SubmitCampaignPerformanceReportRequest
   */
  async getCampaignPerformance(accountId, { days = 30 } = {}) {
    this.log.debug('Fetching Microsoft Ads campaign performance', { accountId, days });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const reportRequest = {
      ReportRequest: {
        ReportName: 'CampaignPerformanceReport',
        Format: 'Json',
        ReportType: 'CampaignPerformanceReport',
        Time: {
          CustomDateRangeStart: {
            Day: startDate.getDate(),
            Month: startDate.getMonth() + 1,
            Year: startDate.getFullYear(),
          },
          CustomDateRangeEnd: {
            Day: endDate.getDate(),
            Month: endDate.getMonth() + 1,
            Year: endDate.getFullYear(),
          },
        },
        Columns: [
          'CampaignId', 'CampaignName', 'CampaignStatus',
          'Impressions', 'Clicks', 'Spend',
          'Conversions', 'Ctr', 'AverageCpc',
        ],
        Scope: {
          AccountIds: [String(accountId)],
        },
      },
    };

    const data = await this._post('/Reporting/SubmitCampaignPerformanceReportRequest', reportRequest, { 'CustomerId': accountId });

    // The report response may contain a download URL or inline data
    if (data.ReportDownloadUrl) {
      const dlRes = await safeFetch('microsoft', data.ReportDownloadUrl, {
        headers: this._buildHeaders(accountId),
      });
      const reportData = await dlRes.json();
      return reportData.Rows || reportData || [];
    }

    return data.Rows || data.ReportData?.Rows || [];
  }

  /**
   * Create a campaign.
   * POST /Campaigns/Add
   */
  async createCampaign(accountId, { name, dailyBudget, campaignType = 'SEARCH', status = 'Paused' }) {
    this.log.info('Creating Microsoft Ads campaign', { accountId, name });
    const data = await this._post('/Campaigns/Add', {
      Campaigns: [{
        Name: name,
        DailyBudget: dailyBudget,
        CampaignType: campaignType,
        Status: status,
        BudgetType: 'DailyBudgetStandard',
      }],
    }, { 'CustomerId': accountId });
    this.log.info('Microsoft Ads campaign created', { campaignId: data.CampaignIds?.[0] });
    return { campaignId: data.CampaignIds?.[0] };
  }

  /**
   * Update a campaign.
   * POST /Campaigns/Update
   */
  async updateCampaign(accountId, campaignId, updates) {
    this.log.info('Updating Microsoft Ads campaign', { accountId, campaignId });
    const campaign = { Id: campaignId, ...updates };
    await this._post('/Campaigns/Update', {
      Campaigns: [campaign],
    }, { 'CustomerId': accountId });
    this.log.info('Microsoft Ads campaign updated', { campaignId });
    return { campaignId };
  }

  /**
   * Get ad groups for a campaign.
   * POST /AdGroups/GetByConditions
   */
  async getAdGroups(accountId, campaignId) {
    this.log.debug('Fetching Microsoft Ads ad groups', { accountId, campaignId });
    const data = await this._post('/AdGroups/GetByConditions', {
      Field: ['Id', 'Name', 'Status', 'CpcBid'],
      Ordering: [{ Field: 'Name', Order: 'Ascending' }],
      PageInfo: { Index: 0, Size: 100 },
      Predicates: [
        { Field: 'CampaignId', Operator: 'Equals', Values: [String(campaignId)] },
        { Field: 'Status', Operator: 'NotEquals', Values: ['Deleted'] },
      ],
    }, { 'CustomerId': accountId });
    return data.AdGroups || data.AdGroupValues || [];
  }

  /**
   * Get keywords for an ad group.
   * POST /Keywords/GetByAdGroupId
   */
  async getKeywords(accountId, adGroupId) {
    this.log.debug('Fetching Microsoft Ads keywords', { accountId, adGroupId });
    const data = await this._post('/Keywords/GetByAdGroupId', {
      AdGroupId: String(adGroupId),
      Field: ['Id', 'Text', 'Status', 'Bid', 'MatchType'],
      Ordering: [{ Field: 'Text', Order: 'Ascending' }],
      PageInfo: { Index: 0, Size: 100 },
    }, { 'CustomerId': accountId });
    return data.Keywords || data.KeywordValues || [];
  }
}
