/**
 * Base Platform Adapter Interface
 *
 * Defines the contract that all platform-specific adapters must implement.
 * Each adapter provides a unified interface for searching ads, getting ad
 * details, and discovering available public APIs for its platform.
 *
 * Usage:
 *   class MyAdapter extends BasePlatformAdapter {
 *     get platformName() { return 'myplatform'; }
 *     async searchAds(query, options) { ... }
 *     async getAdDetails(adId) { ... }
 *     getAvailablePublicAPIs() { ... }
 *   }
 */

import { createLogger } from '../../lib/logger.js';

const log = createLogger('base-adapter');

/**
 * @typedef {Object} AdSearchResult
 * @property {string} platform - Platform name
 * @property {string} source - Data source ('api' or 'scrape')
 * @property {Array<NormalizedAd>} ads - Array of normalized ads
 * @property {number} total - Total number of results
 * @property {boolean} hasMore - Whether more results are available
 * @property {string|null} nextCursor - Pagination cursor
 * @property {string} fetchedAt - ISO timestamp
 */

/**
 * @typedef {Object} NormalizedAd
 * @property {string} id - Unique ad identifier
 * @property {string} platform - Source platform
 * @property {string} pageName - Advertiser page/business name
 * @property {string|null} pageId - Advertiser page ID
 * @property {Array<string>} headlines - Ad headlines
 * @property {Array<string>} descriptions - Ad descriptions
 * @property {string|null} imageUrl - Creative image URL
 * @property {string|null} videoUrl - Creative video URL
 * @property {string|null} landingUrl - Landing page URL
 * @property {string|null} ctaType - Call-to-action type
 * @property {string|null} snapshotUrl - URL to view the ad snapshot
 * @property {string|null} deliveryStart - Ad delivery start date (ISO)
 * @property {string|null} deliveryStop - Ad delivery stop date (ISO)
 * @property {Array<string>} platforms - Publisher platforms (facebook, instagram, etc.)
 * @property {Object|null} spend - Estimated spend range
 * @property {Object|null} impressions - Estimated impressions range
 * @property {string} status - Ad status (active, inactive, all)
 * @property {string} adType - Ad type (image, video, carousel, etc.)
 */

/**
 * @typedef {Object} PublicAPIDescriptor
 * @property {string} name - Human-readable API name
 * @property {string} endpoint - API endpoint URL
 * @property {boolean} requiresAuth - Whether authentication is required
 * @property {string} rateLimit - Rate limit description
 * @property {boolean} available - Whether the API is currently accessible
 */

/**
 * Abstract base class for platform adapters.
 * Subclasses MUST override all methods that throw NotImplementedError.
 */
export class BasePlatformAdapter {
  /**
   * @param {Object} deps
   * @param {import('../cache-service.js').CacheService} deps.cacheService - Cache service instance
   * @param {Object} [deps.settingsRepo] - Settings repository for API credentials
   */
  constructor({ cacheService, settingsRepo } = {}) {
    if (new.target === BasePlatformAdapter) {
      throw new Error('BasePlatformAdapter cannot be instantiated directly. Use a platform-specific adapter.');
    }
    this.cacheService = cacheService;
    this.settingsRepo = settingsRepo;
  }

  /**
   * Platform identifier. Must be overridden by subclasses.
   * @returns {string} Lowercase platform name (e.g., 'meta', 'google', 'tiktok')
   */
  get platformName() {
    throw new Error(`${this.constructor.name} must implement platformName getter`);
  }

  /**
   * Human-readable platform display name.
   * @returns {string}
   */
  get displayName() {
    return this.platformName.charAt(0).toUpperCase() + this.platformName.slice(1);
  }

