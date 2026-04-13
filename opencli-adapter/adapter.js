/**
 * AdForge OpenCLI Adapter
 *
 * Transforms AdForge web application into a universal CLI interface.
 * Features:
 * - Campaign management (create, list, sync)
 * - Ads library search across multiple platforms (Meta, Google, TikTok, etc.)
 * - Competitor spy and analysis
 * - Trending and market research
 * - Free research using public ad libraries
 * - No API keys required for core features
 */

import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// AdForge API Configuration
const API_BASE = process.env.ADFORGE_CLI_API_URL || 'http://localhost:3001/api';

/**
 * AdForge OpenCLI Adapter
 * Exposes all AdForge functionality as CLI commands
 */
export class AdForgeAdapter {
  constructor(apiUrl = API_BASE, auth = {}) {
    this.apiUrl = apiUrl;
    this.auth = {
      token: auth.token || process.env.ADFORGE_CLI_TOKEN,
      username: auth.username,
    };
    this.headers = {};
    this._updateAuthHeader();
  }

  _updateAuthHeader() {
    if (this.auth.token) {
      this.headers['Authorization'] = `Bearer ${this.auth.token}`;
    } else {
      delete this.headers['Authorization'];
    }
  }

  /**
   * API Request Methods
   */
  async _request(method, endpoint, body = null, query = {}) {
    const url = new URL(`${this.apiUrl}${endpoint}`);

    // Add query parameters
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...this.headers },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  // ================================
  // AUTHENTICATION
  // ================================

  /**
   * Login and authenticate with AdForge
   */
  async login(credentials) {
    const { username, password } = credentials;

    const result = await this._request('POST', '/api/auth/login', {
      username,
      password,
    });

    this.auth.token = result.token;
    this.auth.username = result.username;
    this._updateAuthHeader();

    console.log(`✓ Logged in as ${result.username}`);

    return {
      token: result.token,
      username: result.username,
      plan: result.plan || 'free',
    };
  }

  /**
   * Check authentication status
   */
  async status() {
    if (!this.auth.token) {
      console.log('Not authenticated');
      return { authenticated: false };
    }

    try {
      const result = await this._request('GET', '/api/auth/status');
      return { authenticated: true, ...result };
    } catch (error) {
      return { authenticated: false, error: error.message };
    }
  }

  // ================================
  // CAMPAIGNS
  // ================================

  /**
   * List all campaigns across connected platforms
   */
  async listCampaigns(options = {}) {
    const { platform, status, limit = 20 } = options;
    const query = {};

    if (platform) query.platform = platform;
    if (status) query.status = status;
    if (limit) query.limit = limit;

    const result = await this._request('GET', '/api/campaigns', null, query);

    return this._formatCampaigns(result.data || []);
  }

  /**
   * Get detailed campaign information
   */
  async getCampaign(id) {
    const result = await this._request('GET', `/api/campaigns/${id}`);

    return this._formatCampaign(result.data);
  }

  /**
   * Create a new campaign
   */
  async createCampaign(campaign) {
    const result = await this._request('POST', '/api/campaigns', campaign);

    console.log(`✓ Campaign created: ${result.data.name}`);
    return this._formatCampaign(result.data);
  }

  /**
   * Update an existing campaign
   */
  async updateCampaign(id, updates) {
    const result = await this._request('PUT', `/api/campaigns/${id}`, updates);

    console.log(`✓ Campaign updated: ${result.data.name}`);
    return this._formatCampaign(result.data);
  }

  /**
   * Sync campaigns from connected platforms
   */
  async syncCampaigns(platform) {
    const result = await this._request('POST', `/api/platforms/${platform}/sync`);

    console.log(`✓ Synced ${platform} campaigns`);
    return result;
  }

