/**
 * Google Ads API client (REST, no Python dependency).
 * Base URL: https://googleads.googleapis.com/v18
 * Auth: OAuth 2.0 access token + developer token
 * Docs: https://developers.google.com/google-ads/api/docs/start
 *
 * Free to use - you only pay for ad spend.
 * Requires: Google Ads account + developer token (apply at Google Ads > Tools > API Center).
 * Developer token approval: 1-3 business days.
 */

const BASE = 'https://googleads.googleapis.com/v18';

export class GoogleAdsAPI {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  _getConfig() {
    const creds = this.settingsRepo.getCredentials('google');
    if (!creds?.developer_token) {
      throw new Error('Google Ads developer token not configured. Go to Settings > Google Ads. Get one at Google Ads > Tools > API Center.');
    }
    if (!creds?.oauth_token) {
      throw new Error('Google Ads OAuth token not configured. Complete OAuth flow in Settings.');
    }
    return creds;
  }

  async _query(customerId, gaql) {
    const creds = this._getConfig();
    const res = await fetch(`${BASE}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.oauth_token}`,
        'developer-token': creds.developer_token,
        'Content-Type': 'application/json',
        ...(creds.login_customer_id && { 'login-customer-id': creds.login_customer_id }),
      },
      body: JSON.stringify({ query: gaql }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Google Ads API: ${data.error.message}`);
    // searchStream returns array of result batches
    const results = [];
    for (const batch of (data || [])) {
      if (batch.results) results.push(...batch.results);
    }
    return results;
  }

  async listAccounts() {
    const creds = this._getConfig();
    const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
      headers: {
        'Authorization': `Bearer ${creds.oauth_token}`,
        'developer-token': creds.developer_token,
      },
    });
    const data = await res.json();
    if (data.error) throw new Error(`Google Ads API: ${data.error.message}`);
    return (data.resourceNames || []).map(r => r.replace('customers/', ''));
  }

  async getCampaigns(customerId) {
    return this._query(customerId, `
      SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros,
             campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
      LIMIT 100
    `);
  }

  async getCampaignPerformance(customerId, { days = 30 } = {}) {
    return this._query(customerId, `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.ctr, metrics.average_cpc, metrics.conversions,
             metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date DURING LAST_${days}_DAYS
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 100
    `);
  }

  async getAdPerformance(customerId, { days = 30 } = {}) {
    return this._query(customerId, `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.name,
             ad_group_ad.ad.final_urls, ad_group_ad.ad.type,
             ad_group_ad.ad.responsive_search_ad.headlines,
             ad_group_ad.ad.responsive_search_ad.descriptions,
             metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros
      FROM ad_group_ad
      WHERE segments.date DURING LAST_${days}_DAYS
      ORDER BY metrics.impressions DESC
      LIMIT 50
    `);
  }
}