  /**
   * Search for ads on this platform.
   *
   * @param {string} query - Search query string
   * @param {Object} [options] - Search options
   * @param {string} [options.country='US'] - Country code for ad targeting
   * @param {string} [options.activeStatus='ALL'] - Ad active status filter ('ACTIVE', 'INACTIVE', 'ALL')
   * @param {string} [options.mediaType] - Media type filter ('IMAGE', 'VIDEO', 'ALL')
   * @param {string} [options.adType] - Ad type filter
   * @param {number} [options.limit=50] - Maximum number of results
   * @param {string} [options.cursor] - Pagination cursor for next page
   * @param {string} [options.source='api'] - Preferred data source ('api', 'scrape', 'auto')
   * @returns {Promise<AdSearchResult>} Search results
   */
  async searchAds(query, options = {}) {
    throw new Error(`${this.constructor.name} must implement searchAds(query, options)`);
  }

  /**
   * Get detailed information about a specific ad.
   *
   * @param {string} adId - Platform-specific ad identifier
   * @returns {Promise<NormalizedAd>} Detailed ad information
   */
  async getAdDetails(adId) {
    throw new Error(`${this.constructor.name} must implement getAdDetails(adId)`);
  }

  /**
   * Get list of available public API endpoints for this platform.
   *
   * @returns {Array<PublicAPIDescriptor>} Available APIs
   */
  getAvailablePublicAPIs() {
    throw new Error(`${this.constructor.name} must implement getAvailablePublicAPIs()`);
  }

  /**
   * Check if this adapter has valid API credentials configured.
   *
   * @returns {boolean}
   */
  hasApiAccess() {
    return false;
  }

  /**
   * Search ads with caching. Wraps searchAds with cache lookup/store.
   *
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @param {number} [options.cacheTTL] - Custom cache TTL in ms
   * @returns {Promise<AdSearchResult>} Search results (possibly cached)
   */
  async searchAdsCached(query, options = {}) {
    if (!this.cacheService) {
      return this.searchAds(query, options);
    }

    const cacheKey = this.cacheService.buildKey(this.platformName, query, {
      country: options.country || 'US',
      status: options.activeStatus || 'ALL',
      type: options.adType || 'ALL',
      limit: options.limit || 50,
      source: options.source || 'auto',
    });

    const cached = this.cacheService.get(cacheKey);
    if (cached) {
      log.debug('Returning cached ads', { platform: this.platformName, query });
      return { ...cached, fromCache: true };
    }

    const result = await this.searchAds(query, options);
    const ttl = options.cacheTTL;
    this.cacheService.set(cacheKey, result, ttl);

    return result;
  }

  /**
   * Normalize a platform-specific ad into the standard format.
   * Subclasses should override this to map their specific fields.
   *
   * @param {Object} rawAd - Platform-specific ad object
   * @returns {NormalizedAd} Normalized ad
   */
  _normalizeAd(rawAd) {
    return {
      id: rawAd.id || '',
      platform: this.platformName,
      pageName: rawAd.pageName || rawAd.page_name || '',
      pageId: rawAd.pageId || rawAd.page_id || null,
      headlines: rawAd.headlines || rawAd.ad_creative_link_titles || [],
      descriptions: rawAd.descriptions || rawAd.ad_creative_bodies || [],
      imageUrl: rawAd.imageUrl || rawAd.image_url || null,
      videoUrl: rawAd.videoUrl || rawAd.video_url || null,
      landingUrl: rawAd.landingUrl || rawAd.link_url || null,
      ctaType: rawAd.ctaType || rawAd.call_to_action_type || null,
      snapshotUrl: rawAd.snapshotUrl || rawAd.ad_snapshot_url || null,
      deliveryStart: rawAd.deliveryStart || rawAd.ad_delivery_start_time || null,
      deliveryStop: rawAd.deliveryStop || rawAd.ad_delivery_stop_time || null,
      platforms: rawAd.platforms || rawAd.publisher_platforms || [],
      spend: rawAd.spend || null,
      impressions: rawAd.impressions || null,
      status: rawAd.status || 'unknown',
      adType: rawAd.adType || rawAd.ad_type || 'unknown',
    };
  }
}
