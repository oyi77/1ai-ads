/**
 * Bot Scheduler job — daily-dashboard.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupDailyDashboard(bot, deps).
 */
import cron from 'node-cron';
import { calculateCampaignStats, formatDailyReport } from '../../../domain/reporting.js';
import { safeSend, log } from '../helpers.js';

/**
 * Register the daily-dashboard cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupDailyDashboard(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 3. Daily Dashboard — 07:00 WIB (00:00 UTC)
  //    calculateCampaignStats + formatDailyReport → Telegram
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    log.info('Running daily dashboard job');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const stats = calculateCampaignStats(campaigns);
      const report = formatDailyReport(stats);
      await safeSend(bot, report, { parse_mode: 'Markdown' });
      log.info('Daily dashboard generated', { campaigns: stats.totalCampaigns, active: stats.activeCampaigns });
    } catch (err) {
      log.error('Daily dashboard failed', { error: err.message });
    }
  });
}
