/**
 * Unified Ads Library Service
 *
 * Orchestrates platform-specific adapters and scrapers to provide
 * a unified interface for ad research across Meta, Google, and TikTok.
 *
 * Features:
 * - Hybrid data sources: public APIs first, fallback to web scraping
 * - Intelligent caching to reduce duplicate requests
 * - Consistent normalized ad format across all platforms
 * - Rate limiting per platform to avoid blocks
 */

import { createLogger } from '../lib/logger.js';
import { CacheService } from './cache-service.js';

// Platform Adapters
import { MetaAdapter } from './ads-library/meta-adapter.js';
import { GoogleAdapter } from './ads-library/google-adapter.js';
import { TikTokAdapter } from './ads-library/tiktok-adapter.js';

// Platform Scrapers
import { MetaScraper } from './web-scraper/meta-scraper.js';
import { GoogleScraper } from './web-scraper/google-scraper.js';
import { TikTokScraper } from './web-scraper/tiktok-scraper.js';

// Infrastructure
import { PuppeteerPool, RequestQueue } from './web-scraper/base-scraper.js';

const log = createLogger('unified-ads-library');

// Supported platforms
const SUPPORTED_PLATFORMS = ['meta', 'google', 'tiktok'];
const DEFAULT_CACHE_OPTS = { defaultTTL: 3600 * 1000, maxSize: 1000 };
const DEFAULT_POOL_OPTS = { maxInstances: 3, headless: true };
const DEFAULT_QUEUE_OPTS = { requestsPerMinute: 20, maxConcurrent: 3, minDelay: 1000 };

/**
 * @typedef {Object} UnifiedSearchOptions
 * @property {string} [platform='all'] - Platform filter ('meta', 'google', 'tiktok', or 'all')
 * @property {string} [source='auto'] - Data source ('api', 'scrape', 'auto')
 * @property {string} [country='US'] - Country code
 * @property {string} [activeStatus='ALL'] - Ad status filter
 * @property {string} [mediaType] - Media type filter
 * @property {string} [adType] - Ad type filter
 * @property {number} [limit=50] - Max results per platform
 * @property {string} [cursor] - Pagination cursor
 * @property {number} [cacheTTL] - Custom cache TTL in ms
 */

/**
 * @typedef {Object} PlatformSource
 * @property {string} name - Platform name
 * @property {string} displayName - Human-readable name
 * @property {boolean} apiAvailable - Whether API is available
 * @property {boolean} scrapeAvailable - Whether scraping is available
 * @property {Array<Object>} apis - Available API endpoints
 */

export class UnifiedAdsLibraryService {
  /**
   * @param {Object} deps
   * @param {Object} [deps.settingsRepo] - Settings repository for API credentials
   * @param {Object} [deps.cacheService] - Cache service instance (creates default if not provided)
   * @param {Object} [deps.puppeteerPool] - Puppeteer pool for scrapers
   * @param {Object} [deps.requestQueue] - Request queue for rate limiting
   */
  constructor({ settingsRepo, cacheService, puppeteerPool, requestQueue } = {}) {
    this.settingsRepo = settingsRepo;
    this.cacheService = cacheService || new CacheService(DEFAULT_CACHE_OPTS);
    this.puppeteerPool = puppeteerPool || new PuppeteerPool(DEFAULT_POOL_OPTS);
    this.requestQueue = requestQueue || new RequestQueue(DEFAULT_QUEUE_OPTS);
    this._initializeAdapters();
  }

  _createScraper(ScraperClass) {
    return new ScraperClass({ pool: this.puppeteerPool, queue: this.requestQueue });
  }

  _createAdapter(AdapterClass, scraper) {
    return new AdapterClass({
      cacheService: this.cacheService,
      settingsRepo: this.settingsRepo,
      scraper,
    });
  }

  _initializeAdapters() {
    const scrapers = {
      meta: this._createScraper(MetaScraper),
      google: this._createScraper(GoogleScraper),
      tiktok: this._createScraper(TikTokScraper),
    };

    this.adapters = {
      meta: this._createAdapter(MetaAdapter, scrapers.meta),
      google: this._createAdapter(GoogleAdapter, scrapers.google),
      tiktok: this._createAdapter(TikTokAdapter, scrapers.tiktok),
    };

    log.info('Platform adapters initialized', { platforms: Object.keys(this.adapters) });
  }

  /**
   * Search for ads across one or all platforms.
   *
   * @param {string} query - Search query
   * @param {UnifiedSearchOptions} [options] - Search options
   * @returns {Promise<Object>} Unified search results
   */
  async search(query, options = {}) {
    const opts = this._normalizeSearchOpts(options);
    log.info('Unified ads library search', { query, platform: opts.platform, source: opts.source });
    const platforms = this._resolvePlatforms(opts.platform);
    const results = await Promise.allSettled(platforms.map(p => this._searchPlatform(p, query, opts)));
    const platformResults = results.map((r, i) => this._buildPlatformResult(r, platforms[i]));
    return this._aggregateResults(query, platformResults, platforms);
  }

  _normalizeSearchOpts(options) {
    const { platform = 'all', source = 'auto', country = 'US', activeStatus = 'ALL', mediaType, adType, limit = 50, cursor, cacheTTL } = options;
    return { platform, source, country, activeStatus, mediaType, adType, limit, cursor, cacheTTL };
  }

