/**
 * TikTok Creative Center Scraper
 *
 * Scrapes TikTok's Creative Center / TopAds at
 * https://ads.tiktok.com/business/creativecenter/ for ad data.
 *
 * Uses Puppeteer for JavaScript-rendered content with fetch-based fallback.
 * Handles: infinite scroll, video content, engagement metrics.
 */

import { BaseScraper, PuppeteerPool, RequestQueue } from './base-scraper.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('tiktok-scraper');

const TIKTOK_CREATIVE_CENTER_URL = 'https://ads.tiktok.com/business/creativecenter/inspiration';
const TIKTOK_TOPADS_API = 'https://ads.tiktok.com/creative_radar_api/v1/topads/search';

/**
 * CSS selectors for TikTok Creative Center.
 * These may need updating if TikTok changes their page structure.
 */
const SELECTORS = {
  adCard: '[class*="video-card"]',
  adCardFallback: '[class*="card-item"]',
  adTitle: '[class*="video-title"], [class*="ad-title"]',
  advertiserName: '[class*="advertiser"], [class*="author-name"]',
  adVideo: 'video',
  adImage: 'img[class*="cover"]',
  likeCount: '[class*="like-count"], [data-testid="like-count"]',
  commentCount: '[class*="comment-count"]',
  shareCount: '[class*="share-count"]',
  searchInput: 'input[class*="search-input"], input[placeholder*="Search"]',
  loadMore: 'button[class*="load-more"]',
  hashtag: 'a[href*="/tag/"]',
  ctaButton: '[class*="cta-button"], [class*="call-to-action"]',
};

