/**
 * Ad Research Service
 *
 * Unified service for competitive ad research:
 *   - Direct Meta Ads Library API search (ads_archive endpoint)
 *   - Trending ads via Meta API and MCP
 *   - Competitor page analysis
 *   - Creative pattern analysis
 *   - Page resolution and targeting suggestions
 *
 * Integrates with:
 *   - meta-api.js for Ads Library and page lookups
 *   - mcp-client.js for external MCP integrations (exa, firecrawl, apify)
 */

import { createLogger } from '../lib/logger.js';
import { ConfigurationError } from '../lib/errors.js';

const log = createLogger('ad-research');

export class AdResearchService {
  /**
   * @param {object} deps
   * @param {import('./meta/index.js').MetaAdsAPI} deps.metaApi - Meta API client
   * @param {object} [deps.settingsRepo] - Settings repository for direct API calls
   * @param {object} [deps.mcpClient] - MCP client for external tool integration
   * @param {object} [deps.db] - Database instance for caching
   */
  constructor({ metaApi, settingsRepo, mcpClient, db } = {}) {
    this.metaApi = metaApi;
    this.settingsRepo = settingsRepo || metaApi?.settingsRepo;
    this.mcpClient = mcpClient;
    this.db = db;
  }

  // ── Direct Meta Ads Library API ──────────────────────────────────

  /**
   * Search ads by keyword across the Meta Ad Library.
   */
  async searchAds({ query, country = 'ID', activeStatus = 'ALL', mediaType, limit = 50 }) {
    if (!query) throw new Error('Search query is required');
    log.info('Searching Meta Ad Library', { query, country, limit });

    // Prefer direct API call if we have credentials
    if (this.settingsRepo) {
      return this._searchDirectApi({ query, country, activeStatus, mediaType, limit });
    }

    // Fall back to metaApi
    const ads = await this.metaApi.getAdLibrary({ query, country, limit });
    return { ads: ads || [], total: (ads || []).length, hasMore: false };
  }

  async _searchDirectApi({ query, country, activeStatus, mediaType, limit }) {
    const { ConfigurationError: ConfigErr } = await import('../lib/errors.js');
    const config = (await import('../config/index.js')).default;
    const GRAPH_API_BASE = `https://graph.facebook.com/${config.metaApiVersion}`;
    const FIELDS = [
      'id', 'page_name', 'page_id',
      'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
      'ad_snapshot_url', 'ad_delivery_start_time', 'ad_delivery_stop_time',
      'publisher_platforms', 'languages', 'estimated_audience_size',
      'spend', 'impressions', 'currency',
    ].join(',');

    const token = this._getToken();
    const params = new URLSearchParams({
      search_terms: query, ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus, ad_type: 'ALL', fields: FIELDS,
      limit: String(Math.min(limit, 500)), access_token: token,
    });
    if (mediaType && mediaType !== 'ALL') params.set('media_type', mediaType);

    const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new ConfigErr(`Meta API error: ${data.error.message}`);

    const result = {
      ads: (data.data || []).map(this._formatDirectAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
      nextCursor: data.paging?.cursors?.after || null,
    };
    log.info('Ad search completed', { total: result.total, hasMore: result.hasMore });
    return result;
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('meta');
      if (!creds?.access_token) {
        throw new ConfigurationError('Meta access token not configured');
      }
      return creds.access_token;
    }
    throw new ConfigurationError('Meta access token not configured');
  }

  _formatDirectAd(ad) {
    return {
      id: ad.id, pageName: ad.page_name, pageId: ad.page_id,
      bodies: ad.ad_creative_bodies || [],
      titles: ad.ad_creative_link_titles || [],
      descriptions: ad.ad_creative_link_descriptions || [],
      captions: ad.ad_creative_link_captions || [],
      snapshotUrl: ad.ad_snapshot_url,
      deliveryStart: ad.ad_delivery_start_time,
      deliveryStop: ad.ad_delivery_stop_time,
      platforms: ad.publisher_platforms || [],
      languages: ad.languages || [],
      audienceSize: ad.estimated_audience_size || null,
      spend: ad.spend || null, impressions: ad.impressions || null, currency: ad.currency || null,
    };
  }

  // ── Trending & Cross-Platform Search ────────────────────────────

  /**
   * Search trending ads across platforms.
   * Wraps both Meta Ads Library and external search.
   */
  async searchTrendingAds({ query, country = 'ID', limit = 20, source = 'api' }) {
    log.info('Searching trending ads', { query, country, source });
    try {
      const apiResult = await this._tryApiSearch(query, country, limit, source);
      if (apiResult) return apiResult;

      const mcpResult = await this._tryMcpSearch(query, country, limit, source);
      if (mcpResult) return mcpResult;

      return { success: true, data: [], source };
    } catch (err) {
      log.error('Trending ads search failed', { error: err.message });
      return { success: false, data: [], source, error: err.message };
    }
  }

  async _tryApiSearch(query, country, limit, source) {
    if (source !== 'api' && source !== 'auto') return null;
    const ads = await this.metaApi.getAdLibrary({ query, country, limit });
    return ads?.length > 0 ? { success: true, data: ads, source: 'meta_ads_archive' } : null;
  }

  async _tryMcpSearch(query, country, limit, source) {
    if (!this.mcpClient || (source !== 'scrape' && source !== 'auto')) return null;
    try {
      const mcpResult = await this._searchViaMCP(query, country, limit);
      return mcpResult?.length > 0 ? { success: true, data: mcpResult, source: 'mcp' } : null;
    } catch (mcpErr) {
      log.warn('MCP search failed', { error: mcpErr.message });
      return null;
    }
  }

