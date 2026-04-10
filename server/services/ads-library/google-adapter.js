/**
 * Google Platform Adapter
 *
 * Implements BasePlatformAdapter for Google Ads Transparency Center.
 * Google's Ads Transparency Center is primarily a web-based tool,
 * so this adapter relies on scraping with optional API augmentation.
 *
 * Public page: https://adstransparency.google.com/
 * API: Google Ads Transparency API (limited public access)
 */

import { BasePlatformAdapter } from './base-adapter.js';
import { createLogger } from '../../lib/logger.js';
import { PlatformError, ConfigurationError } from '../../lib/errors.js';

const log = createLogger('google-adapter');

export class GoogleAdapter extends BasePlatformAdapter {
  /**
   * @param {Object} deps
   * @param {import('../cache-service.js').CacheService} deps.cacheService
   * @param {Object} deps.settingsRepo - Settings repository for API credentials
   * @param {import('../web-scraper/google-scraper.js').GoogleScraper} [deps.scraper] - Google scraper
   */
  constructor({ cacheService, settingsRepo, scraper } = {}) {
    super({ cacheService, settingsRepo });
    this.scraper = scraper;
  }

  get platformName() {
    return 'google';
  }

  get displayName() {
    return 'Google Ads';
  }

  /**
   * Check if Google Ads API credentials are configured.
   * @returns {boolean}
   */
  hasApiAccess() {
    if (!this.settingsRepo) return false;
    try {
      const creds = this.settingsRepo.getCredentials('google');
      return !!(creds?.developer_token && creds?.oauth_token);
    } catch {
      return false;
    }
  }

  /**
   * Search Google Ads Transparency Center.
   *
   * @param {string} query - Search query (advertiser name, domain, or keyword)
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {string} [options.activeStatus='ALL'] - Ad status filter
   * @param {string} [options.adType] - Ad type filter (text, image, video)
   * @param {number} [options.limit=50] - Max results
   * @param {string} [options.source='auto'] - 'api', 'scrape', 'auto'
   * @returns {Promise<AdSearchResult>}
   */
  async searchAds(query, options = {}) {
    const {
      country = 'US',
      activeStatus = 'ALL',
      adType,
      limit = 50,
      source = 'auto',
    } = options;

    log.info('Searching Google Ads Transparency', { query, country, source });

    // Google Ads Transparency Center is primarily web-based
    // API access is for managing your own campaigns, not researching competitors
    const useScraper = (source === 'scrape') || (source !== 'api');
    const useApi = (source === 'api') && this.hasApiAccess();

    if (useScraper && this.scraper) {
      return this._searchViaScraper(query, { country, activeStatus, adType, limit });
    }

    if (useApi) {
      // Note: Google Ads API only provides your own campaign data,
      // not competitor ads. This path is for completeness.
      throw new PlatformError(
        'Google Ads API provides your own campaign data only. ' +
        'Use the web scraper for competitor ad research.',
        'google'
      );
    }

    throw new ConfigurationError(
      'Google ads search requires a configured scraper for the Ads Transparency Center. ' +
      'No scraper instance provided.'
    );
  }

  /**
   * Get detailed information about a specific Google ad.
   *
   * @param {string} adId - Google ad identifier
   * @returns {Promise<NormalizedAd>}
   */
  async getAdDetails(adId) {
    log.info('Getting Google ad details', { adId });

    if (this.scraper) {
      try {
        const metadata = await this.scraper.extractAdMetadata(
          `https://adstransparency.google.com/ad/${adId}`
        );
        return this._normalizeAd(metadata);
      } catch (error) {
        log.warn('Failed to get Google ad details via scraper', { adId, error: error.message });
      }
    }

    throw new PlatformError(
      `Could not retrieve details for Google ad ${adId}. Scraper instance required.`,
      'google'
    );
  }

  /**
   * List available public API endpoints for Google.
   * @returns {Array<PublicAPIDescriptor>}
   */
  getAvailablePublicAPIs() {
    return [
      {
        name: 'Google Ads Transparency Center (Web)',
        endpoint: 'https://adstransparency.google.com/',
        requiresAuth: false,
        rateLimit: 'Web scraping - use with caution',
        available: true,
      },
      {
        name: 'Google Ads API',
        endpoint: 'https://googleads.googleapis.com/v18',
        requiresAuth: true,
        rateLimit: 'Varies by developer token tier',
        available: this.hasApiAccess(),
        note: 'Provides your own campaign data only, not competitor ads',
      },
    ];
  }

  // ---- Private ----

  async _searchViaScraper(query, { country, activeStatus, adType, limit }) {
    log.info('Using Google web scraper', { query });

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
}
