import config from '../config/index.js';
import { resolveMetaAppCreds } from './meta-app-creds.js';
import { createLogger } from './logger.js';

const log = createLogger('meta-subscribe');

/**
 * Subscribe a user's Meta App to their per-user webhook callback.
 *
 * Meta App Subscriptions API (Graph API):
 *   POST https://graph.facebook.com/v{version}/{app_id}/subscriptions
 *     client_id={app_id}
 *     client_secret={app_secret}
 *     callback_url=https://{host}/webhooks/u/{userId}
 *     verify_token={userId}
 *     objects=page|user|permissions
 *     fields=...
 *
 * The verify token is the user's id; the callback URL is verified against the
 * user's own app_secret by the /webhooks/u/:userId handler. This keeps each
 * tenant's webhook delivery scoped to that tenant's credentials.
 *
 * @param {string} userId
 * @param {object} userMetaAppsRepo
 * @param {{ host?: string, apiVersion?: string }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: object }>}
 */
export async function subscribeUserWebhook(userId, userMetaAppsRepo, opts = {}) {
  const creds = resolveMetaAppCreds(userId, userMetaAppsRepo);
  if (!creds || !creds.app_secret) {
    return { ok: false, status: 0, body: { error: 'no_app_secret' } };
  }

  const apiVersion = opts.apiVersion || creds.apiVersion || config.metaApiVersion;
  const host = opts.host || process.env.TELEGRAM_WEBHOOK_HOST || 'adforge.aitradepulse.com';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const callbackUrl = `${protocol}://${host}/webhooks/u/${userId}`;

  const params = new URLSearchParams({
    client_id: creds.app_id,
    client_secret: creds.app_secret,
    callback_url: callbackUrl,
    verify_token: String(userId),
    objects: 'page',
    fields: 'feed,messages',
    include_values: 'true',
  });

  const url = `https://graph.facebook.com/v${apiVersion}/${creds.app_id}/subscriptions`;
  try {
    const res = await fetch(url, { method: 'POST', body: params });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok && !body.error;
    log.info('meta_subscribe_result', { userId, ok, status: res.status });
    return { ok, status: res.status, body };
  } catch (err) {
    log.error('meta_subscribe_failed', { userId, error: err.message });
    return { ok: false, status: 0, body: { error: err.message } };
  }
}

export default subscribeUserWebhook;
