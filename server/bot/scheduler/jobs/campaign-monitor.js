/**
 * Bot Scheduler job — campaign-monitor.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupCampaignMonitor(bot, deps).
 */
import cron from 'node-cron';
import {
  detectRoasDrop,
  evaluateStoploss,
  evaluateScaleEligibility,
  generateReport,
} from '../../../domain/optimization.js';
import { filterActiveCampaigns } from '../../../lib/campaign-status.js';
import { ownerSend, log } from '../helpers.js';

/**
 * Register the campaign-monitor cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupCampaignMonitor(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 1. Campaign Monitor — every 6 hours
  //    For each active campaign: generateReport + evaluateStoploss.
  //    Alert on KILL / REDUCE_BUDGET. Check scale eligibility on SCALE_UP.
  //    Dedup: max 1 alert per campaign per day.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    log.info('Running campaign monitor job');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const active = filterActiveCampaigns(campaigns);
      const EVAL_DAYS = parseInt(process.env.EVALUATION_DAYS || '3', 10);
      const today = new Date().toISOString().slice(0, 10);

      for (const campaign of active) {
        const spend = campaign.spend || 0;
        const revenue = campaign.revenue || 0;
        const roas = spend > 0 ? revenue / spend : 0;
        const daysRunning = campaign.days_running || 0;

        // Generate report with domain function
        const report = generateReport({
          product: campaign.name,
          day: daysRunning,
          totalDays: EVAL_DAYS,
          spend,
          commission: revenue,
        });

        // Evaluate stoploss
        const stoploss = evaluateStoploss({
          currentROAS: roas,
          previousROAS: campaign.previous_roas || roas,
          consecutiveDrops: campaign.consecutive_drops || 0,
          alreadyReducedBudget: campaign.budget_reduced || false,
          currentDailyBudget: campaign.budget || 0,
        });

        // Persist stoploss state so the cascade can escalate across runs.
        // evaluateStoploss returns {action, newBudget, reason} — the drop
        // detection must be computed here so we can track consecutive_drops.
        const prevDrops = campaign.consecutive_drops || 0;
        const dropResult = detectRoasDrop(roas, campaign.previous_roas || roas);
        const newDrops = dropResult.dropped ? prevDrops + 1 : 0;
        const stateUpdate = {
          previous_roas: roas,
          consecutive_drops: newDrops,
          budget_reduced: stoploss.action === 'REDUCE_BUDGET' ? 1 : (campaign.budget_reduced ? 1 : 0),
        };
        try {
          deps.repos?.campaignsRepo?.update?.(campaign.id, stateUpdate);
        } catch { /* best-effort state persist */ }

        if (stoploss.action === 'KILL' || stoploss.action === 'REDUCE_BUDGET') {
          // Dedup: max 1 alert per campaign per day
          const dedupKey = `campaign_monitor_alerted_${campaign.id}_${today}`;
          if (deps.repos?.settingsRepo?.get(dedupKey)) continue;

          await ownerSend(bot, deps, campaign.user_id, `⚠️ *${campaign.name}*: ${stoploss.reason}`, { parse_mode: 'Markdown' });
          deps.repos?.settingsRepo?.set(dedupKey, new Date().toISOString());
        }

        // Check scale eligibility on WINNING
        if (report.decision === 'SCALE_UP') {
          const scaleResult = evaluateScaleEligibility({
            roas,
            ctr: campaign.ctr || 0,
            cpc: campaign.cpc || Infinity,
          });
          if (scaleResult.canScale) {
            // Dedup: max 1 scale alert per campaign per day
            const dedupKey = `campaign_monitor_scale_${campaign.id}_${today}`;
            if (!deps.repos?.settingsRepo?.get(dedupKey)) {
              await ownerSend(bot, deps, campaign.user_id, `🚀 *${campaign.name}* eligible to scale!\n${scaleResult.reason}`, { parse_mode: 'Markdown' });
              deps.repos?.settingsRepo?.set(dedupKey, new Date().toISOString());
            }
          }
        }
      }
      log.info('Campaign monitor complete', { checked: active.length });
    } catch (err) {
      log.error('Campaign monitor failed', { error: err.message });
    }
  });
}
