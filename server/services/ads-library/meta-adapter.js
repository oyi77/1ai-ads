/**
 * Meta Platform Adapter
 *
 * Implements BasePlatformAdapter for Meta (Facebook/Instagram) ads.
 * Uses the Meta Ads Archive Graph API when credentials are available,
 * falls back to web scraping via MetaScraper otherwise.
 *
 * API Docs: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
 * Rate limit: ~200 calls/hour per access token.
 * Spend/impressions data only available for political/EU ads.
 */

import { BasePlatformAdapter } from './base-adapter.js';
import { createLogger } from '../../lib/logger.js';
import { PlatformError, ConfigurationError } from '../../lib/errors.js';

const log = createLogger('meta-adapter');
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const DEFAULT_FIELDS = [
  'id', 'page_name', 'page_id',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions',
  'ad_creative_link_captions', 'ad_snapshot_url',
  'ad_delivery_start_time', 'ad_delivery_stop_time',
  'publisher_platforms', 'languages', 'estimated_audience_size',
  'spend', 'impressions', 'currency',
].join(',');

export class MetaAdapter extends BasePlatformAdapter {
  /**
   * @param {Object} deps
   * @param {import('../cache-service.js').CacheService} deps.cacheService
   * @param {Object} deps.settingsRepo - Settings repository for API credentials
   * @param {import('../web-scraper/meta-scraper.js').MetaScraper} [deps.scraper] - Meta scraper fallback
   */
  constructor({ cacheService, settingsRepo, scraper } = {}) {
    super({ cacheService, settingsRepo });
    this.scraper = scraper;
  }

  get platformName() {
    return 'meta';
  }

  get displayName() {
    return 'Meta (Facebook & Instagram)';
  }

  /**
   * Check if Meta API credentials are configured.
   * @returns {boolean}
   */
  hasApiAccess() {
    if (!this.settingsRepo) return false;
    try {
      const creds = this.settingsRepo.getCredentials('meta');
      return !!(creds?.access_token);
    } catch {
      return false;
    }
  }

  /**
   * Search Meta Ads Library.
   * Tries API first, falls back to scraper on failure.
   *
   * @param {string} query - Search query
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {string} [options.activeStatus='ALL'] - 'ACTIVE', 'INACTIVE', 'ALL'
   * @param {string} [options.mediaType] - 'IMAGE', 'VIDEO', 'ALL'
   * @param {number} [options.limit=50] - Max results (max 500)
   * @param {string} [options.cursor] - Pagination cursor
   * @param {string} [options.source='auto'] - 'api', 'scrape', 'auto'
   * @returns {Promise<AdSearchResult>}
   */
  async searchAds(query, options = {}) {
    const {
      country = 'US',
      activeStatus = 'ALL',
      mediaType = 'ALL',
      limit = 50,
      cursor,
      source = 'auto',
    } = options;

    log.info('Searching Meta Ads Library', { query, country, source });

    // Determine which source to use
    const useApi = (source === 'api') || (source === 'auto' && this.hasApiAccess());
    const useScraper = (source === 'scrape') || (source === 'auto' && !this.hasApiAccess());

    if (useApi) {
      try {
        return await this._searchViaApi(query, { country, activeStatus, mediaType, limit, cursor });
      } catch (error) {
        log.warn('Meta API search failed, falling back to scraper', { error: error.message });
        if (!useScraper && !this.scraper) {
          throw error;
        }
      }
    }

    if (useScraper && this.scraper) {
      return this._searchViaScraper(query, { country, activeStatus, limit });
    }

    throw new ConfigurationError(
      'Meta search requires either API credentials or a configured scraper. ' +
      'Configure Meta access token in Settings or enable web scraping.'
    );
  }