export class TikTokScraper extends BaseScraper {
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
    return 'tiktok';
  }

  /**
   * Scrape ads from TikTok Creative Center.
   *
   * Strategy:
   *  1. Try the Creative Center public API endpoint
   *  2. Fall back to Puppeteer-based HTML scraping
   *
   * @param {string} query - Search query (keyword or hashtag)
   * @param {Object} [options]
   * @param {string} [options.country='US'] - Country code
   * @param {string} [options.adType] - Ad type filter
   * @param {number} [options.limit=50] - Max results
   * @returns {Promise<Array<Object>>} Scraped ad data
   */
  async scrapeAdsLibrary(query, options = {}) {
    const { country = 'US', adType, limit = 50 } = options;

    log.info('Scraping TikTok Creative Center', { query, country, limit });

    // Strategy 1: Try public API endpoint
    try {
      const ads = await this._scrapeViaPublicApi(query, { country, adType, limit });
      if (ads.length > 0) {
        log.info('TikTok public API scraping succeeded', { count: ads.length });
        return ads;
      }
    } catch (error) {
      log.warn('TikTok public API scraping failed', { error: error.message });
    }

    // Strategy 2: Puppeteer-based scraping
    try {
      const ads = await this._scrapeViaPuppeteer(query, { country, adType, limit });
      log.info('TikTok Puppeteer scraping completed', { count: ads.length });
      return ads;
    } catch (error) {
      log.error('TikTok Puppeteer scraping failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract ad metadata from a TikTok Creative Center ad URL.
   *
   * @param {string} pageUrl - Ad detail page URL
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractAdMetadata(pageUrl) {
    log.info('Extracting TikTok ad metadata', { url: pageUrl });

    const browser = await this.pool.acquire();
    if (!browser) {
      return this._extractMetadataFallback(pageUrl);
    }

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this._sleep(3000);

      const metadata = await page.evaluate((sels) => {
        const getText = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent.trim() : '';
        };
        const getAttr = (sel, attr) => {
          const el = document.querySelector(sel);
          return el ? el.getAttribute(attr) : null;
        };
        const getNumber = (sel) => {
          const text = getText(sel);
          const match = text.match(/[\d.]+/);
          return match ? parseFloat(match[0]) : 0;
        };

        // Extract hashtags
        const hashtagEls = document.querySelectorAll(sels.hashtag);
        const hashtags = [];
        hashtagEls.forEach(el => {
          const tag = el.textContent.trim();
          if (tag) hashtags.push(tag);
        });

        return {
          id: '',
          pageName: getText(sels.advertiserName),
          headlines: [getText(sels.adTitle)].filter(Boolean),
          descriptions: [],
          imageUrl: getAttr(sels.adImage, 'src'),
          videoUrl: getAttr(sels.adVideo, 'src'),
          landingUrl: null,
          ctaType: getText(sels.ctaButton),
          status: 'unknown',
          likes: getNumber(sels.likeCount),
          comments: getNumber(sels.commentCount),
          shares: getNumber(sels.shareCount),
          hashtags,
          platforms: ['tiktok'],
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
   * Scrape via TikTok Creative Center public API.
   * @private
   */
  async _scrapeViaPublicApi(query, { country, adType, limit }) {
    const payload = {
      keyword: query,
      country_code: country,
      page: 1,
      limit: Math.min(limit, 50),
      sort_by: 'popular',
      search_type: 'keyword',
    };

    if (adType) payload.ad_type = adType;

    const response = await this._rateLimitedFetch(TIKTOK_TOPADS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': TIKTOK_CREATIVE_CENTER_URL,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`TikTok Creative Center API returned ${response.status}`);
    }

    const data = await response.json();
    const rawAds = data?.data?.list || data?.data?.ads || [];

    return rawAds.slice(0, limit).map(ad => this._parseApiAd(ad));
  }

  /**
   * Scrape via Puppeteer with infinite scroll.
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

      // Navigate to TikTok Creative Center search
      const searchUrl = `${TIKTOK_CREATIVE_CENTER_URL}?keyword=${encodeURIComponent(query)}&countryCode=${country}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this._sleep(3000);

      // Try using search input if direct URL doesn't work
      const searchInput = await page.$(SELECTORS.searchInput);
      if (searchInput) {
        await searchInput.click();
        await searchInput.type(query, { delay: 30 });
        await page.keyboard.press('Enter');
        await this._sleep(3000);
      }

      // Scroll to load more ads
      let adCount = 0;
      let scrollAttempts = 0;
      const maxScrolls = Math.ceil(limit / 8) + 3; // ~8 ads per scroll

      while (adCount < limit && scrollAttempts < maxScrolls) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await this._sleep(2000);

        adCount = await page.evaluate((sels) => {
          const cards = document.querySelectorAll(sels.adCard);
          const fallbackCards = document.querySelectorAll(sels.adCardFallback);
          return Math.max(cards.length, fallbackCards.length);
        }, SELECTORS);

        scrollAttempts++;
        log.debug('TikTok scroll loaded', { ads: adCount, attempt: scrollAttempts });
      }

      // Extract ad data
      const ads = await page.evaluate((sels) => {
        const results = [];
        const cards = document.querySelectorAll(`${sels.adCard}, ${sels.adCardFallback}`);

        cards.forEach((card) => {
          const getText = (sel) => {
            const el = card.querySelector(sel);
            return el ? el.textContent.trim() : '';
          };
          const getAttr = (sel, attr) => {
            const el = card.querySelector(sel);
            return el ? el.getAttribute(attr) : null;
          };
          const getNumber = (sel) => {
            const text = getText(sel);
            const match = text.match(/[\d.]+/);
            return match ? parseFloat(match[0]) : 0;
          };

          // Extract hashtags
          const hashtagEls = card.querySelectorAll(sels.hashtag);
          const hashtags = [];
          hashtagEls.forEach(el => {
            const tag = el.textContent.trim();
            if (tag) hashtags.push(tag);
          });

          results.push({
            id: '',
            pageName: getText(sels.advertiserName),
            headlines: [getText(sels.adTitle)].filter(Boolean),
            descriptions: [],
            imageUrl: getAttr(sels.adImage, 'src'),
            videoUrl: getAttr(sels.adVideo, 'src'),
            landingUrl: null,
            ctaType: getText(sels.ctaButton),
            status: 'unknown',
            adType: getAttr(sels.adVideo, 'src') ? 'video' : (getAttr(sels.adImage, 'src') ? 'image' : 'unknown'),
            likes: getNumber(sels.likeCount),
            comments: getNumber(sels.commentCount),
            shares: getNumber(sels.shareCount),
            hashtags,
            platforms: ['tiktok'],
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
      videoUrl: null,
      landingUrl: null,
      ctaType: null,
      status: 'unknown',
      hashtags: [],
      platforms: ['tiktok'],
    };
  }

  /**
   * Parse an ad from the TikTok Creative Center API response.
   * @private
   */
  _parseApiAd(ad) {
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
      deliveryStart: ad.first_show_time || null,
      deliveryStop: ad.last_show_time || null,
      platforms: ['tiktok'],
      spend: null,
      impressions: ad.impression_count || null,
      status: ad.is_active !== false ? 'active' : 'inactive',
      adType: ad.video_url || ad.play_url ? 'video' : 'unknown',
      likes: ad.like_count || 0,
      comments: ad.comment_count || 0,
      shares: ad.share_count || 0,
      hashtags: ad.hashtags || [],
    };
  }
}
