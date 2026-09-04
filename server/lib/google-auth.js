/**
 * Google Ads OAuth2 token refresh utility.
 * Handles exchanging refresh_token for access_token with caching.
 */
import { createLogger } from './logger.js';

const log = createLogger('google-auth');

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Exchange Google OAuth2 refresh_token for access_token.
 * @param {string} refreshToken - Google OAuth2 refresh token
 * @param {string} clientId - Google OAuth2 client ID
 * @param {string} clientSecret - Google OAuth2 client secret
 * @returns {Promise<{accessToken: string, expiresIn: number}>}
 */
export async function refreshGoogleToken(refreshToken, clientId, clientSecret) {
  const now = Date.now();
  
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    log.debug('Using cached Google access token');
    return { accessToken: cachedToken, expiresIn: Math.floor((tokenExpiry - now) / 1000) };
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google OAuth2 refresh failed: ${error?.error_description || error?.error || response.statusText}`);
    }

    const data = await response.json();
    
    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in || 3600) * 1000;
    
    log.info('Google access token refreshed', { expiresIn: data.expires_in });
    
    return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
  } catch (err) {
    log.error('Google token refresh failed', { error: err.message });
    throw err;
  }
}

/**
 * Clear cached token (e.g., on logout or token revocation).
 */
export function clearGoogleTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
  log.debug('Google token cache cleared');
}
