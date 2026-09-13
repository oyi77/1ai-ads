/**
 * Bot Scheduler job — daily-eval-guard.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupDailyEvalGuard(bot, deps).
 */
import cron from 'node-cron';
import { evaluateMetrics } from '../../../domain/optimization.js';
import { filterActiveCampaigns } from '../../../lib/campaign-status.js';
import { esc, ownerSend, log } from '../helpers.js';

/**
 * Register the daily-eval-guard cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupDailyEvalGuard(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 9. Daily Eval Guard — 01:00 WIB (18:00 UTC previous day)
  //    evaluateMetrics on all active campaigns. Flag LOSING.
  //    Dedup: max 1 alert per campaign per day.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 18 * * *', async () => {
    log.info('Running daily eval guard');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const active = filterActiveCampaigns(campaigns);
      // Group by owner: a digest lists campaign NAMES, so sending one combined
      // message to the admin chat would show every customer's campaigns to
      // whoever is in that chat. Each owner gets only their own list.
      const byOwner = new Map();
      const today = new Date().toISOString().slice(0, 10);

      for (const campaign of active) {
        const spend = campaign.spend || 0;
        const revenue = campaign.revenue || 0;
        if (spend <= 0) continue;

        const metrics = evaluateMetrics(revenue, spend);
        if (metrics.status === 'LOSING') {
          // Dedup: only report each campaign once per day
          const dedupKey = `daily_eval_alerted_${campaign.id}_${today}`;
          if (deps.repos?.settingsRepo?.get(dedupKey)) continue;

          const ownerId = campaign.user_id ?? null;
          if (!byOwner.has(ownerId)) byOwner.set(ownerId, []);
          byOwner.get(ownerId).push({ name: campaign.name, roas: metrics.roas, profit: metrics.profit, dedupKey });
        }
      }

      let notified = 0;
      for (const [ownerId, list] of byOwner) {
        // Only the first 10 are shown, but EVERY underperformer gets its dedup
        // key written below — otherwise the ones left out of the message would
        // re-alert every day while the (truncated) list stays identical.
        const shown = list.slice(0, 10);
        const lines = shown.map(c =>
          `• <b>${esc(c.name)}</b>: ROAS ${c.roas.toFixed(2)}x, loss Rp ${Math.abs(c.profit).toLocaleString('id-ID')}`,
        );
        if (list.length > shown.length) {
          lines.push(`…and ${list.length - shown.length} more`);
        }
        const text = `🔴 <b>Daily Eval — ${list.length} underperformer(s)</b>\n${lines.join('\n')}`;
        // The admin fallback carries no campaign names.
        const fallback = `🔴 <b>Daily Eval — ${list.length} underperformer(s)</b> (owner has no Telegram link)`;
        const delivered = await ownerSend(bot, deps, ownerId, text, { parse_mode: 'HTML' }, fallback);
        notified += delivered ? list.length : 0;
        for (const c of list) {
          deps.repos?.settingsRepo?.set(c.dedupKey, new Date().toISOString());
        }
      }

      log.info('Daily eval guard complete', {
        checked: active.length,
        underperformers: [...byOwner.values()].reduce((n, l) => n + l.length, 0),
        notified,
      });
    } catch (err) {
      log.error('Daily eval guard failed', { error: err.message });
    }
  });
}
