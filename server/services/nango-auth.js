import { Nango } from '@nangohq/node';
import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('nango-auth');

/**
 * Nango-based OAuth token management layer.
 * Wraps Nango for centralized platform token storage and retrieval.
 * This is an OPTIONAL enhancement — all methods return null when Nango
 * is not configured, so callers can fall back to existing token management.
 */
export class NangoAuthService {
  constructor() {
    this.enabled = !!config.nangoSecretKey;
    if (this.enabled) {
      this.nango = new Nango({ secretKey: config.nangoSecretKey });
      log.info('Nango auth service initialized');
    } else {
      log.info('Nango not configured (NANGO_SECRET_KEY missing), using direct token management');
    }
  }

  /**
   * Store platform credentials in Nango.
   * @param {string} userId — internal user id
   * @param {string} platform — meta, google, tiktok, etc.
   * @param {object} credentials — { access_token, refresh_token, expires_at, ... }
   * @returns {Promise<boolean>} true if stored, false if Nango not configured
   */
  async storeCredentials(userId, platform, credentials) {
    if (!this.enabled) return false;

    const connectionId = `${userId}-${platform}`;
    try {
      await this.nango.createConnection(connectionId, platform, {
        credentials: {
          access_token: credentials.access_token,
          ...(credentials.refresh_token && { refresh_token: credentials.refresh_token }),
          ...(credentials.expires_at && { expires_at: credentials.expires_at }),
        },
      });
      log.info('Stored credentials in Nango', { userId, platform, connectionId });
      return true;
    } catch (err) {
      log.error('Failed to store credentials in Nango', { userId, platform, error: err.message });
      return false;
    }
  }

  /**
   * Get platform credentials from Nango.
   * Returns null if Nango is not configured or connection not found.
   * @param {string} userId — internal user id
   * @param {string} platform — meta, google, tiktok, etc.
   * @returns {Promise<object|null>} credentials or null
   */
  async getCredentials(userId, platform) {
    if (!this.enabled) return null;

    const connectionId = `${userId}-${platform}`;
    try {
      const conn = await this.nango.getConnection(connectionId, platform);
      if (!conn || !conn.credentials) return null;

      return {
        access_token: conn.credentials.access_token,
        refresh_token: conn.credentials.refresh_token || undefined,
        expires_at: conn.credentials.expires_at || undefined,
      };
    } catch (err) {
      log.debug('Nango connection not found', { userId, platform, error: err.message });
      return null;
    }
  }

  /**
   * Get the current access token for a user's connection via Nango.
   * NOTE: Nango's getConnection() does NOT auto-refresh — it returns the
   * stored token, which may be stale. Callers needing a genuinely fresh
   * token must call nango.refreshToken() separately (or fall back to local
   * token management).
   * Returns null if Nango is not configured or token cannot be obtained.
   * @param {string} userId — internal user id
   * @param {string} platform — meta, google, tiktok, etc.
   * @returns {Promise<string|null>} access token string or null
   */
  async getFreshToken(userId, platform) {
    if (!this.enabled) return null;

    const connectionId = `${userId}-${platform}`;
    try {
      const conn = await this.nango.getConnection(connectionId, platform);
      if (!conn || !conn.credentials || !conn.credentials.access_token) return null;

      return conn.credentials.access_token;
    } catch (err) {
      log.debug('Failed to get fresh token from Nango', { userId, platform, error: err.message });
      return null;
    }
  }
}