  // ── Competitor Analysis ─────────────────────────────────────────

  async analyzeCompetitor({ pageId, limit = 20 }) {
    log.info('Analyzing competitor', { pageId });
    try {
      const result = await this.metaApi.getPageAds(pageId);
      return result.source === 'ads_archive'
        ? this._buildArchiveResult(pageId, result, limit)
        : this._buildPageOnlyResult(pageId, result);
    } catch (err) {
      log.error('Competitor analysis failed', { pageId, error: err.message });
      return { success: false, data: null, error: err.message };
    }
  }

  _buildArchiveResult(pageId, result, limit) {
    const ads = (result.ads || []).slice(0, limit);
    return { success: true, data: { pageId, source: result.source, totalAds: result.ads?.length || 0, ads, patterns: this._extractPatterns(ads) } };
  }

  _buildPageOnlyResult(pageId, result) {
    return { success: true, data: { pageId, source: result.source, page: result.page, totalAds: 0, ads: [], patterns: null, note: 'Full ad data requires Ads Library API access.' } };
  }

  // ── Page & Targeting ────────────────────────────────────────────

  /**
   * Search ads by page ID (competitor page).
   */
  async searchByPage({ pageId, country = 'ID', limit = 100 }) {
    if (!pageId) throw new Error('Page ID is required');
    log.info('Searching ads by page', { pageId, country, limit });

    const config = (await import('../config/index.js')).default;
    const GRAPH_API_BASE = `https://graph.facebook.com/${config.metaApiVersion}`;
    const FIELDS = [
      'id', 'page_name', 'page_id',
      'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
      'ad_snapshot_url', 'ad_delivery_start_time', 'ad_delivery_stop_time',
      'publisher_platforms', 'languages', 'estimated_audience_size',
      'spend', 'impressions', 'currency',
    ].join(',');

    const token = this._getToken();
    const params = new URLSearchParams({
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: 'ALL', ad_type: 'ALL', fields: FIELDS,
      limit: String(Math.min(limit, 500)), access_token: token,
    });

    const url = `${GRAPH_API_BASE}/${pageId}/ads?${params}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API error: ${data.error.message}`);

    const result = {
      ads: (data.data || []).map(this._formatDirectAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
      nextCursor: data.paging?.cursors?.after || null,
    };
    log.info('Page ad search completed', { pageId, total: result.total, hasMore: result.hasMore });
    return result;
  }

  /**
   * Resolve a page ID from a page name or URL.
   */
  async resolvePageId(pageNameOrUrl) {
    if (!pageNameOrUrl) throw new Error('Page name or URL is required');

    const config = (await import('../config/index.js')).default;
    const GRAPH_API_BASE = `https://graph.facebook.com/${config.metaApiVersion}`;
    const token = this._getToken();
    const searchQuery = pageNameOrUrl.includes('facebook.com')
      ? pageNameOrUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '')
      : pageNameOrUrl;

    const url = `${GRAPH_API_BASE}?fields=id,name,fan_count,category&access_token=${encodeURIComponent(token)}&ids=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      // Try search endpoint as fallback
      const searchUrl = `${GRAPH_API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=page&fields=id,name,fan_count,category&access_token=${encodeURIComponent(token)}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (searchData.error || !searchData.data?.length) {
        throw new Error(`Could not resolve page: ${pageNameOrUrl}`);
      }
      const page = searchData.data[0];
      return { id: page.id, name: page.name, fanCount: page.fan_count, category: page.category };
    }

    // Handle both formats: keyed by ID (real API) or flat object (test mocks)
    if (data.id && data.name) {
      return { id: data.id, name: data.name, fanCount: data.fan_count, category: data.category };
    }

    const entries = Object.values(data);
    if (!entries.length) throw new Error(`Could not resolve page: ${pageNameOrUrl}`);
    const page = entries[0];
    return { id: page.id, name: page.name, fanCount: page.fan_count, category: page.category };
  }

  async searchPages(query) {
    try {
      const pages = await this.metaApi.searchPages(query);
      return { success: true, data: pages };
    } catch (err) {
      return { success: false, data: [], error: err.message };
    }
  }

  async getTargetingSuggestions(interest) {
    try {
      const options = await this.metaApi.getTargetingOptions(interest);
      return { success: true, data: options };
    } catch (err) {
      return { success: false, data: [], error: err.message };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  _extractPatterns(ads) {
    const bodyLengths = [];
    const platforms = {};
    for (const ad of ads) {
      for (const body of ad.ad_creative_bodies || []) bodyLengths.push(body.length);
      for (const p of ad.publisher_platforms || []) platforms[p] = (platforms[p] || 0) + 1;
    }
    return {
      adCount: ads.length,
      avgBodyLength: bodyLengths.length > 0 ? Math.round(bodyLengths.reduce((a, b) => a + b, 0) / bodyLengths.length) : 0,
      platformDistribution: Object.keys(platforms).length > 0 ? platforms : null,
      hasMultipleVariants: bodyLengths.length > ads.length,
    };
  }

  async _searchViaMCP(query, country, limit) {
    if (!this.mcpClient?.callTool) return [];
    try {
      const result = await this.mcpClient.callTool('search_ads', { query, country, limit });
      return result?.content || [];
    } catch (err) {
      log.debug('MCP search failed', { error: err.message });
      return [];
    }
  }
}