  /**
   * Get detailed information about a specific Meta ad.
   *
   * @param {string} adId - Meta ad archive ID
   * @returns {Promise<NormalizedAd>}
   */
  async getAdDetails(adId) {
    log.info('Getting Meta ad details', { adId });

    if (this.hasApiAccess()) {
      try {
        return await this._getAdDetailsViaApi(adId);
      } catch (error) {
        log.warn('Meta API ad details failed', { adId, error: error.message });
      }
    }

    // No scraper fallback for individual ad details
    throw new PlatformError(
      `Could not retrieve details for Meta ad ${adId}. API access or snapshot URL required.`,
      'meta'
    );
  }

  /**
   * List available public API endpoints for Meta.
   * @returns {Array<PublicAPIDescriptor>}
   */
  getAvailablePublicAPIs() {
    const apis = [
      {
        name: 'Meta Ads Archive API',
        endpoint: `${GRAPH_API_BASE}/ads_archive`,
        requiresAuth: true,
        rateLimit: '~200 requests/hour per token',
        available: this.hasApiAccess(),
      },
      {
        name: 'Meta Ad Library (Web)',
        endpoint: 'https://www.facebook.com/ads/library/',
        requiresAuth: false,
        rateLimit: 'Web scraping - use with caution',
        available: true,
      },
    ];

    return apis;
  }

  // ---- Private: API methods ----

  async _searchViaApi(query, { country, activeStatus, mediaType, limit, cursor }) {
    const token = this._getToken();
    const params = new URLSearchParams({
      search_terms: query,
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus,
      ad_type: 'ALL',
      fields: DEFAULT_FIELDS,
      limit: String(Math.min(limit, 500)),
      access_token: token,
    });

    if (mediaType && mediaType !== 'ALL') {
      params.set('media_type', mediaType);
    }
    if (cursor) {
      params.set('after', cursor);
    }

    const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      throw new PlatformError(
        `Meta API error: ${data.error.message}`,
        'meta',
        data.error.code
      );
    }

    const ads = (data.data || []).map(ad => this._normalizeAd(this._formatApiAd(ad)));

    log.info('Meta API search completed', { total: ads.length });

    return {
      platform: this.platformName,
      source: 'api',
      ads,
      total: ads.length,
      hasMore: !!data.paging?.next,
      nextCursor: data.paging?.cursors?.after || null,
      fetchedAt: new Date().toISOString(),
    };
  }

  async _getAdDetailsViaApi(adId) {
    const token = this._getToken();
    const params = new URLSearchParams({
      fields: DEFAULT_FIELDS,
      access_token: token,
    });

    const url = `${GRAPH_API_BASE}/${adId}?${params}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      throw new PlatformError(
        `Meta API error: ${data.error.message}`,
        'meta',
        data.error.code
      );
    }

    return this._normalizeAd(this._formatApiAd(data));
  }

  _getToken() {
    if (!this.settingsRepo) {
      throw new ConfigurationError('Settings repository not configured for Meta adapter.');
    }
    const creds = this.settingsRepo.getCredentials('meta');
    if (!creds?.access_token) {
      throw new ConfigurationError('Meta access token not configured. Go to Settings to add it.');
    }
    return creds.access_token;
  }

  // ---- Private: Scraper fallback ----

  async _searchViaScraper(query, { country, activeStatus, limit }) {
    log.info('Falling back to Meta web scraper', { query });

    const scrapedAds = await this.scraper.scrapeAdsLibrary(query, { country, limit });
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

  _formatApiAd(ad) {
    return {
      id: ad.id,
      pageName: ad.page_name,
      pageId: ad.page_id,
      headlines: ad.ad_creative_link_titles || [],
      descriptions: ad.ad_creative_bodies || [],
      snapshotUrl: ad.ad_snapshot_url,
      deliveryStart: ad.ad_delivery_start_time,
      deliveryStop: ad.ad_delivery_stop_time,
      platforms: ad.publisher_platforms || [],
      spend: ad.spend || null,
      impressions: ad.impressions || null,
      status: 'unknown',
      adType: 'unknown',
    };
  }
}
