import { createLogger } from '../lib/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const log = createLogger('shopee-adapter');

const FAILURE_THRESHOLD = 5;
const HALF_OPEN_TIMEOUT_MS = 60_000;
const SUCCESS_TO_CLOSE = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RETRY_COUNT = 2;

const SHOPEE_DOMAINS = {
  id: { seller: 'seller.shopee.co.id', affiliate: 'affiliate.shopee.co.id', main: 'shopee.co.id' },
  my: { seller: 'seller.shopee.com.my', affiliate: 'affiliate.shopee.com.my', main: 'shopee.com.my' },
  th: { seller: 'seller.shopee.co.th', affiliate: 'affiliate.shopee.co.th', main: 'shopee.co.th' },
  vn: { seller: 'seller.shopee.vn', affiliate: 'affiliate.shopee.vn', main: 'shopee.vn' },
  ph: { seller: 'seller.shopee.ph', affiliate: 'affiliate.shopee.ph', main: 'shopee.ph' },
  sg: { seller: 'seller.shopee.sg', affiliate: 'affiliate.shopee.sg', main: 'shopee.sg' },
  br: { seller: 'seller.shopee.com.br', affiliate: 'affiliate.shopee.com.br', main: 'shopee.com.br' },
  mx: { seller: 'seller.shopee.com.mx', affiliate: 'affiliate.shopee.com.mx', main: 'shopee.com.mx' },
  co: { seller: 'seller.shopee.com.co', affiliate: 'affiliate.shopee.com.co', main: 'shopee.com.co' },
  cl: { seller: 'seller.shopee.cl', affiliate: 'affiliate.shopee.cl', main: 'shopee.cl' },
};

export class ShopeeAdapter {
  constructor(baseUrl = 'http://localhost:8200', sellerCookiesPath = null, country = 'id') {
    this.baseUrl = baseUrl;
    this.country = country;
    this.domain = SHOPEE_DOMAINS[country] || SHOPEE_DOMAINS.id;
    this.sellerCookiesPath = sellerCookiesPath || join(process.cwd(), 'config', 'shopee_seller_cookies.json');
    this._sellerCookies = this._loadSellerCookies();
    this._csrfToken = this._extractCsrf(this._sellerCookies);
    this._state = 'closed';
    this._failures = 0;
    this._successes = 0;
    this._openedAt = null;
    this._cache = null;
    this._cacheTs = 0;
  }

  _loadSellerCookies() {
    try {
      const raw = readFileSync(this.sellerCookiesPath, 'utf-8');
      const data = JSON.parse(raw);
      return data.cookies || [];
    } catch {
      return [];
    }
  }

  _extractCsrf(cookies) {
    const csrf = cookies.find(c => c.name === 'csrftoken');
    return csrf ? csrf.value : '';
  }

  _cookieHeader() {
    return this._sellerCookies.map(c => `${c.name}=${c.value}`).join('; ');
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

  async fetchOrdersDirect(params = {}) {
    if (!this._sellerCookies.length) return null;

    try {
      const body = {
        page_number: params.page || 1,
        page_size: params.limit || 50,
      };

      const res = await fetch(`https://${this.domain.seller}/api/v3/order/search_order_list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': `https://${this.domain.seller}/portal/sale`,
          'X-CSRFToken': this._csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': this._cookieHeader(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) throw new Error(`Seller API ${res.status}`);
      const data = await res.json();
      if (data.errcode) throw new Error(`Seller API error: ${data.message}`);

      const orders = (data.data?.order_list || []).map(o => ({
        order_id: o.order_sn,
        status: o.order_status,
        total: o.total_amount,
        currency: 'IDR',
        created_at: o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
        items: (o.item_list || []).map(i => ({
          product_id: i.item_id?.toString(),
          name: i.model_name,
          quantity: i.model_quantity_purchased,
          price: i.model_original_price,
        })),
      }));

      log.info('Fetched orders from seller API', { count: orders.length });
      return orders;
    } catch (err) {
      log.warn('Seller API fetch failed', { error: err.message });
      return null;
    }
  }

  async fetchOrders(params = {}) {
    const state = this.getCircuitState();
    if (state === 'open' && !params.force) {
      log.warn('Circuit open, returning cached data');
      return this._cache || [];
    }

    if (this._cache && Date.now() - this._cacheTs < CACHE_TTL_MS && !params.force) {
      return this._cache;
    }

    // Try direct seller API first
    const directOrders = await this.fetchOrdersDirect(params);
    if (directOrders && directOrders.length > 0) {
      this._recordSuccess();
      this._cache = directOrders;
      this._cacheTs = Date.now();
      return directOrders;
    }

    // Fallback to 1ai-social API
    let lastError;
    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      try {
        const qs = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}/api/shopee/orders${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`1ai-social API ${res.status}`);
        const data = await res.json();
        const orders = data.orders || data.data || data || [];
        this._recordSuccess();
        this._cache = orders;
        this._cacheTs = Date.now();
        log.info('Fetched orders from 1ai-social', { count: orders.length });
        return orders;
      } catch (err) {
        lastError = err;
        log.warn('1ai-social fetch failed', { attempt, error: err.message });
      }
    }

    this._recordFailure();
    log.error('All fetch attempts failed', { error: lastError?.message });
    return this._cache || [];
  }
}
