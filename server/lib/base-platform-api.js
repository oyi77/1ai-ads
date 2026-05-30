import { safeFetch } from './platform-client.js';
import { createLogger } from './logger.js';
import { ConfigurationError } from './errors.js';

export class BasePlatformApiClient {
  constructor(platformName, settingsRepo) {
    this.platformName = platformName;
    this.settingsRepo = settingsRepo;
    this.log = createLogger(`${platformName}-api`);
  }

  _getToken() {
    const creds = this.settingsRepo.getCredentials(this.platformName);
    if (!creds?.access_token) {
      throw new ConfigurationError(
        `${this.platformName} access token not configured. Go to Settings to connect.`
      );
    }
    return creds.access_token;
  }

  async _get(baseUrl, path, params = {}) {
    const token = this._getToken();
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch(this.platformName, url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return await res.json();
  }

  async _post(baseUrl, path, body = {}) {
    const token = this._getToken();
    const res = await safeFetch(this.platformName, `${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  }
}
