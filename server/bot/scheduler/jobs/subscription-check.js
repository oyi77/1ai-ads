/**
 * Bot Scheduler job — subscription-check.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupSubscriptionCheck(bot, deps).
 */
import cron from 'node-cron';
import { safeSend, log } from '../helpers.js';

/**
 * Register the subscription-check cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupSubscriptionCheck(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 6. Subscription Check — 09:00 WIB (02:00 UTC)
  //    Find payments expiring within 7 days.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    log.info('Running subscription check');
    try {
      // Expire lapsed paid plans: downgrade + push a renewal checkout link.
      const expired = deps.repos?.usersRepo?.findExpiredPaidPlans?.() || [];
      for (const u of expired) {
        try {
          deps.repos?.usersRepo?.update(u.id, { plan: 'free', plan_expires_at: null });
          if (u.telegram_id && bot.telegram) {
            await bot.telegram.sendMessage(
              u.telegram_id,
              `⏰ Paket <b>${u.plan}</b> kamu sudah berakhir.\n\nPerpanjang untuk mempertahankan fitur Pro:\n👉 ${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/billing`,
              { parse_mode: 'HTML' }
            ).catch(() => {});
          }
          log.info('Plan downgraded after expiry', { userId: u.id, plan: u.plan });
        } catch (err) {
          log.warn('Plan expiry downgrade failed', { userId: u.id, error: err.message });
        }
      }

      const payments = deps.repos?.paymentsRepo?.findAll?.() || [];
      const now = new Date();
      const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
      const SUBSCRIPTION_DAYS = 30;

      const expiring = payments.filter(p => {
        if (p.status !== 'completed') return false;
        const expiresAt = new Date(p.updated_at);
        expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DAYS);
        return (expiresAt - now) < EXPIRY_WINDOW_MS;
      });
      if (expiring.length > 0) {
        await safeSend(bot, `💳 ${expiring.length} subscription(s) expiring within 7 days`);
      }
      log.info('Subscription check complete', { expiring: expiring.length });
    } catch (err) {
      log.error('Subscription check failed', { error: err.message });
    }
  });
}
