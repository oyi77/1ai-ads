import config from '../config/index.js';

/**
 * Resolve a user's Meta App-level credentials (App Creds).
 *
 * Priority:
 *   1. Per-user row in user_meta_apps (scoped, encrypted at rest).
 *   2. Global env fallback (shared operator creds) — only when no per-user row.
 *
 * Returns null when neither exists. Never throws on missing creds; callers
 * must handle the null (fail-closed) case.
 *
 * @param {string} userId
 * @param {object} userMetaAppsRepo
 * @returns {{
 *   source: 'user'|'global',
 *   app_id: string,
 *   app_secret: string,
 *   system_token: string,
 *   threads_id: string|null,
 *   threads_secret: string|null,
 *   apiVersion: string
 * }|null}
 */
export function resolveMetaAppCreds(userId, userMetaAppsRepo) {
  if (userId && userMetaAppsRepo) {
    const row = userMetaAppsRepo.getActive(userId);
    if (row && row.system_token) {
      return {
        source: 'user',
        app_id: row.app_id,
        app_secret: row.app_secret,
        system_token: row.system_token,
        threads_id: row.threads_id || null,
        threads_secret: row.threads_secret || null,
        apiVersion: config.metaApiVersion,
      };
    }
  }

  // Global fallback — shared operator creds.
  if (config.fbSystemToken) {
    return {
      source: 'global',
      app_id: config.fbAppId,
      app_secret: config.fbAppSecret,
      system_token: config.fbSystemToken,
      threads_id: config.fbThreadsId || null,
      threads_secret: config.fbThreadsSecret || null,
      apiVersion: config.metaApiVersion,
    };
  }

  return null;
}

/**
 * Resolve the webhook verify token + app secret for a per-user webhook.
 * Per-user webhooks use the user's app_secret to verify the HMAC signature,
 * falling back to the global FB_APP_SECRET.
 *
 * @param {string} userId
 * @param {object} userMetaAppsRepo
 * @returns {{ appSecret: string, verifyToken: string }}
 */
export function resolveWebhookCreds(userId, userMetaAppsRepo) {
  const creds = userId ? resolveMetaAppCreds(userId, userMetaAppsRepo) : null;
  const appSecret = creds?.app_secret || config.fbAppSecret;
  // Per-user verify token = userId (stable, unguessable by other users since it's a UUID).
  const verifyToken = userId ? String(userId) : (config.webhookVerifyToken || 'adforge_webhook_2026');
  return { appSecret, verifyToken };
}
