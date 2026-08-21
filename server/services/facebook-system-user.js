import { createLogger } from '../lib/logger.js';
import { PlatformError } from '../lib/errors.js';

const log = createLogger('meta-system-user');

export class FacebookSystemUserService {
  constructor({ systemToken, apiVersion = 'v22.0' }) {
    this.systemToken = systemToken;
    this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
  }

  /** Build a fresh instance from resolved user creds (no shared operator token). */
  static fromCreds({ system_token, apiVersion }) {
    return new FacebookSystemUserService({ systemToken: system_token, apiVersion: apiVersion || 'v22.0' });
  }

  /** Re-point this instance at a different token (per-request isolation). */
  setCreds({ systemToken, apiVersion }) {
    if (systemToken) this.systemToken = systemToken;
    if (apiVersion) this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
    return this;
  }

  async _graphGet(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('access_token', this.systemToken);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    log.debug('Graph GET', { path });
    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok || json.error) {
      const msg = json.error?.message || `Graph API error ${res.status}`;
      log.error('Graph GET failed', { path, status: res.status, msg });
      throw new PlatformError(msg, 'facebook', json.error?.code);
    }
    return json;
  }

  async _graphPost(path, body = {}) {
    const url = `${this.baseUrl}${path}?access_token=${this.systemToken}`;

    log.debug('Graph POST', { path });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      const msg = json.error?.message || `Graph API error ${res.status}`;
      log.error('Graph POST failed', { path, status: res.status, msg });
      throw new PlatformError(msg, 'facebook', json.error?.code);
    }
    return json;
  }

  /** GET /me/businesses — list Business Managers */
  async getBusinesses() {
    return this._graphGet('/me/businesses', {
      fields: 'id,name,verification_status',
    });
  }

  /** GET /{business_id}/owned_ad_accounts — ad accounts under a business */
  async getOwnedAdAccounts(businessId) {
    return this._graphGet(`/${businessId}/owned_ad_accounts`, {
      fields: 'account_id,name,account_status,currency,timezone_name,business_name',
    });
  }

  /** GET /{business_id}/owned_pages — pages under a business */
  async getOwnedPages(businessId) {
    return this._graphGet(`/${businessId}/owned_pages`, {
      fields: 'id,name,category,fan_count',
    });
  }

  /** GET /me/adaccounts — all ad accounts for the System User */
  async getAdAccounts() {
    return this._graphGet('/me/adaccounts', {
      fields: 'account_id,name,account_status,currency,timezone_name,business_name',
    });
  }

  /** GET /{account_id} — single ad account details */
  async getAdAccountDetails(accountId) {
    return this._graphGet(`/${accountId}`, {
      fields: 'account_id,name,account_status,currency,timezone_name,business_name,amount_spent,balance,spend_cap',
    });
  }

  /** POST /{account_id}/campaigns — create campaign */
  async createCampaign(accountId, params) {
    return this._graphPost(`/${accountId}/campaigns`, {
      name: params.name,
      objective: params.objective,
      status: params.status || 'PAUSED',
      special_ad_categories: params.special_ad_categories || [],
    });
  }
}
