/**
 * TikTok Platform Adapter
 *
 * Implements BasePlatformAdapter for TikTok Creative Center / TopAds.
 * TikTok's Creative Center provides public ad discovery without authentication.
 *
 * Public page: https://ads.tiktok.com/business/creativecenter/
 * API: TikTok Business API (requires auth, for own campaigns only)
 */

import { BasePlatformAdapter } from './base-adapter.js';
import { createLogger } from '../../lib/logger.js';
import { PlatformError, ConfigurationError } from '../../lib/errors.js';

const log = createLogger('tiktok-adapter');

/**
 * TikTok Creative Center public API endpoints.
 * These are unofficial endpoints used by the Creative Center web app.
 */
const CREATIVE_CENTER_BASE = 'https://ads.tiktok.com/creative_radar_api/v1/topads/search';

export class TikTokAdapter extends BasePlatformAdapter {
  /**
   * @param {Object} deps
   * @param {import('../cache-service.js').CacheService} deps.cacheService
   * @param {Object} deps.settingsRepo - Settings repository for API credentials
   * @param {import('../web-scraper/tiktok-scraper.js').TikTokScraper} [deps.scraper] - TikTok scraper
   */
  constructor({ cacheService, settingsRepo, scraper } = {}) {
    super({ cacheService, settingsRepo });
    this.scraper = scraper;
  }

  get platformName() {
    return 'tiktok';
  }

  get displayName() {
    return 'TikTok Ads';
  }

  /**
   * Check if TikTok Business API credentials are configured.
   * @returns {boolean}
   */
  hasApiAccess() {
    if (!this.settingsRepo) return false;
    try {
      const creds = this.settingsRepo.getCredentials('tiktok');
      return !!(creds?.access_token);
    } catch {
      return false;
    }
  }

  /**
   * Search TikTok ads via Creative Center public API or scraper.
   *
   * @param {string} query - Search query (keyword, hashtag, or advertiser)
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {string} [options.activeStatus='ALL'] - Ad status filter
   * @param {string} [options.industry] - Industry/category filter
   * @param {string} [options.adType] - Ad type (video, image, etc.)
   * @param {number} [options.limit=50] - Max results
   * @param {string} [options.source='auto'] - 'api', 'scrape', 'auto'
   * @returns {Promise<AdSearchResult>}
   */
  async searchAds(query, options = {}) {
    const {
      country = 'US',
      activeStatus = 'ALL',
      industry,
      adType,
      limit = 50,
      source = 'auto',
    } = options;

    log.info('Searching TikTok ads', { query, country, source });

    // TikTok Creative Center has a semi-public API that the web app uses.
    // Try that first, fall back to full scraping.
    const usePublicApi = (source !== 'scrape');
    const useScraper = (source === 'scrape') || (source === 'auto');

    if (usePublicApi) {
      try {
        return await this._searchViaPublicApi(query, { country, industry, adType, limit });
      } catch (error) {
        log.warn('TikTok public API search failed', { error: error.message });
        if (!useScraper || !this.scraper) {
          throw error;
        }
      }
    }

    if (useScraper && this.scraper) {
      return this._searchViaScraper(query, { country, adType, limit });
    }

    throw new ConfigurationError(
      'TikTok ads search requires either the Creative Center API or a configured scraper.'
    );
  }

  /**
   * Get detailed information about a specific TikTok ad.
   *
   * @param {string} adId - TikTok ad identifier
   * @returns {Promise<NormalizedAd>}
   */
  async getAdDetails(adId) {
    log.info('Getting TikTok ad details', { adId });

    // Try the public Creative Center detail endpoint
    try {
      return await this._getAdDetailsViaPublicApi(adId);
    } catch (error) {
      log.warn('TikTok public API ad details failed', { adId, error: error.message });
    }

    if (this.scraper) {
      try {
        const metadata = await this.scraper.extractAdMetadata(
          `https://ads.tiktok.com/business/creativecenter/inspiration/ad/${adId}`
        );
        return this._normalizeAd(metadata);
      } catch (error) {
        log.warn('TikTok scraper ad details failed', { adId, error: error.message });
      }
    }

    throw new PlatformError(
      `Could not retrieve details for TikTok ad ${adId}.`,
      'tiktok'
    );
  }

