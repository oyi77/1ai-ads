/**
 * Meta Ads Library Scraper
 *
 * Scrapes the public Meta Ad Library at https://www.facebook.com/ads/library/
 * for ad data when the Graph API is unavailable or rate-limited.
 *
 * Uses Puppeteer for JavaScript-rendered content with fetch-based fallback.
 * Handles: pagination, infinite scroll, dynamic content loading.
 */

import { BaseScraper, PuppeteerPool, RequestQueue } from './base-scraper.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('meta-scraper');

const META_AD_LIBRARY_URL = 'https://www.facebook.com/ads/library/';
const META_AD_LIBRARY_API = 'https://www.facebook.com/ads/library/async/';

/**
 * CSS selectors for Meta Ad Library elements.
 * These may need updating if Facebook changes their page structure.
 */
const SELECTORS = {
  adCard: '[data-testid="ad_card"]',
  adTitle: '[data-testid="ad_title"]',
  adBody: '[data-testid="ad_body"]',
  adImage: '[data-testid="ad_image"] img',
  adLink: '[data-testid="ad_link"]',
  adCta: '[data-testid="ad_cta_button"]',
  advertiserName: '[data-testid="ad_advertiser_name"]',
  activeLabel: '[data-testid="ad_active_label"]',
  loadMore: '[data-testid="load_more_button"]',
  searchInput: '[data-testid="search_input"]',
  searchButton: '[data-testid="search_button"]',
  // Fallback selectors (more generic)
  adCardFallback: 'div[class*="x1lliihq"]',
  advertiserFallback: 'span[class*="x1lliihq"] a',
};

export class MetaScraper extends BaseScraper {
  /**
   * @param {Object} deps
   * @param {PuppeteerPool} deps.pool - Browser pool
   * @param {import('./base-scraper.js').ProxyManager} [deps.proxyManager] - Proxy manager
   * @param {RequestQueue} deps.queue - Rate-limited request queue
   */
  constructor({ pool, proxyManager, queue } = {}) {
    super({ pool, proxyManager, queue });
  }

  get platformName() {
    return 'meta';
  }

  /**
   * Scrape ads from Meta Ad Library.
   *
   * Strategy:
   *  1. Try the internal async API (faster, more reliable)
   *  2. Fall back to Puppeteer-based HTML scraping
   *
   * @param {string} query - Search query
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {number} [options.limit=50] - Max results
   * @returns {Promise<Array<Object>>} Scraped ad data
   */
  async scrapeAdsLibrary(query, options = {}) {
    const { country = 'US', limit = 50 } = options;

    log.info('Scraping Meta Ad Library', { query, country, limit });

    // Strategy 1: Try internal async API
    try {
      const ads = await this._scrapeViaAsyncApi(query, { country, limit });
      if (ads.length > 0) {
        log.info('Meta async API scraping succeeded', { count: ads.length });
        return ads;
      }
    } catch (error) {
      log.warn('Meta async API scraping failed', { error: error.message });
    }

    // Strategy 2: Puppeteer-based scraping
    try {
      const ads = await this._scrapeViaPuppeteer(query, { country, limit });
      log.info('Meta Puppeteer scraping completed', { count: ads.length });
      return ads;
    } catch (error) {
      log.error('Meta Puppeteer scraping failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract ad metadata from a Meta ad snapshot URL.
   *
   * @param {string} pageUrl - Ad snapshot URL
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractAdMetadata(pageUrl) {
    log.info('Extracting Meta ad metadata', { url: pageUrl });

    const browser = await this.pool.acquire();
    if (!browser) {
      return this._extractMetadataViaFetch(pageUrl);
    }

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this._sleep(2000);

      const metadata = await page.evaluate((sels) => {
        const getText = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent.trim() : '';
        };
        const getImage = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.src : null;
        };

        return {
          id: '',
          pageName: getText(sels.advertiserName) || getText(sels.advertiserFallback),
          headlines: [getText(sels.adTitle)].filter(Boolean),
          descriptions: [getText(sels.adBody)].filter(Boolean),
          imageUrl: getImage(sels.adImage),
          landingUrl: (document.querySelector(sels.adLink) || {}).href || null,
          ctaType: getText(sels.adCta),
          status: getText(sels.activeLabel) || 'unknown',
          snapshotUrl: pageUrl,
        };
      }, SELECTORS);

      return metadata;
    } finally {
      if (page) await page.close().catch(() => {});
      this.pool.release(browser);
    }
  }

  // ---- Private: Scraping strategies ----

