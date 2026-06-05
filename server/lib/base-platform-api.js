import { safeFetch } from './platform-client.js';
import { createLogger } from './logger.js';
import { ConfigurationError } from './errors.js';

export class BasePlatformApiClient {
  /**
   * @param {string} platformName - Platform identifier (meta, tiktok, google)
   * @param {object} [settingsRepo] - Settings repository for credential resolution
   * @param {object} [opts] - Additional options
   * @param {string} [opts.baseUrl] - API base URL
   */
  constructor(platformName, settingsRepo = null, opts = {}) {
    this.platformName = platformName;
    this.settingsRepo = settingsRepo;
    this._explicitToken = null;
    this._activeAccountId = null;
    this._baseUrl = opts.baseUrl || '';
    this.log = createLogger(`${platformName}-api`);
  }

  /**
   * Resolve API token. Override in subclasses for platform-specific resolution.
   * Default: check explicit token > settings repo > throw
   */
  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials(this.platformName);
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(
      `${this.platformName} access token not configured. Go to Settings to connect.`
    );
  }

  /**
   * Set active account context for multi-account support.
   */
  setActiveAccount(accountId, accessToken) {
    this._activeAccountId = accountId;
    this._explicitToken = accessToken;
  }

  clearActiveAccount() {
    this._activeAccountId = null;
    this._explicitToken = null;
  }

  /**
   * GET request to platform API with automatic token injection.
   * @param {string} path - URL path (appended to baseUrl)
   * @param {object} [params] - Query parameters
   * @param {object} [extraHeaders] - Additional headers
   * @returns {Promise<object>} Parsed JSON response
   */
  async _get(path, params = {}, extraHeaders = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch(this.platformName, url.toString(), {
      headers: { ...extraHeaders },
    });
    return await res.json();
  }

  /**
   * POST request to platform API with automatic token injection.
   */
  async _post(path, body = {}, extraHeaders = {}) {
    const res = await safeFetch(this.platformName, `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  /**
   * DELETE request to platform API.
   */
  async _delete(path, extraHeaders = {}) {
    const res = await safeFetch(this.platformName, `${this._baseUrl}${path}`, {
      method: 'DELETE',
      headers: { ...extraHeaders },
    });
    return await res.json();
  }
}