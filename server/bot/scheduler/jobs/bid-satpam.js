/**
 * Bot Scheduler job — bid-satpam.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupBidSatpam(bot, deps).
 */
import { MetaAdsAPI } from '../../../services/meta/index.js';
import { resolveOwnerPlatformToken } from '../../../lib/resolve-owner-platform.js';
import { filterUsableAccounts } from '../../../lib/token-health.js';
import { safeSend, scheduleJob, log } from '../helpers.js';

/**
 * Register the bid-satpam cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupBidSatpam(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 2. Bid Satpam — every 5 minutes
  //    Check adset bid_amount against BID_MIN..BID_MAX range.
  //    Log adjustments needed.
  // ────────────────────────────────────────────────────────────
  scheduleJob('*/5 * * * *', 'bid-satpam', async () => {
    log.info('Running bid satpam job');
    try {
      const BID_MIN = parseInt(process.env.BID_SATPAM_MIN || '130', 10);
      const BID_MAX = parseInt(process.env.BID_SATPAM_MAX || '150', 10);
      const BID_TARGET = parseInt(process.env.BID_SATPAM_TARGET || '140', 10);

      // Skip accounts whose credential is known-dead (flagged by the token
      // health cron or a previous expiry) so dead tokens stop costing requests.
      const accounts = filterUsableAccounts(deps.repos?.platformAccountsRepo?.getAccounts?.('meta') || []);
      let adjusted = 0;

      for (const account of accounts) {
        try {
          const token = resolveOwnerPlatformToken('meta', account.user_id, { platformAccountsRepo: deps.repos?.platformAccountsRepo, settingsRepo: deps.repos?.settingsRepo });
          if (!token || token.startsWith('demo-meta-token')) {
            log.debug('No real Meta token — skipping bid satpam');
            continue;
          }
          const ownerApi = MetaAdsAPI.withToken(token);
          const adAccountId = account.credentials?.ad_account_id;
          if (!adAccountId || !/^\d+$/.test(String(adAccountId).replace(/^act_/, ''))) {
            log.debug('No real Meta ad-account id — skipping bid satpam');
            continue;
          }
          const adsets = await ownerApi.getAdSets?.(adAccountId) || [];
          for (const adset of adsets) {
            const bid = adset.bid_amount;
            if (!bid) continue;
            if (bid < BID_MIN) {
              log.info('Bid below minimum — needs raise', { adset: adset.name, bid, target: BID_TARGET });
              adjusted++;
            } else if (bid > BID_MAX) {
              log.info('Bid above maximum — needs lower', { adset: adset.name, bid, target: BID_TARGET });
              adjusted++;
            }
          }
        } catch (err) {
          log.warn('Bid satpam account error', { account: account.account_name, error: err.message });
        }
      }
      if (adjusted > 0) {
        await safeSend(bot, `🛡️ Bid Satpam: ${adjusted} adset(s) need bid adjustment`);
      }
      log.info('Bid satpam check complete', { adjusted });
    } catch (err) {
      log.error('Bid satpam failed', { error: err.message });
    }
  });
}
