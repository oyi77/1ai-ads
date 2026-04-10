/**
 * Base Scraper Infrastructure
 *
 * Provides PuppeteerPool for browser instance management,
 * ProxyManager for proxy rotation, and RequestQueue for rate limiting.
 * Platform-specific scrapers extend BaseScraper to implement
 * ad extraction logic for their target ad library pages.
 */

import { createLogger } from '../../lib/logger.js';

const log = createLogger('base-scraper');

// ---------------------------------------------------------------------------
// PuppeteerPool - manages reusable browser instances
// ---------------------------------------------------------------------------

/**
 * Pool of Puppeteer browser instances for parallel scraping.
 * Reuses browser instances across requests to reduce startup overhead.
 *
 * Requires 'puppeteer' to be installed. If not available, scrapers
 * will fall back to a plain fetch-based approach.
 */
export class PuppeteerPool {
  /**
   * @param {Object} options
   * @param {number} options.maxInstances - Max concurrent browser instances (default: 3)
   * @param {boolean} options.headless - Run browsers in headless mode (default: true)
   * @param {number} options.timeout - Default page navigation timeout in ms (default: 30000)
   * @param {Array<string>} options.launchArgs - Additional Chromium launch args
   */
  constructor(options = {}) {
    this.maxInstances = options.maxInstances || 3;
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 30000;
    this.launchArgs = options.launchArgs || [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];
    this._browsers = [];
    this._available = [];
    this._waiting = [];
    this._puppeteer = null;
    this._launched = false;
  }

  /**
   * Lazily load puppeteer. Returns null if not installed.
   * @returns {Promise<object|null>}
   */
  async _getPuppeteer() {
    if (this._puppeteer !== null) return this._puppeteer;
    try {
      this._puppeteer = await import('puppeteer');
      log.info('Puppeteer loaded successfully');
      return this._puppeteer;
    } catch {
      log.warn('Puppeteer not installed. Scraping will use fetch-based fallback.');
      this._puppeteer = false;
      return null;
    }
  }

  /**
   * Acquire a browser instance from the pool.
   * Creates a new browser if under the max limit, otherwise waits.
   *
   * @returns {Promise<import('puppeteer').Browser|null>} Browser instance or null if puppeteer unavailable
   */
  async acquire() {
    const puppeteer = await this._getPuppeteer();
    if (!puppeteer) return null;

    // Return an available browser immediately
    if (this._available.length > 0) {
      return this._available.pop();
    }

    // Create a new browser if under limit
    if (this._browsers.length < this.maxInstances) {
      const browser = await puppeteer.launch({
        headless: this.headless ? 'new' : false,
        args: this.launchArgs,
      });
      this._browsers.push(browser);
      log.debug('Launched new browser instance', { total: this._browsers.length });
      return browser;
    }

    // Wait for a browser to become available
    return new Promise((resolve) => {
      this._waiting.push(resolve);
      log.debug('Waiting for available browser instance');
    });
  }

  /**
   * Release a browser back to the pool.
   *
   * @param {import('puppeteer').Browser} browser - Browser to release
   */
  release(browser) {
    if (!browser) return;

    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next(browser);
    } else {
      this._available.push(browser);
    }
  }

  /**
   * Close all browser instances and clean up.
   */
  async closeAll() {
    for (const browser of this._browsers) {
      try {
        await browser.close();
      } catch (err) {
        log.warn('Error closing browser', { error: err.message });
      }
    }
    this._browsers = [];
    this._available = [];
    this._waiting = [];
    log.info('All browser instances closed');
  }

  /**
   * Get pool status.
   * @returns {Object}
   */
  getStats() {
    return {
      total: this._browsers.length,
      available: this._available.length,
      waiting: this._waiting.length,
      maxInstances: this.maxInstances,
    };
  }
}

// ---------------------------------------------------------------------------
// ProxyManager - handles proxy rotation (optional)
// ---------------------------------------------------------------------------

/**
 * Manages a list of proxy URLs and rotates through them.
 * Falls back to direct connection if no proxies are configured.
 */
export class ProxyManager {
  /**
   * @param {Object} options
   * @param {Array<string>} options.proxies - List of proxy URLs (e.g., ['http://user:pass@host:port'])
   * @param {string} options.strategy - Rotation strategy ('round-robin' or 'random')
   */
  constructor(options = {}) {
    this.proxies = options.proxies || [];
    this.strategy = options.strategy || 'round-robin';
    this._index = 0;
    this._failures = new Map(); // proxy -> failure count
    this._maxFailures = 3;
  }

