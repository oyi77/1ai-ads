/**
 * Scalev.id API client for checkout and payment integration.
 * API Base: https://api.scalev.id/v2
 * Auth: Bearer token
 * Docs: https://developers.scalev.id/
 */

import { createLogger } from '../lib/logger.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';

const log = createLogger('scalev');
const SCALEV_API_BASE = 'https://api.scalev.id/v2';

export class ScalevService {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  _getConfig() {
    const creds = this.settingsRepo.getCredentials('scalev');
    if (!creds?.api_token) {
      throw new ConfigurationError('Scalev API token not configured. Go to Settings to add it.');
    }
    return {
      token: creds.api_token,
      storeUrl: creds.store_url || null,
    };
  }

  async _request(method, path, body = null) {
    const { token } = this._getConfig();
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${SCALEV_API_BASE}${path}`, opts);
    const data = await res.json();

    if (data.code && data.code !== 200 && data.code !== 201) {
      throw new PlatformError(`Scalev API error: ${data.status || data.message || 'Unknown error'}`, 'scalev', data.code);
    }

    return data;
  }

  /**
   * List products from Scalev store.
   */
  async listProducts() {
    log.debug('Fetching Scalev products');
    const data = await this._request('GET', '/products');
    const products = data.data?.results || data.data || [];
    log.debug('Scalev products fetched', { count: products.length });
    return products;
  }

  /**
   * Create an order in Scalev (generates checkout link).
   */
  async createOrder({ storeUniqueId, customerName, customerPhone, customerEmail, variantUniqueId, quantity = 1, paymentMethod = 'invoice' }) {
    log.info('Creating Scalev order', { storeUniqueId, customerEmail, paymentMethod });
    const data = await this._request('POST', '/orders', {
      store_unique_id: storeUniqueId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      ordervariants: [{
        quantity,
        variant_unique_id: variantUniqueId,
      }],
      payment_method: paymentMethod,
    });
    log.info('Scalev order created', { orderId: data.data?.order_id });
    return data.data;
  }

  /**
   * Get order details from Scalev.
   */
  async getOrder(orderId) {
    const data = await this._request('GET', `/orders/${orderId}`);
    return data.data;
  }

  /**
   * Get the embed URL for a Scalev checkout form.
   * Returns an iframe-compatible URL for embedding in landing pages.
   */
  getEmbedUrl(storeSlug, pageSlug) {
    const { storeUrl } = this._getConfig();
    if (storeUrl) {
      return `${storeUrl}/${pageSlug || ''}`;
    }
    return `https://${storeSlug}.myscalev.com/${pageSlug || ''}`;
  }

  /**
   * Check if Scalev is configured and reachable.
   */
  async checkConnection() {
    try {
      await this.listProducts();
      return { connected: true };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}
