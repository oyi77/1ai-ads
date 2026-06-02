/**
 * SELOW API Client — Ad Account Management via app.selow.id
 *
 * Handles: account listing, balance checking, topup initiation.
 * Auth: Cookie-based session (Next.js server actions).
 *
 * SOLID: Single Responsibility — only SELOW HTTP communication.
 * KISS: Thin wrapper over fetch with retry + circuit breaker.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('selow-api');
const BASE_URL = 'https://app.selow.id';

const CIRCUIT = {
  FAILURE_THRESHOLD: 5,
  HALF_OPEN_TIMEOUT_MS: 60_000,
  SUCCESS_TO_CLOSE: 3,
};

export class SelowAPI {
  constructor(cookies) {
    this._cookies = cookies || '';
    this._state = 'closed'; // closed | open | half-open
    this._failures = 0;
    this._successes = 0;
    this._openedAt = null;
  }

  /**
   * Update session cookies.
   */
  setCookies(cookies) {
    this._cookies = cookies;
  }

  // ─── Circuit Breaker ───

  _isOpen() {
    if (this._state !== 'open') return false;
    if (Date.now() - this._openedAt > CIRCUIT.HALF_OPEN_TIMEOUT_MS) {
      this._state = 'half-open';
      return false;
    }
    return true;
  }

  _recordSuccess() {
    if (this._state === 'half-open') {
      this._successes++;
      if (this._successes >= CIRCUIT.SUCCESS_TO_CLOSE) {
        this._state = 'closed';
        this._failures = 0;
        this._successes = 0;
        log.info('SELOW circuit breaker closed');
      }
    } else {
      this._failures = 0;
    }
  }

  _recordFailure() {
    this._failures++;
    if (this._failures >= CIRCUIT.FAILURE_THRESHOLD) {
      this._state = 'open';
      this._openedAt = Date.now();
      log.warn('SELOW circuit breaker opened', { failures: this._failures });
    }
  }

  // ─── HTTP Layer ───

  async _request(nextAction, body, path = '/facebook-account') {
    if (this._isOpen()) {
      throw new Error('SELOW circuit breaker is open');
    }

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: this._buildHeaders(nextAction),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`SELOW HTTP ${res.status}: ${res.statusText}`);
      }

      const data = this._parseResponse(await res.text());
      this._recordSuccess();
      return data;
    } catch (err) {
      this._recordFailure();
      log.error('SELOW request failed', { error: err.message });
      throw err;
    }
  }

  _buildHeaders(nextAction) {
    return {
      'accept': 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      'next-action': nextAction,
      'cookie': this._cookies,
      'Referer': `${BASE_URL}/facebook-account`,
    };
  }

  _parseResponse(text) {
    try { return JSON.parse(text); } catch { /* RSC format below */ }
    for (const line of text.split('\n')) {
      if (line.startsWith('1:')) return JSON.parse(line.substring(2));
    }
    throw new Error('SELOW response missing data payload');
  }

  // ─── API Methods ───

  /**
   * List all Facebook ad accounts.
   * @param {object} params - { search, status, current, pageSize }
   * @returns {object} { data: [...accounts], page, total, success }
   */
  async listAccounts({ search = '', status = '', current = 1, pageSize = 10 } = {}) {
    return this._request('30b6dc9079634f15a7ee981db1686dbc19fdbeb2', [
      '/api/account',
      { type: 'facebook', search, status, user: '', current, pageSize },
    ]);
  }

  /**
   * Get single account detail with balance.
   * @param {string} accountId - SELOW account ID
   * @returns {object} Account detail
   */
  async getAccount(accountId) {
    const result = await this.listAccounts({ search: accountId, pageSize: 100 });
    const account = result.data?.find(a => a.id === accountId || a._id === accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    return account;
  }

  /**
   * Initiate balance topup for an account.
   * @param {string} accountId - SELOW account ID
   * @param {number} amount - Amount in Rp (e.g., 500000)
   * @param {string} merchant - Payment merchant (e.g., 'bri', 'bca', 'mandiri')
   * @returns {object} { success, data: { noInvoice, total, paymentDetail, ... } }
   */
  async topupBalance(accountId, amount, merchant = 'bri') {
    return this._request('80790c891a317588b3cfaddef11859008a7fbeb8', [
      { amount, merchant },
      accountId,
    ]);
  }

  /**
   * Get aggregated balance info across all accounts.
   * @returns {object} { totalBalance, totalMetaBalance, accounts: [...] }
   */
  async getPortfolioSummary() {
    const { data: accounts = [] } = await this.listAccounts({ pageSize: 100 });
    return {
      ...this._calculatePortfolioTotals(accounts),
      accountCount: accounts.length,
      accounts: accounts.map(this._mapPortfolioAccount),
    };
  }

  _calculatePortfolioTotals(accounts) {
    return {
      totalBalance: accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
      totalMetaBalance: accounts.reduce((sum, a) => sum + (a.metaBalance?.balance || 0), 0),
      totalSpendCap: accounts.reduce((sum, a) => sum + (a.limit || 0), 0),
      totalSpent: accounts.reduce((sum, a) => sum + (a.metaBalance?.amountSpent || 0), 0),
      totalUnpaid: accounts.reduce((sum, a) => sum + (a.metaBalance?.unpaid || 0), 0),
    };
  }

  _mapPortfolioAccount(a) {
    return {
      id: a.id || a._id, label: a.label, accountName: a.accountName, status: a.status,
      balance: a.balance, metaBalance: a.metaBalance?.balance || 0, spendCap: a.limit,
      amountSpent: a.metaBalance?.amountSpent || 0,
    };
  }
}
