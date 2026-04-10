/**
 * Google Ads Transparency Center Scraper
 *
 * Scrapes Google's Ads Transparency Center at
 * https://adstransparency.google.com/ for competitor ad data.
 *
 * Uses Puppeteer for JavaScript-rendered content with fetch-based fallback.
 * Handles: iframe content, dynamic loading, pagination.
 */

import { BaseScraper, PuppeteerPool, RequestQueue } from './base-scraper.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('google-scraper');

const GOOGLE_ADS_TRANSPARENCY_URL = 'https://adstransparency.google.com/';

/**
 * CSS selectors for Google Ads Transparency Center.
 * These may need updating if Google changes their page structure.
 */
const SELECTORS = {
  advertiserCard: '[data-advertiser-card]',
  adCreative: '[data-ad-creative]',
  adText: '[data-ad-text]',
  adHeadline: '[data-ad-headline]',
  adImage: '[data-ad-image] img',
  adVideo: '[data-ad-video] video',
  displayUrl: '[data-display-url]',
  searchInput: 'input[aria-label*="Search"]',
  searchButton: 'button[aria-label*="Search"]',
  loadMore: 'button[aria-label*="Load more"]',
  // Generic fallbacks
  adRow: 'div[class*="ad-renderer"]',
  advertiserLink: 'a[href*="/advertiser/"]',
};

export class GoogleScraper extends BaseScraper {
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
    return 'google';
  }

  /**
   * Scrape ads from Google Ads Transparency Center.
   *
   * Strategy:
   *  1. Search for advertiser by name/domain
   *  2. Navigate to advertiser's ad page
   *  3. Extract ad creatives with scroll-based loading
   *
   * @param {string} query - Search query (advertiser name or domain)
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {string} [options.adType] - Ad type filter (text, image, video)
   * @param {number} [options.limit=50] - Max results
   * @returns {Promise<Array<Object>>} Scraped ad data
   */
  async scrapeAdsLibrary(query, options = {}) {
    const { country = 'US', adType, limit = 50 } = options;

    log.info('Scraping Google Ads Transparency', { query, country, limit });

    // Strategy 1: Try Puppeteer-based scraping
    try {
      const ads = await this._scrapeViaPuppeteer(query, { country, adType, limit });
      if (ads.length > 0) {
        log.info('Google Puppeteer scraping succeeded', { count: ads.length });
        return ads;
      }
    } catch (error) {
      log.warn('Google Puppeteer scraping failed', { error: error.message });
    }

    // Strategy 2: Fallback to fetch-based approach
    try {
      const ads = await this._scrapeViaFetch(query, { country, limit });
      log.info('Google fetch scraping completed', { count: ads.length });
      return ads;
    } catch (error) {
      log.error('Google fetch scraping failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract ad metadata from a Google Ads Transparency ad URL.
   *
   * @param {string} pageUrl - Ad detail page URL
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractAdMetadata(pageUrl) {
    log.info('Extracting Google ad metadata', { url: pageUrl });

    const browser = await this.pool.acquire();
    if (!browser) {
      return this._extractMetadataFallback(pageUrl);
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
        const getAttr = (sel, attr) => {
          const el = document.querySelector(sel);
          return el ? el.getAttribute(attr) : null;
        };

        return {
          id: '',
          pageName: '',
          headlines: [getText(sels.adHeadline)].filter(Boolean),
          descriptions: [getText(sels.adText)].filter(Boolean),
          imageUrl: getAttr(sels.adImage, 'src'),
          videoUrl: getAttr(sels.adVideo, 'src'),
          landingUrl: null,
          ctaType: null,
          displayUrl: getText(sels.displayUrl),
          status: 'unknown',
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
   * Scrape via Puppeteer with search + scroll.
   * @private
   */
  async _scrapeViaPuppeteer(query, { country, adType, limit }) {
    const browser = await this.pool.acquire();
    if (!browser) return [];

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to the transparency center
      await page.goto(GOOGLE_ADS_TRANSPARENCY_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await this._sleep(2000);

      // Type in search query
      const searchInput = await page.$(SELECTORS.searchInput);
      if (searchInput) {
        await searchInput.type(query, { delay: 50 });
        await page.keyboard.press('Enter');
        await this._sleep(3000);
      } else {
        // Try URL-based search
        await page.goto(
          `${GOOGLE_ADS_TRANSPARENCY_URL}?q=${encodeURIComponent(query)}`,
          { waitUntil: 'networkidle2', timeout: 30000 }
        );
        await this._sleep(3000);
      }

      // Look for advertiser results and click the first match
      const advertiserLink = await page.$(SELECTORS.advertiserLink);
      if (advertiserLink) {
        await advertiserLink.click();
        await this._sleep(3000);
      }

      // Scroll to load more ads
      let adCount = 0;
      let scrollAttempts = 0;
      const maxScrolls = Math.ceil(limit / 10) + 3;

      while (adCount < limit && scrollAttempts < maxScrolls) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await this._sleep(1500);

        adCount = await page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, SELECTORS.adCreative).catch(() =>
          page.evaluate((sel) => document.querySelectorAll(sel).length, SELECTORS.adRow)
            .catch(() => 0)
        );

        scrollAttempts++;
        log.debug('Google scroll loaded', { ads: adCount, attempt: scrollAttempts });
      }

      // Extract ad data
      const ads = await page.evaluate((sels) => {
        const results = [];
        const creatives = document.querySelectorAll(`${sels.adCreative}, ${sels.adRow}`);

        creatives.forEach((card) => {
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
            pageName: '',
            headlines: [getText(sels.adHeadline)].filter(Boolean),
            descriptions: [getText(sels.adText)].filter(Boolean),
            imageUrl: getAttr(sels.adImage, 'src'),
            videoUrl: getAttr(sels.adVideo, 'src'),
            landingUrl: null,
            ctaType: null,
            displayUrl: getText(sels.displayUrl),
            status: 'unknown',
            adType: getAttr(sels.adVideo, 'src') ? 'video' : (getAttr(sels.adImage, 'src') ? 'image' : 'text'),
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
   * Fallback: fetch-based scraping attempt.
   * Google's transparency center is heavily JS-rendered so this may not yield much.
   * @private
   */
  async _scrapeViaFetch(query, { country, limit }) {
    const url = `${GOOGLE_ADS_TRANSPARENCY_URL}?q=${encodeURIComponent(query)}`;

    const response = await this._rateLimitedFetch(url);
    const html = await response.text();

    // Attempt to extract structured data from the HTML
    const ads = [];

    // Google may embed ad data in script tags as JSON
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const scriptContent = scriptMatch[1];
      const dataMatch = scriptContent.match(/"ads"\s*:\s*(\[[\s\S]*?\])/);
      if (dataMatch) {
        try {
          const parsedAds = JSON.parse(dataMatch[1]);
          ads.push(...parsedAds.slice(0, limit));
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    log.info('Google fetch scraping extracted ads', { count: ads.length });
    return ads.slice(0, limit);
  }

  /**
   * Fallback metadata extraction without browser.
   * @private
   */
  async _extractMetadataFallback(pageUrl) {
    const response = await this._rateLimitedFetch(pageUrl);
    const html = await response.text();

    return {
      id: '',
      pageName: '',
      headlines: [],
      descriptions: [],
      imageUrl: null,
      landingUrl: null,
      ctaType: null,
      displayUrl: this._extractText(html, 'span'),
      status: 'unknown',
    };
  }
}
