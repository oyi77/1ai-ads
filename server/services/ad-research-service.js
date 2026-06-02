/**
 * Ad Research Service
 *
 * Menyerap capabilities dari ads-manager skill:
 *   - Competitive ad research via Ads Library API & MCP
 *   - Trending ads analysis
 *   - Cross-platform campaign research
 *   - Creative pattern analysis
 *
 * Integrates with:
 *   - existing ad-research.js for core Ads Library/Meta search
 *   - mcp-client.js for external MCP integrations (exa, firecrawl, apify)
 *   - competitor-spy.js for competitor monitoring
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('ad-research');

export class AdResearchService {
  /**
   * @param {object} deps
   * @param {import('./meta-api.js').MetaAdsAPI} deps.metaApi - Meta API client
   * @param {object} [deps.mcpClient] - MCP client for external tool integration
   * @param {object} [deps.db] - Database instance for caching
   */
  constructor({ metaApi, mcpClient, db } = {}) {
    this.metaApi = metaApi;
    this.mcpClient = mcpClient;
    this.db = db;
  }

  /**
   * Search trending ads across platforms
   * Wraps both Meta Ads Library and external search
   *
   * @param {object} options
   * @param {string} options.query - Search terms
   * @param {string} [options.country='ID'] - Country code
   * @param {number} [options.limit=20] - Results limit
   * @param {'api'|'scrape'|'auto'} [options.source='api'] - Data source
   * @returns {Promise<{success: boolean, data: Array, source: string, error?: string}>}
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
    return { success: true, data: { pageId, source: result.source, page: result.page, totalAds: 0, ads: [], patterns: null, note: 'Ads Archive API returned page info only. Full ad data requires Ads Library API access.' } };
  }

  /**
   * Search pages by keyword
   *
   * @param {string} query - Search query
   * @returns {Promise<{success: boolean, data: Array, error?: string}>}
   */
  async searchPages(query) {
    try {
      const pages = await this.metaApi.searchPages(query);
      return { success: true, data: pages };
    } catch (err) {
      return { success: false, data: [], error: err.message };
    }
  }

  /**
   * Get targeting suggestions for a product
   *
   * @param {string} interest - Interest keyword
   * @returns {Promise<{success: boolean, data: Array, error?: string}>}
   */
  async getTargetingSuggestions(interest) {
    try {
      const options = await this.metaApi.getTargetingOptions(interest);
      return { success: true, data: options };
    } catch (err) {
      return { success: false, data: [], error: err.message };
    }
  }

  /**
   * Extract common patterns from a set of ads
   */
  _extractPatterns(ads) {
    const bodyLengths = [];
    const platforms = {};

    for (const ad of ads) {
      this._collectBodyLengths(ad, bodyLengths);
      this._countPlatforms(ad, platforms);
    }

    return {
      adCount: ads.length,
      avgBodyLength: this._avg(bodyLengths),
      platformDistribution: Object.keys(platforms).length > 0 ? platforms : null,
      hasMultipleVariants: bodyLengths.length > ads.length,
    };
  }

  _collectBodyLengths(ad, lengths) {
    for (const body of ad.ad_creative_bodies || []) {
      lengths.push(body.length);
    }
  }

  _countPlatforms(ad, counts) {
    for (const p of ad.publisher_platforms || []) {
      counts[p] = (counts[p] || 0) + 1;
    }
  }

  _avg(nums) {
    return nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  }

  /**
   * Search ads via external MCP tools
   */
  async _searchViaMCP(query, country, limit) {
    if (!this.mcpClient || !this.mcpClient.callTool) {
      return [];
    }

    try {
      const result = await this.mcpClient.callTool('search_ads', {
        query,
        country,
        limit,
      });
      return result?.content || [];
    } catch (err) {
      log.debug('Trending content fetch failed', { error: err.message });
      return [];
    }
  }
}