  _formatCampaigns(campaigns) {
    if (!Array.isArray(campaigns)) {
      return [];
    }

    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      status: c.status,
      objective: c.objective,
      budget: c.budget,
      spend: c.spend || 0,
      revenue: c.revenue || 0,
      impressions: c.impressions || 0,
      clicks: c.clicks || 0,
      conversions: c.conversions || 0,
      roas: c.roas || 0,
      ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00',
      createdAt: c.created_at,
    }));
  }

  _formatCampaign(campaign) {
    return {
      id: campaign.id,
      name: campaign.name,
      platform: campaign.platform,
      status: campaign.status,
      objective: campaign.objective,
      budget: campaign.budget,
      spend: campaign.spend || 0,
      revenue: campaign.revenue || 0,
      impressions: campaign.impressions || 0,
      clicks: campaign.clicks || 0,
      conversions: campaign.conversions || 0,
      roas: campaign.roas || 0,
      ctr: campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : '0.00',
      createdAt: campaign.created_at,
    };
  }

  // ================================
  // ADS LIBRARY SEARCH
  // ================================

  /**
   * Search ads library from multiple platforms
   * Supports free public libraries (Meta Ad Library, Facebook Ads Library)
   */
  async searchAdsLibrary(options = {}) {
    const {
      query,
      platform = 'meta',
      country = 'US',
      limit = 30,
    } = options;

    // Normalize platform name
    const platformMap = {
      'meta': 'meta',
      'facebook': 'meta',
      'instagram': 'meta',
      'google': 'google',
      'tiktok': 'tiktok',
      'all': 'all',
    };

    const normalizedPlatform = platformMap[platform.toLowerCase()] || 'meta';

    const result = await this._request('GET', '/api/meta/ad-library', null, {
      q: query,
      country,
      limit,
    });

    return {
      platform: normalizedPlatform,
      query,
      ads: result.data || [],
      count: (result.data || []).length,
    };
  }

  /**
   * Get ads from a specific competitor page
   */
  async getCompetitorAds(pageId, platform = 'all') {
    const result = await this._request('GET', `/api/meta/page-ads/${pageId}`, null, {
      platform,
    });

    return {
      platform,
      ads: result.data?.ads || [],
      source: result.data?.source || 'page_info',
    };
  }

  /**
   * Search competitor pages
   */
  async searchCompetitorPages(query, limit = 10) {
    const result = await this._request('GET', '/api/meta/search-pages', null, {
      q: query,
      limit,
    });

    return {
      query,
      pages: result.data || [],
      count: (result.data || []).length,
    };
  }

  // ================================
  // COMPETITOR SPY
  // ================================

  /**
   * List all tracked competitors
   */
  async listCompetitors() {
    const result = await this._request('GET', '/api/competitor-spy');

    return result.data || [];
  }

  /**
   * Add a new competitor to track
   */
  async addCompetitor(competitor) {
    const { url, platform, name } = competitor;

    const result = await this._request('POST', '/api/competitor-spy', {
      url,
      platform,
    });

    console.log(`✓ Competitor added: ${result.data.url || url}`);
    return result.data;
  }

  /**
   * Get detailed competitor analysis
   */
  async getCompetitorAnalysis(competitorId, platform = 'all') {
    const result = await this._request('GET', `/api/competitor-spy/${competitorId}/metrics`, null, {
      platform,
    });

    return result.data || null;
  }

  /**
   * Analyze competitor strategy
   */
  async analyzeCompetitorStrategy(competitorId, platform = 'all') {
    const result = await this._request('POST', `/api/competitor-spy/${competitorId}/analyze`, null, {
      platform,
    });

    console.log(`✓ Strategy analysis completed for ${competitorId}`);
    return result.data;
  }

  /**
   * Refresh all tracked competitors
   */
  async refreshCompetitors() {
    const result = await this._request('POST', '/api/competitor-spy/refresh');

    console.log(`✓ Refreshed ${result.data.length} competitors`);
    return result;
  }

  /**
   * Remove a competitor
   */
  async removeCompetitor(url) {
    const result = await this._request('DELETE', `/api/competitor-spy/${encodeURIComponent(url)}`);

    console.log(`✓ Competitor removed: ${url}`);
    return result;
  }

  // ================================
  // TRENDING ANALYTICS
  // ================================

  /**
   * Get trending data (internal + external comparison)
   */
  async getTrending(options = {}) {
    const { industry, region, source = 'all' } = options;
    const query = {};

    if (industry) query.industry = industry;
    if (region) query.region = region;

    const result = await this._request('GET', '/api/trending/all', null, query);

    return {
      internal: result.data?.internal || [],
      external: result.data?.external || [],
      total: (result.data?.internal?.length || 0) + (result.data?.external?.length || 0),
    };
  }

  /**
   * Get internal trending only
   */
  async getInternalTrending() {
    const result = await this._request('GET', '/api/trending/internal');

    return result.data || [];
  }

  /**
   * Get external market trends
   */
  async getExternalTrending(options = {}) {
    const { industry, region } = options;
    const query = {};

    if (industry) query.industry = industry;
    if (region) query.region = region;

    const result = await this._request('GET', '/api/trending/external', null, query);

    return result.data || [];
  }

  // ================================
  // CREATIVES MANAGEMENT
  // ================================

  /**
   * List all ads/creatives
   */
  async listCreatives(options = {}) {
    const { platform, status, limit = 20 } = options;
    const query = {};

    if (platform) query.platform = platform;
    if (status) query.status = status;
    if (limit) query.limit = limit;

    const result = await this._request('GET', '/api/ads', null, query);

    return result.data || [];
  }

  /**
   * Create a new ad creative
   */
  async createCreative(creative) {
    const result = await this._request('POST', '/api/ads', creative);

    console.log(`✓ Creative created: ${result.data.name}`);
    return result.data;
  }

  /**
   * Update an existing creative
   */
  async updateCreative(id, updates) {
    const result = await this._request('PUT', `/api/ads/${id}`, updates);

    console.log(`✓ Creative updated: ${result.data.name}`);
    return result.data;
  }

  // ================================
  // ANALYTICS
  // ================================

  /**
   * Get campaign analytics and performance data
   */
  async getAnalytics(options = {}) {
    const { platform, days = 30, campaignId } = options;
    const query = {};

    if (platform) query.platform = platform;

    const endpoint = campaignId
      ? `/api/analytics/campaigns/${campaignId}`
      : '/api/analytics';

    const result = await this._request('GET', endpoint, null, query);

    return result.data || {};
  }

  /**
   * Get performance insights
   */
  async getPerformanceMetrics(campaignId, platform) {
    const result = await this._request('GET', `/api/analytics/campaigns/${campaignId}`, null, {
      platform,
    });

    return result.data || null;
  }

  // ================================
  // SEARCH & DISCOVERY
  // ================================

  /**
   * Discover trending topics and keywords
   */
  async discoverTrends(options = {}) {
    const { industry, category, limit = 10 } = options;
    const query = {};

    if (industry) query.industry = industry;
    if (category) query.category = category;

    const result = await this._request('GET', '/api/trending/internal', null, query);

    return {
      trends: result.data || [],
      count: (result.data || []).length,
    };
  }

  /**
   * Analyze keyword performance
   */
  async analyzeKeywords(keywords, platform = 'all') {
    const result = await this._request('POST', '/api/optimizer/analyze', {
      keywords,
      platform,
    });

    return result.data || {};
  }

  // ================================
  // ACCOUNT MANAGEMENT
  // ================================

  /**
   * List connected platform accounts
   */
  async listAccounts(platform) {
    const result = await this._request('GET', `/api/platforms/${platform}/accounts`);

    return result.data || [];
  }

  /**
   * Sync all accounts
   */
  async syncAccounts() {
    const result = await this._request('POST', '/api/platforms/sync');

    console.log('✓ Accounts synced');
    return result;
  }

  /**
   * Connect a new platform account
   */
  async connectAccount(platform, credentials) {
    const result = await this._request('POST', `/api/platforms/${platform}/connect`, credentials);

    console.log(`✓ ${platform} account connected`);
    return result;
  }

  /**
   * Get account health status
   */
  async getAccountHealth(platform) {
    const result = await this._request('GET', `/api/platforms/${platform}/health`);

    return result.data || {};
  }

  // ================================
  // SETTINGS
  // ================================

  /**
   * Get user settings
   */
  async getSettings() {
    const result = await this._request('GET', '/api/settings');

    return result.data || {};
  }

  /**
   * Update user settings
   */
  async updateSettings(settings) {
    const result = await this._request('PUT', '/api/settings', settings);

    console.log('✓ Settings updated');
    return result;
  }

  /**
   * Get platform credentials status
   */
  async getCredentialsStatus() {
    const platforms = ['meta', 'google', 'tiktok'];
    const status = {};

    for (const platform of platforms) {
      try {
        const result = await this._request('GET', `/api/settings/credentials/${platform}`);
        status[platform] = {
          configured: result.data?.configured || false,
          lastChecked: new Date().toISOString(),
        };
      } catch (error) {
        status[platform] = {
          configured: false,
          error: error.message,
        };
      }
    }

    return status;
  }

  // ================================
  // EXPORT & REPORTING
  // ================================

  /**
   * Export campaigns data to CSV
   */
  async exportCampaigns(options = {}) {
    const { format = 'csv', platform } = options;

    const campaigns = await this.listCampaigns({ platform });

    if (format === 'json') {
      console.log(JSON.stringify(campaigns, null, 2));
      return { data: campaigns, format: 'json' };
    }

    // Generate CSV
    const headers = ['ID', 'Name', 'Platform', 'Status', 'Objective', 'Budget', 'Spend', 'Revenue', 'ROAS', 'CTR', 'Impressions', 'Clicks', 'Conversions'];
    const rows = campaigns.map(c => [
      c.id,
      c.name,
      c.platform,
      c.status,
      c.objective,
      c.budget,
      c.spend,
      c.revenue,
      c.roas?.toFixed(2) || '0.00',
      c.ctr,
      c.impressions,
      c.clicks,
      c.conversions,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    console.log(csvContent);

    return { data: campaigns, format: 'csv', content: csvContent };
  }

  /**
   * Generate performance report
   */
  async generateReport(type, options = {}) {
    const { startDate, endDate, platform, campaignId } = options;
    let data;

    switch (type) {
      case 'campaign':
        data = await this.getCampaign(campaignId);
        break;
      case 'competitor':
        data = await this.getCompetitorAnalysis(campaignId, platform);
        break;
      case 'trending':
        data = await this.getTrending({ industry: options.industry, region: options.region });
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    console.log(`✓ ${type} report generated`);
    return { type, data, generatedAt: new Date().toISOString() };
  }

  /**
   * Save report to file
   */
  async saveReport(report, filePath) {
    const fullPath = join(process.cwd(), filePath);
    await open(fullPath, 'w').then(async (file) => {
      await file.write(JSON.stringify(report, null, 2));
      console.log(`✓ Report saved to ${fullPath}`);
    });
  }
}

// Export for use in OpenCLI
export { AdForgeAdapter };
