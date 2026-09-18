/**
 * Bot Scheduler — Cron jobs for automated tasks
 * Ported from asisten-jualan/scheduler/jobs.py
 *
 * Uses node-cron for scheduling. All jobs run in Express process.
 *
 * Per-job setup functions live in ./scheduler/jobs/ (one module per cron
 * job); shared helpers live in ./scheduler/helpers.js. This module only
 * wires them together. Every export from the pre-split module is preserved.
 */
import cron from 'node-cron';
import { log } from './scheduler/helpers.js';
import { setupCampaignMonitor } from './scheduler/jobs/campaign-monitor.js';
import { setupBidSatpam } from './scheduler/jobs/bid-satpam.js';
import { setupDailyDashboard } from './scheduler/jobs/daily-dashboard.js';
import { setupTokenHealth } from './scheduler/jobs/token-health.js';
import { setupRuleGuard } from './scheduler/jobs/rule-guard.js';
import { setupAccountDigest } from './scheduler/jobs/account-digest.js';
import { setupHourlyAnomaly } from './scheduler/jobs/hourly-anomaly.js';
import { setupSubscriptionCheck } from './scheduler/jobs/subscription-check.js';
import { setupMetaSync } from './scheduler/jobs/meta-sync.js';
import { setupDraftReminder } from './scheduler/jobs/draft-reminder.js';
import { setupDailyEvalGuard } from './scheduler/jobs/daily-eval-guard.js';
import { setupDbBackup } from './scheduler/jobs/db-backup.js';

export { evaluateRuleForCampaign } from './scheduler/helpers.js';

/**
 * Initialize all scheduled jobs.
 * @param {import('telegraf').Telegraf} bot — Telegram bot instance
 * @param {{ repos: object, services: object }} deps
 */
export function initScheduler(bot, deps) {
  setupCampaignMonitor(bot, deps);
  setupBidSatpam(bot, deps);
  setupDailyDashboard(bot, deps);
  setupTokenHealth(bot, deps);
  setupRuleGuard(bot, deps);
  setupAccountDigest(bot, deps);
  setupHourlyAnomaly(bot, deps);
  setupSubscriptionCheck(bot, deps);
  setupMetaSync(bot, deps);
  setupDailyEvalGuard(bot, deps);
  setupDraftReminder(bot, deps);
  // 10. Auto-scale — triggered by campaign monitor (not cron)
  //     Runs when campaign monitor (job 1) reports decision SCALE_UP and
  //     evaluateScaleEligibility returns canScale. The status column is NOT
  //     involved: 'WINNING'/'LOSING' are performance grades from
  //     domain/optimization.js and are never stored in campaigns.status.
  //     Handled inside campaign monitor job above.

  setupDbBackup(bot, deps);
  // ────────────────────────────────────────────────────────────

  log.info(`Bot scheduler initialized with ${cron.getTasks?.().size ?? '?'} cron jobs`);
}
