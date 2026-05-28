import { createLogger } from '../lib/logger.js';

const log = createLogger('shopee-adapter');

const FAILURE_THRESHOLD = 5;
const HALF_OPEN_TIMEOUT_MS = 60_000;
const SUCCESS_TO_CLOSE = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_COUNT = 2;

export class ShopeeAdapter {
  constructor(baseUrl = 'http://localhost:8200') {
    this.baseUrl = baseUrl;
    this._state = 'closed'; // closed | open | half-open
    this._failures = 0;
    this._successes = 0;
    this._openedAt = null;
    this._cache = null;
    this._cacheTs = 0;
  }

  getCircuitState() {
    if (this._state === 'open') {
      if (Date.now() - this._openedAt >= HALF_OPEN_TIMEOUT_MS) {
        this._state = 'half-open';
        this._successes = 0;
        log.info('Circuit half-open');
      }
    }
    return this._state;
  }

  _recordSuccess() {
    if (this._state === 'half-open') {
      this._successes++;
      if (this._successes >= SUCCESS_TO_CLOSE) {
        this._state = 'closed';
        this._failures = 0;
        this._successes = 0;
        log.info('Circuit closed');
      }
    } else {
      this._failures = 0;
    }
  }

  _recordFailure() {
    this._failures++;
    if (this._state === 'half-open') {
      this._state = 'open';
      this._openedAt = Date.now();
      log.warn('Circuit re-opened (half-open failure)');
    } else if (this._failures >= FAILURE_THRESHOLD) {
      this._state = 'open';
      this._openedAt = Date.now();
      log.warn('Circuit opened', { failures: this._failures });
    }
  }

  async fetchOrders(params = {}) {
    const state = this.getCircuitState();
    if (state === 'open') {
      log.warn('Circuit open, returning cached data');
      return this._cache || [];
    }

    if (this._cache && Date.now() - this._cacheTs < CACHE_TTL_MS && !params.force) {
      log.debug('Returning cached orders');
      return this._cache;
    }

    let lastError;
    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      try {
        const qs = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}/api/shopee/orders${qs ? `?${qs}` : ''}`;
        log.info('Fetching Shopee orders', { url, attempt });

        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) throw new Error(`Shopee API ${res.status}`);

        const data = await res.json();
        const orders = data.orders || data.data || data || [];

        this._recordSuccess();
        this._cache = orders;
        this._cacheTs = Date.now();
        log.info('Fetched Shopee orders', { count: orders.length });
        return orders;
      } catch (err) {
        lastError = err;
        log.warn('Fetch attempt failed', { attempt, error: err.message });
      }
    }

    this._recordFailure();
    log.error('All fetch attempts failed', { error: lastError.message });
    return this._cache || [];
  }
}