  /**
   * Scrape via Meta's internal async API endpoint.
   * This is the endpoint the Ad Library web app calls internally.
   * @private
   */
  async _scrapeViaAsyncApi(query, { country, limit }) {
    const params = new URLSearchParams({
      q: query,
      country: country,
      ad_type: 'all',
      active_status: 'all',
      sort_data: 'RELEVANCE',
    });

    const url = `${META_AD_LIBRARY_API}search_ads/?${params}`;

    const response = await this._rateLimitedFetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': META_AD_LIBRARY_URL,
      },
    });

    const text = await response.text();

    // Meta's async API may return JSON or HTML with embedded JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Try to extract JSON from HTML response
      const jsonMatch = text.match(/"ads":\s*(\[.*?\])/s);
      if (jsonMatch) {
        data = { ads: JSON.parse(jsonMatch[1]) };
      } else {
        log.warn('Could not parse Meta async API response');
        return [];
      }
    }

    const ads = (data?.ads || data?.data || []).slice(0, limit);
    return ads.map(ad => this._parseAsyncApiAd(ad));
  }

  /**
   * Scrape via Puppeteer with scroll-based loading.
   * @private
   */
  async _scrapeViaPuppeteer(query, { country, limit }) {
    const browser = await this.pool.acquire();
    if (!browser) {
      log.warn('No browser available for Puppeteer scraping');
      return [];
    }

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // Set a reasonable user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to the Meta Ad Library
      const url = `${META_AD_LIBRARY_URL}?q=${encodeURIComponent(query)}&country=${country}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for content to load
      await this._sleep(3000);

      // Scroll to load more ads (infinite scroll)
      let adCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = Math.ceil(limit / 10) + 3; // Assume ~10 ads per scroll

      while (adCount < limit && scrollAttempts < maxScrollAttempts) {
        await page.evaluate(() => {
          window.scrollBy(0, 800);
        });
        await this._sleep(1500);

        adCount = await page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, SELECTORS.adCard).catch(() => {
          // Fallback selector
          return page.evaluate((sel) => {
            return document.querySelectorAll(sel).length;
          }, SELECTORS.adCardFallback).catch(() => 0);
        });

        scrollAttempts++;
        log.debug('Meta scroll loaded', { ads: adCount, attempt: scrollAttempts });
      }

      // Extract ad data from loaded page
      const ads = await page.evaluate((sels) => {
        const cards = document.querySelectorAll(sels.adCard);
        if (cards.length === 0) {
          // Try fallback selector
          const fallbackCards = document.querySelectorAll(sels.adCardFallback);
        }

        const results = [];
        const nodeList = cards.length > 0 ? cards : (document.querySelectorAll(sels.adCardFallback) || []);

        nodeList.forEach((card) => {
          const getText = (sel) => {
            const el = card.querySelector(sel);
            return el ? el.textContent.trim() : '';
          };
          const getAttr = (sel, attr) => {
            const el = card.querySelector(sel);
            return el ? el.getAttribute(attr) : null;
          };

          results.push({
            id: '',
            pageName: getText(sels.advertiserName) || getText(sels.advertiserFallback),
            headlines: [getText(sels.adTitle)].filter(Boolean),
            descriptions: [getText(sels.adBody)].filter(Boolean),
            imageUrl: getAttr(sels.adImage, 'src'),
            landingUrl: getAttr(sels.adLink, 'href'),
            ctaType: getText(sels.adCta),
            status: getText(sels.activeLabel).toLowerCase().includes('active') ? 'active' : 'inactive',
            snapshotUrl: null,
          });
        });

        return results;
      }, SELECTORS);

      return ads.slice(0, limit);
    } finally {
      if (page) await page.close().catch(() => {});
      this.pool.release(browser);
    }
  }

  /**
   * Extract metadata via plain fetch (no browser).
   * @private
   */
  async _extractMetadataViaFetch(pageUrl) {
    const response = await this._rateLimitedFetch(pageUrl);
    const html = await response.text();

    return {
      id: '',
      pageName: this._extractText(html, 'span.x1lliihq'),
      headlines: [],
      descriptions: [],
      imageUrl: null,
      landingUrl: null,
      ctaType: null,
      snapshotUrl: pageUrl,
      status: 'unknown',
    };
  }

  /**
   * Parse an ad from the Meta async API response.
   * @private
   */
  _parseAsyncApiAd(ad) {
    return {
      id: ad.archive_id || ad.id || '',
      pageName: ad.page_name || ad.advertiser_name || '',
      pageId: ad.page_id || null,
      headlines: ad.link_titles || ad.ad_creative_link_titles || [],
      descriptions: ad.bodies || ad.ad_creative_bodies || [],
      imageUrl: ad.image_url || ad.thumbnail_url || null,
      videoUrl: ad.video_url || null,
      landingUrl: ad.link_url || null,
      ctaType: ad.call_to_action_type || null,
      snapshotUrl: ad.snapshot_url || ad.ad_snapshot_url || null,
      deliveryStart: ad.start_date || ad.ad_delivery_start_time || null,
      deliveryStop: ad.end_date || ad.ad_delivery_stop_time || null,
      platforms: ad.publisher_platforms || [],
      status: ad.active_status || 'unknown',
      adType: ad.media_type || 'unknown',
    };
  }
}
