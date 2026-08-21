import { createLogger } from '../../lib/logger.js';
import { subscribeUserWebhook } from '../../lib/meta-subscribe.js';

const log = createLogger('meta-app-handlers');


/**
 * GET /api/meta-app — return the current user's App Creds (masked).
 * Never returns app_secret / system_token / threads_secret in cleartext.
 */
export function handleGetMetaApp(userMetaAppsRepo) {
  return (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const masked = userMetaAppsRepo.getMasked(userId);
    res.json({
      success: true,
      data: masked || null,
      // true when the user has set personal creds; false = using operator fallback
      scoped: Boolean(masked),
    });
  };
}

/**
 * POST /api/meta-app — create or replace the current user's App Creds.
 * Body: { app_id, app_secret, system_token, threads_id?, threads_secret? }
 */
export function handlePostMetaApp(userMetaAppsRepo) {
  return (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { app_id, app_secret, system_token, threads_id, threads_secret } = req.body || {};
    if (!app_id || !app_secret || !system_token) {
      return res.status(400).json({
        success: false,
        error: 'app_id, app_secret and system_token are required',
      });
    }

    const row = userMetaAppsRepo.upsert(userId, {
      app_id: String(app_id),
      app_secret: String(app_secret),
      system_token: String(system_token),
      threads_id: threads_id ? String(threads_id) : null,
      threads_secret: threads_secret ? String(threads_secret) : null,
    });

    // Best-effort: subscribe the user's Meta app to their per-user webhook.
    // Non-blocking — a failure here does not fail the save.
    subscribeUserWebhook(userId, userMetaAppsRepo).catch((err) =>
      log.warn('meta_app_subscribe_async_failed', { userId, error: err.message })
    );

    log.info('meta_app_creds_saved', { userId });
    res.json({ success: true, data: userMetaAppsRepo.getMasked(userId) || row });
  };
}

/**
 * DELETE /api/meta-app — remove the current user's App Creds.
 */
export function handleDeleteMetaApp(userMetaAppsRepo) {
  return (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    userMetaAppsRepo.delete(userId);
    log.info('meta_app_creds_deleted', { userId });
    res.json({ success: true, data: { removed: true } });
  };
}