  _resolvePlatforms(platform) {
    if (platform !== 'all' && !SUPPORTED_PLATFORMS.includes(platform.toLowerCase())) {
      throw new Error(`Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
    }
    return platform === 'all' ? SUPPORTED_PLATFORMS : [platform.toLowerCase()];
  }

  _buildPlatformResult(settled, platform) {
    const ok = settled.status === 'fulfilled';
    const data = ok ? settled.value : null;
    return {
      platform,
      adapter: this.adapters[platform]?.displayName || platform,
      source: data?.source || 'unknown',
      ads: data?.ads || [],
      total: data?.total || 0,
      hasMore: data?.hasMore || false,
      nextCursor: data?.nextCursor || null,
      error: ok ? null : settled.reason?.message,
      fromCache: data?.fromCache || false,
    };
  }

  _aggregateResults(query, platformResults, platforms) {
    const allAds = platformResults.flatMap(r => r.ads);
    const anyErrors = platformResults.some(r => r.error);
    const fromCache = platformResults.some(r => r.fromCache);

    log.info('Unified search completed', {
      totalAds: allAds.length, platformsSearched: platforms.length, hasErrors: anyErrors, fromCache,
    });

    return {
      query,
      platforms: platformResults,
      ads: allAds,
      total: allAds.length,
      totalByPlatform: platformResults.reduce((acc, r) => { acc[r.platform] = r.total; return acc; }, {}),
      hasErrors: anyErrors,
      errors: platformResults.filter(r => r.error).map(r => ({ platform: r.platform, error: r.error })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Search a single platform with caching support.
   *
   * @param {string} platform - Platform name
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Platform search result
   * @private
   */
  async _searchPlatform(platform, query, options) {
    const adapter = this.adapters[platform];
    if (!adapter) {
      return {
        platform,
        ads: [],
        total: 0,
        hasMore: false,
        source: 'none',
        error: `Platform ${platform} not available`,
      };
    }

    try {
      // Use cached search if available
      const cachedResult = await adapter.searchAdsCached(query, {
        country: options.country,
        activeStatus: options.activeStatus,
        mediaType: options.mediaType,
        adType: options.adType,
        limit: options.limit,
        source: options.source,
        cacheTTL: options.cacheTTL,
      });

      return cachedResult;
    } catch (error) {
      log.error(`Platform search failed for ${platform}`, {
        error: error.message,
        query,
      });

      return {
        platform,
        ads: [],
        total: 0,
        hasMore: false,
        source: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Get detailed information about a specific ad.
   *
   * @param {string} platform - Platform name
   * @param {string} adId - Ad identifier
   * @returns {Promise<Object>} Ad details
   */
  async getAdDetails(platform, adId) {
    log.info('Getting ad details', { platform, adId });

    const adapter = this.adapters[platform.toLowerCase()];
    if (!adapter) {
      throw new Error(`Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
    }

    try {
      const ad = await adapter.getAdDetails(adId);
      return {
        platform,
        ad,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Failed to get ad details', { platform, adId, error: error.message });

      return {
        platform,
        ad: null,
        error: error.message,
      };
    }
  }

  /**
   * Get available data sources for all or a specific platform.
   *
   * @param {string} [platform] - Platform filter (optional)
   * @returns {Promise<Array<PlatformSource>>}
   */
  async getSources(platform = null) {
    const platforms = platform ? [platform.toLowerCase()] : SUPPORTED_PLATFORMS;

    const sources = platforms.map(p => {
      const adapter = this.adapters[p];
      if (!adapter) {
        return null;
      }

      const apis = adapter.getAvailablePublicAPIs();

      return {
        name: p,
        displayName: adapter.displayName,
        apiAvailable: apis.some(api => api.available && api.requiresAuth === false),
        scrapeAvailable: true, // Scraping always available as fallback
        apis,
        apiConfigured: adapter.hasApiAccess(),
      };
    }).filter(Boolean);

    return sources;
  }

  /**
   * Get platform statistics and status.
   *
   * @returns {Promise<Object>} Platform statistics
   */
  async getStats() {
    const sources = await this.getSources();

    const stats = {
      platforms: SUPPORTED_PLATFORMS.length,
      sources,
      cache: this.cacheService.getStats(),
      puppeteer: this.puppeteerPool.getStats(),
      requestQueue: this.requestQueue.getStats(),
      timestamp: new Date().toISOString(),
    };

    return stats;
  }

  /**
   * Clear cache for a specific platform or all platforms.
   *
   * @param {string} [platform] - Platform filter (optional)
   */
  clearCache(platform = null) {
    if (platform) {
      const prefix = `ads:${platform.toLowerCase()}`;
      this.cacheService.clearByPrefix(prefix);
      log.info('Cleared cache for platform', { platform });
    } else {
      this.cacheService.clear();
      log.info('Cleared all cache');
    }
  }

  /**
   * Clean up resources when shutting down.
   */
  async destroy() {
    log.info('Shutting down unified ads library service');

    await this.puppeteerPool.closeAll();
    this.cacheService.destroy();

    log.info('Unified ads library service shutdown complete');
  }
}

/**
 * Create a singleton instance of the service.
 *
 * @param {Object} options - Service options
 * @returns {UnifiedAdsLibraryService}
 */
export function createUnifiedAdsLibraryService(options = {}) {
  return new UnifiedAdsLibraryService(options);
}
