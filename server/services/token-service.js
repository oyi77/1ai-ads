import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';

const log = createLogger('token-service');
const BASE = `https://graph.facebook.com/${config.metaApiVersion}`;

export class TokenService {
  async exchangeForLongLived(shortToken) {
    log.info('exchangeForLongLived');
    const url = `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.fbAppId}&client_secret=${config.fbAppSecret}&fb_exchange_token=${shortToken}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.access_token) {
      log.info('token_exchanged', { expiresIn: data.expires_in });
    }
    return data;
  }

  async debugToken(token) {
    log.info('debugToken');
    const url = `${BASE}/debug_token?input_token=${token}&access_token=${config.fbSystemToken || token}`;
    const resp = await fetch(url);
    return resp.json();
  }

  async getTokenInfo(token) {
    const debug = await this.debugToken(token);
    const info = debug.data || {};
    return {
      valid: info.is_valid || false,
      appId: info.app_id,
      userId: info.user_id,
      scopes: info.scopes || [],
      expiresAt: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
      isValid: info.is_valid || false
    };
  }
}
