import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('microsoft-ads-api');

/**
 * Microsoft Ads API v13 implementation (SOAP-based).
 * 
 * Documentation: https://learn.microsoft.com/en-us/advertising/
 * 
 * Base URL: https://campaign.api.bingads.microsoft.com/v13
 * 
 * Microsoft Ads uses SOAP protocol. This implementation constructs
 * proper SOAP envelopes for the Campaign Management service.
 * 
 * Key operations:
 * - GetAccountsInfo — List ad accounts
 * - GetCampaignsByAccountId — List campaigns
 * - GetCampaignStats — Campaign analytics
 * 
 * OAuth scopes needed:
 * - https://ads.microsoft.com/ads.manage
 */
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

  /**
   * Build a SOAP envelope for the Campaign Management service.
   */
  _buildSoapEnvelope(bodyContent) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header>
    <AuthenticationToken xmlns="https://ad.microsoft.com/api/customermanagement">${this._getToken()}</AuthenticationToken>
    <DeveloperToken xmlns="https://ad.microsoft.com/api/customermanagement">${this.developerToken}</DeveloperToken>
    <CustomerId xmlns="https://ad.microsoft.com/api/customermanagement">${this.customerId}</CustomerId>
    <AccountId xmlns="https://ad.microsoft.com/api/customermanagement">${this.accountId}</AccountId>
  </soap:Header>
  <soap:Body>
    ${bodyContent}
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Execute a SOAP request against the Microsoft Ads API.
   */
  async _soapRequest(action, bodyContent) {
    const envelope = this._buildSoapEnvelope(bodyContent);
    
    try {
      const response = await fetch(`${this._baseUrl}/CampaignManagement/v13/CampaignManagementService.svc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `https://ad.microsoft.com/api/customermanagement/${action}`,
        },
        body: envelope,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Microsoft Ads API error ${response.status}: ${errorText.substring(0, 500)}`);
      }

      const responseText = await response.text();
      return this._parseSoapResponse(responseText);
    } catch (err) {
      log.error('Microsoft Ads SOAP request failed', { error: err.message, action });
      throw err;
    }
  }

  /**
   * Parse SOAP XML response into JSON.
   */
  _parseSoapResponse(xml) {
    // Simple XML parsing for SOAP responses
    const result = {};
    
    // Extract AccountInfo elements
    const accountMatches = xml.match(/<AccountInfo[\s\S]*?<\/AccountInfo>/g);
    if (accountMatches) {
      result.accounts = accountMatches.map(acc => {
        const idMatch = acc.match(/<Id>(\d+)<\/Id>/);
        const nameMatch = acc.match(/<Name>([^<]+)<\/Name>/);
        const statusMatch = acc.match(/<Status>([^<]+)<\/Status>/);
        return {
          id: idMatch?.[1],
          name: nameMatch?.[1],
          status: statusMatch?.[1]?.toLowerCase(),
        };
      });
    }

    // Extract Campaign elements
    const campaignMatches = xml.match(/<Campaign[\s\S]*?<\/Campaign>/g);
    if (campaignMatches) {
      result.campaigns = campaignMatches.map(camp => {
        const idMatch = camp.match(/<Id>(\d+)<\/Id>/);
        const nameMatch = camp.match(/<Name>([^<]+)<\/Name>/);
        const statusMatch = camp.match(/<Status>([^<]+)<\/Status>/);
        const budgetMatch = camp.match(/<DailyBudget>([^<]+)<\/DailyBudget>/);
        return {
          id: idMatch?.[1],
          name: nameMatch?.[1],
          status: statusMatch?.[1]?.toLowerCase(),
          budget: budgetMatch?.[1] ? parseFloat(budgetMatch[1]) : 0,
        };
      });
    }

    return result;
  }

  /**
   * Get all ad accounts accessible to the authenticated user.
   * SOAP Action: GetAccountsInfo
   */
  async getAdAccounts() {
    try {
      const body = `
        <GetAccountsInfoRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <CustomerId>${this.customerId}</CustomerId>
        </GetAccountsInfoRequest>
      `;
      
      const result = await this._soapRequest('GetAccountsInfo', body);
      return result.accounts || [];
    } catch (err) {
      log.error('Failed to list Microsoft ad accounts', { error: err.message });
      return [];
    }
  }

  async getAccounts() { return this.getAdAccounts(); }

  /**
   * Get campaigns for a specific account.
   * SOAP Action: GetCampaignsByAccountId
   */
  async getCampaigns(accountId, { limit: _limit } = {}) {
    try {
      const body = `
        <GetCampaignsByAccountIdRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <AccountId>${accountId}</AccountId>
          <CampaignType>Search Shopping</CampaignType>
        </GetCampaignsByAccountIdRequest>
      `;
      
      const result = await this._soapRequest('GetCampaignsByAccountId', body);
      return result.campaigns || [];
    } catch (err) {
      log.error('Failed to get Microsoft campaigns', { error: err.message, accountId });
      return [];
    }
  }

  /**
   * Get campaign analytics/insights.
   * SOAP Action: GetCampaignStats
   */
  async getCampaignInsights(accountId, campaignId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const body = `
        <GetCampaignStatsRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <AccountId>${accountId}</AccountId>
          <CampaignId>${campaignId}</CampaignId>
          <StartDate>${dateRange.start}</StartDate>
          <EndDate>${dateRange.end}</EndDate>
          <StatType>Performance</StatType>
        </GetCampaignStatsRequest>
      `;
      
      const result = await this._soapRequest('GetCampaignStats', body);
      if (!result.stats) return null;
      
      const stats = result.stats;
      return {
        campaignId,
        spend: parseFloat(stats.Spend) || 0,
        impressions: parseInt(stats.Impressions) || 0,
        clicks: parseInt(stats.Clicks) || 0,
        conversions: parseInt(stats.Conversions) || 0,
        ctr: parseFloat(stats.Ctr) || 0,
        averageCpc: parseFloat(stats.AverageCpc) || 0,
      };
    } catch (err) {
      log.error('Failed to get Microsoft campaign insights', { error: err.message, campaignId });
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

  /**
   * Get account-level insights.
   */
  async getAccountInsights(accountId, { startDate, endDate } = {}) {
    try {
      const dateRange = this._buildDateRange(startDate, endDate);
      const body = `
        <GetAccountStatsRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <AccountId>${accountId}</AccountId>
          <StartDate>${dateRange.start}</StartDate>
          <EndDate>${dateRange.end}</EndDate>
          <StatType>Performance</StatType>
        </GetAccountStatsRequest>
      `;
      
      const result = await this._soapRequest('GetAccountStats', body);
      if (!result.stats) return null;
      
      const stats = result.stats;
      return {
        accountId,
        spend: parseFloat(stats.Spend) || 0,
        impressions: parseInt(stats.Impressions) || 0,
        clicks: parseInt(stats.Clicks) || 0,
        conversions: parseInt(stats.Conversions) || 0,
        ctr: parseFloat(stats.Ctr) || 0,
        averageCpc: parseFloat(stats.AverageCpc) || 0,
      };
    } catch (err) {
      log.error('Failed to get Microsoft account insights', { error: err.message, accountId });
      return null;
    }
  }

  /**
   * Update campaign status.
   * SOAP Action: UpdateCampaign
   */
  async updateCampaign(accountId, campaignId, { status, budget } = {}) {
    try {
      const body = `
        <UpdateCampaignRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <AccountId>${accountId}</AccountId>
          <Campaign>
            <Id>${campaignId}</Id>
            <Status>${this._reverseMapStatus(status)}</Status>
            ${budget ? `<DailyBudget>${budget}</DailyBudget>` : ''}
          </Campaign>
        </UpdateCampaignRequest>
      `;
      
      await this._soapRequest('UpdateCampaign', body);
      return { id: campaignId, updated: true };
    } catch (err) {
      log.error('Failed to update Microsoft campaign', { error: err.message, campaignId });
      return { id: campaignId, updated: false, error: err.message };
    }
  }

  /**
   * Create a new campaign.
   * SOAP Action: AddCampaign
   */
  async createCampaign(accountId, data = {}) {
    try {
      const body = `
        <AddCampaignRequest xmlns="https://ad.microsoft.com/api/customermanagement">
          <AccountId>${accountId}</AccountId>
          <Campaigns>
            <Campaign>
              <Name>${data.name || `Campaign ${Date.now()}`}</Name>
              <Status>Paused</Status>
              <DailyBudget>${data.budget || 10}</DailyBudget>
              <BudgetType>DailyBudgetStandard</BudgetType>
            </Campaign>
          </Campaigns>
        </AddCampaignRequest>
      `;
      
      const result = await this._soapRequest('AddCampaign', body);
      return {
        campaignId: result.campaigns?.[0]?.id || null,
        name: data.name || `Campaign ${Date.now()}`,
        status: 'paused',
      };
    } catch (err) {
      log.error('Failed to create Microsoft campaign', { error: err.message, accountId });
      return { campaignId: null, error: err.message };
    }
  }

  async syncAllAccounts() {
    try {
      const accounts = await this.getAdAccounts();
      const results = [];
      
      for (const account of accounts) {
        const campaigns = await this.getCampaigns(account.id);
        results.push({
          account,
          campaigns,
          campaignCount: campaigns.length,
        });
      }
      
      return results;
    } catch (err) {
      log.error('Failed to sync Microsoft accounts', { error: err.message });
      throw err;
    }
  }

  _buildDateRange(startDate, endDate) {
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { start, end };
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