  /**
   * List available public API endpoints for TikTok.
   * @returns {Array<PublicAPIDescriptor>}
   */
  getAvailablePublicAPIs() {
    return [
      {
        name: 'TikTok Creative Center (Semi-Public API)',
        endpoint: CREATIVE_CENTER_BASE,
        requiresAuth: false,
        rateLimit: 'Unofficial - use with caution, ~30 requests/minute',
        available: true,
      },
      {
        name: 'TikTok Creative Center (Web)',
        endpoint: 'https://ads.tiktok.com/business/creativecenter/',
        requiresAuth: false,
        rateLimit: 'Web scraping - use with caution',
        available: true,
      },
      {
        name: 'TikTok Business API',
        endpoint: 'https://business-api.tiktok.com/open_api/v1.3',
        requiresAuth: true,
        rateLimit: 'Varies by developer tier',
        available: this.hasApiAccess(),
        note: 'Provides your own campaign data only',
      },
    ];
  }

  // ---- Private: Public Creative Center API ----

  async _searchViaPublicApi(query, { country, industry, adType, limit }) {
    const payload = {
      keyword: query,
      country_code: country,
      page: 1,
      limit: Math.min(limit, 50),
      sort_by: 'popular',
      search_type: 'keyword',
    };

    if (industry) payload.industry = industry;
    if (adType) payload.ad_type = adType;

    const res = await fetch(CREATIVE_CENTER_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new PlatformError(
        `TikTok Creative Center returned ${res.status}`,
        'tiktok',
        res.status
      );
    }

    const data = await res.json();
    const rawAds = data?.data?.list || data?.data?.ads || [];

    const ads = rawAds.map(ad => this._normalizeAd(this._formatCreativeCenterAd(ad)));

    log.info('TikTok public API search completed', { total: ads.length });

    return {
      platform: this.platformName,
      source: 'api',
      ads,
      total: ads.length,
      hasMore: rawAds.length >= limit,
      nextCursor: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  async _getAdDetailsViaPublicApi(adId) {
    const detailUrl = `https://ads.tiktok.com/creative_radar_api/v1/topads/detail?ad_id=${adId}`;

    const res = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new PlatformError(
        `TikTok Creative Center detail returned ${res.status}`,
        'tiktok',
        res.status
      );
    }

    const data = await res.json();
    const adData = data?.data;

    if (!adData) {
      throw new PlatformError(`No data returned for TikTok ad ${adId}`, 'tiktok');
    }

    return this._normalizeAd(this._formatCreativeCenterAd(adData));
  }

  // ---- Private: Scraper fallback ----

  async _searchViaScraper(query, { country, adType, limit }) {
    log.info('Falling back to TikTok web scraper', { query });

    const scrapedAds = await this.scraper.scrapeAdsLibrary(query, {
      country,
      adType,
      limit,
    });

    const ads = scrapedAds.map(ad => this._normalizeAd(ad));

    return {
      platform: this.platformName,
      source: 'scrape',
      ads,
      total: ads.length,
      hasMore: false,
      nextCursor: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ---- Private: Formatting ----

  _formatCreativeCenterAd(ad) {
    return {
      id: ad.ad_id || ad.id || '',
      pageName: ad.advertiser_name || ad.brand_name || '',
      pageId: ad.advertiser_id || null,
      headlines: ad.ad_text ? [ad.ad_text] : [],
      descriptions: [],
      imageUrl: ad.cover_image_url || ad.image_url || null,
      videoUrl: ad.video_url || ad.play_url || null,
      landingUrl: ad.landing_url || ad.click_url || null,
      ctaType: ad.call_to_action || null,
      snapshotUrl: null,
      deliveryStart: ad.first_show_time || ad.show_start_time || null,
      deliveryStop: ad.last_show_time || ad.show_end_time || null,
      platforms: ['tiktok'],
      spend: null,
      impressions: ad.impression_count ? { lowerBound: ad.impression_count, upperBound: ad.impression_count } : null,
      status: ad.is_active !== false ? 'active' : 'inactive',
      adType: ad.video_url ? 'video' : (ad.image_url ? 'image' : 'unknown'),
      // TikTok-specific fields
      likes: ad.like_count || 0,
      comments: ad.comment_count || 0,
      shares: ad.share_count || 0,
      hashtags: ad.hashtags || [],
    };
  }
}