  /**
   * Get the next available proxy URL.
   *
   * @returns {string|null} Proxy URL or null for direct connection
   */
  getNext() {
    if (this.proxies.length === 0) return null;

    // Filter out failed proxies
    const available = this.proxies.filter(p => (this._failures.get(p) || 0) < this._maxFailures);
    if (available.length === 0) {
      // Reset failures if all proxies exhausted
      this._failures.clear();
      log.warn('All proxies exhausted, resetting failure counts');
      return this.proxies[0];
    }

    let proxy;
    if (this.strategy === 'random') {
      proxy = available[Math.floor(Math.random() * available.length)];
    } else {
      proxy = available[this._index % available.length];
      this._index++;
    }

    return proxy;
  }

  /**
   * Report a proxy failure.
   *
   * @param {string} proxyUrl - The proxy that failed
   */
  reportFailure(proxyUrl) {
    if (!proxyUrl) return;
    const count = (this._failures.get(proxyUrl) || 0) + 1;
    this._failures.set(proxyUrl, count);
    log.warn('Proxy failure reported', { proxy: proxyUrl.replace(/\/\/.*:.*@/, '//***:***@'), failures: count });
  }

  /**
   * Report a proxy success (resets failure count).
   *
   * @param {string} proxyUrl - The proxy that succeeded
   */
  reportSuccess(proxyUrl) {
    if (!proxyUrl) return;
    this._failures.delete(proxyUrl);
  }

  /**
   * Get proxy manager status.
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.proxies.length,
      available: this.proxies.filter(p => (this._failures.get(p) || 0) < this._maxFailures).length,
      strategy: this.strategy,
    };
  }
}

// ---------------------------------------------------------------------------
// RequestQueue - rate limiting with concurrency control
// ---------------------------------------------------------------------------

/**
 * Queue for rate-limiting and deduplicating scraping requests.
 * Ensures requests to a platform stay within acceptable rate limits.
 */
export class RequestQueue {
  /**
   * @param {Object} options
   * @param {number} options.requestsPerMinute - Max requests per minute (default: 20)
   * @param {number} options.maxConcurrent - Max concurrent requests (default: 3)
   * @param {number} options.minDelay - Minimum delay between requests in ms (default: 1000)
   * @param {number} options.retryAttempts - Max retry attempts (default: 2)
   * @param {number} options.retryDelay - Base retry delay in ms (default: 2000)
   */
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || 20;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.minDelay = options.minDelay || 1000;
    this.retryAttempts = options.retryAttempts || 2;
    this.retryDelay = options.retryDelay || 2000;
    this._timestamps = [];
    this._active = 0;
    this._pending = [];
    this._lastRequestTime = 0;
  }

  /**
   * Enqueue a scraping request with rate limiting.
   *
   * @param {Function} fn - Async function to execute
   * @param {string} [dedupeKey] - Optional key for deduplication
   * @returns {Promise<*>} Result of the function
   */
  async enqueue(fn, dedupeKey) {
    // Deduplication: check if same request is already in-flight
    if (dedupeKey) {
      const pending = this._pending.find(p => p.key === dedupeKey);
      if (pending) {
        log.debug('Deduplicating request', { key: dedupeKey });
        return pending.promise;
      }
    }

    // Wait for rate limit slot
    await this._waitForSlot();

    // Wait for concurrency slot
    while (this._active >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this._active++;

    // Apply minimum delay
    const now = Date.now();
    const timeSinceLast = now - this._lastRequestTime;
    if (timeSinceLast < this.minDelay) {
      await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLast));
    }

    this._lastRequestTime = Date.now();
    this._timestamps.push(this._lastRequestTime);

    const promise = this._executeWithRetry(fn);

    if (dedupeKey) {
      const entry = { key: dedupeKey, promise };
      this._pending.push(entry);
      promise.finally(() => {
        const idx = this._pending.indexOf(entry);
        if (idx !== -1) this._pending.splice(idx, 1);
      });
    }

