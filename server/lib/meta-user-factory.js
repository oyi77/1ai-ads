import { MetaAdsAPI } from '../services/meta/index.js';
import { WhatsAppAdsAPI } from '../services/whatsapp/index.js';
import { FacebookSystemUserService } from '../services/facebook-system-user.js';
import { resolveMetaAppCreds } from './meta-app-creds.js';

/**
 * Build per-user Meta clients bound to the caller's own App Creds
 * (or the global operator fallback). Callers MUST pass the authenticated
 * userId so a tenant can never borrow another tenant's token.
 *
 * @param {string} userId
 * @param {object} userMetaAppsRepo
 * @returns {{
 *   creds: object|null,
 *   metaApi: MetaAdsAPI,
 *   whatsappApi: WhatsAppAdsAPI,
 *   systemUser: FacebookSystemUserService,
 * }}
 */
export function buildUserMetaClients(userId, userMetaAppsRepo) {
  const creds = resolveMetaAppCreds(userId, userMetaAppsRepo);

  // MetaAdsAPI already prefers _explicitToken; withToken covers per-user.
  const metaApi = creds ? MetaAdsAPI.withToken(creds.system_token) : new MetaAdsAPI();
  const whatsappApi = creds ? WhatsAppAdsAPI.withToken(creds.system_token) : new WhatsAppAdsAPI(null);
  // System user service wraps the same system token (ad-account discovery).
  const systemUser = creds
    ? FacebookSystemUserService.fromCreds({ system_token: creds.system_token, apiVersion: creds.apiVersion })
    : new FacebookSystemUserService({ systemToken: '', apiVersion: creds?.apiVersion || 'v22.0' });

  return { creds, metaApi, whatsappApi, systemUser };
}
