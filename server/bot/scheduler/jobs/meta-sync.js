/**
 * Bot Scheduler job — meta-sync.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupMetaSync(bot, deps).
 */
import { resolveOwnerPlatformToken } from '../../../lib/resolve-owner-platform.js';
import { hasUsableAccount } from '../../../lib/token-health.js';
import { scheduleJob, log } from '../helpers.js';

/**
 * Register the meta-sync cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupMetaSync(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 8. Meta Campaign Sync — every 6h at :30
  //    Sync remote campaigns from Meta API → local DB.
  // ────────────────────────────────────────────────────────────
  scheduleJob('30 */6 * * *', 'meta-sync', async () => {
    log.info('Running multi-platform campaign sync');
    try {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      if (!platformAccountsRepo || !settingsRepo) return;

      const { listPlatformKeys, getPlatform } = await import('../../../platforms/index.js');
      const keys = listPlatformKeys();
      let synced = 0;
      let platformsSynced = 0;

      for (const platform of keys) {
        // Per-user fan-out: each connected user gets their own token bound,
        // so the adapter syncs THAT user's accounts (SaaS isolation).
        const userRows = platformAccountsRepo.getDistinctUserPlatforms
          ? platformAccountsRepo.getDistinctUserPlatforms(platform)
          : [];
        if (!userRows.length) continue;

        for (const row of userRows) {
          try {
            // getDistinctUserPlatforms() only reports which users have an
            // ACTIVE account; it does not know whether that credential still
            // works. Skip owners whose only accounts are dead.
            const owned = platformAccountsRepo.findAllActiveByUserAndPlatform?.(row.user_id, platform) || [];
            if (!hasUsableAccount(owned)) {
              log.debug('No usable token — skipping platform sync', { platform, user: row.user_id });
              continue;
            }
            const token = resolveOwnerPlatformToken(platform, row.user_id, {
              platformAccountsRepo,
              settingsRepo,
            });
            if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) {
              log.debug('Placeholder token — skipping sync', { platform, account: row.user_id });
              continue;
            }
            const PlatformClass = await getPlatform(platform, settingsRepo);
            // Bind the OWNER's token so syncAllAccounts() resolves that user's accounts.
            const api = new PlatformClass();
            api.setActiveAccount(null, token, true);
            const results = await api.syncAllAccounts();
            synced += Array.isArray(results) ? results.length : 0;
          } catch (err) {
            log.warn('Platform sync account error', { platform, account: row.user_id, error: err.message });
          }
        }
        platformsSynced++;
      }
      log.info('Multi-platform campaign sync complete', { platformsSynced, synced });
    } catch (err) {
      log.error('Multi-platform campaign sync failed', { error: err.message });
    }
  });
}