    try {
      return await promise;
    } finally {
      this._active--;
    }
  }

  /**
   * Execute a function with retry logic and exponential backoff.
   *
   * @param {Function} fn - Async function
   * @param {number} [attempt=0] - Current attempt number
   * @returns {Promise<*>}
   * @private
   */
  async _executeWithRetry(fn, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < this.retryAttempts && this._isRetryable(error)) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        log.warn(`Retrying request (attempt ${attempt + 1}/${this.retryAttempts})`, {
          delay,
          error: error.message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._executeWithRetry(fn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Wait until a request slot is available (rate limiting).
   * @private
   */
  async _waitForSlot() {
    const now = Date.now();
    this._timestamps = this._timestamps.filter(ts => now - ts < 60000);

    if (this._timestamps.length >= this.requestsPerMinute) {
      const oldest = this._timestamps[0];
      const waitTime = 60000 - (now - oldest) + 100; // +100ms buffer
      log.debug('Rate limit reached, waiting', { waitMs: waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Check if an error is retryable.
   *
   * @param {Error} error
   * @returns {boolean}
   * @private
   */
  _isRetryable(error) {
    const retryable = [
      /ETIMEDOUT/,
      /ECONNRESET/,
      /ENOTFOUND/,
      /timeout/i,
      /429/,
      /502/,
      /503/,
      /504/,
      /rate.?limit/i,
      /blocked/i,
    ];
    return retryable.some(pattern => pattern.test(error.message));
  }

  /**
   * Get queue status.
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    const recentTimestamps = this._timestamps.filter(ts => now - ts < 60000);
    return {
      requestsInLastMinute: recentTimestamps.length,
      requestsPerMinute: this.requestsPerMinute,
      activeRequests: this._active,
      maxConcurrent: this.maxConcurrent,
      pendingDedupes: this._pending.length,
    };
  }
}

// ---------------------------------------------------------------------------
// BaseScraper - abstract base for platform-specific scrapers
// ---------------------------------------------------------------------------

/**
 * Abstract base class for platform ad library scrapers.
 * Subclasses implement platform-specific extraction logic.
 */
export class BaseScraper {
  /**
   * @param {Object} deps
   * @param {PuppeteerPool} deps.pool - Shared browser pool
   * @param {ProxyManager} [deps.proxyManager] - Proxy rotation manager
   * @param {RequestQueue} deps.queue - Rate-limited request queue
   */
  constructor({ pool, proxyManager, queue }) {
    if (new.target === BaseScraper) {
      throw new Error('BaseScraper cannot be instantiated directly. Use a platform-specific scraper.');
    }
    this.pool = pool;
    this.proxyManager = proxyManager;
    this.queue = queue;
  }

  /**
   * Platform identifier. Must be overridden by subclasses.
   * @returns {string}
   */
  get platformName() {
    throw new Error(`${this.constructor.name} must implement platformName getter`);
  }

  /**
   * Scrape ads from the platform's public ad library pages.
   *
   * @param {string} query - Search query
   * @param {Object} [options] - Scraping options
   * @param {string} [options.country] - Country code
   * @param {number} [options.limit] - Max results
   * @returns {Promise<Array>} Scraped ad data
   */
  async scrapeAdsLibrary(query, options = {}) {
    throw new Error(`${this.constructor.name} must implement scrapeAdsLibrary(query, options)`);
  }

  /**
   * Extract ad metadata from a specific page URL.
   *
   * @param {string} pageUrl - URL of the ad detail page
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractAdMetadata(pageUrl) {
    throw new Error(`${this.constructor.name} must implement extractAdMetadata(pageUrl)`);
  }

  /**
   * Perform a rate-limited fetch with optional proxy support.
   *
   * @param {string} url - URL to fetch
   * @param {Object} [fetchOptions] - Fetch options
   * @returns {Promise<Response>}
   */
  async _rateLimitedFetch(url, fetchOptions = {}) {
    return this.queue.enqueue(async () => {
      const proxy = this.proxyManager ? this.proxyManager.getNext() : null;

      const options = {
        ...fetchOptions,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...fetchOptions.headers,
        },
      };

      // Note: proxy support for fetch requires a proxy agent (e.g., https-proxy-agent)
      // This is a placeholder - actual proxy usage would be configured via agent
      if (proxy) {
        log.debug('Using proxy for request', { url });
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        if (proxy) this.proxyManager.reportFailure(proxy);
        throw error;
      }

      if (proxy) this.proxyManager.reportSuccess(proxy);
      return response;
    }, url);
  }

  /**
   * Extract text content from an HTML string using a simple regex approach.
   * For more complex extraction, use Puppeteer-based scraping.
   *
   * @param {string} html - HTML string
   * @param {string} selector - CSS-like selector (simplified)
   * @returns {string} Extracted text
   */
  _extractText(html, selector) {
    // Simple tag-based extraction for fallback scenarios
    const tagMatch = selector.match(/^(\w+)(?:\[([^\]]+)\])?(?:\.([\w-]+))?$/);
    if (!tagMatch) return '';

    const [, tag, attr, className] = tagMatch;
    let pattern;
    if (className) {
      pattern = new RegExp(`<${tag}[^>]*class="[^"]*${className}[^"]*"[^>]*>(.*?)</${tag}>`, 'gs');
    } else {
      pattern = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gs');
    }

    const matches = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
      matches.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    return matches.join(' ');
  }

  /**
   * Pause execution for a given duration.
   *
   * @param {number} ms - Duration in milliseconds
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
