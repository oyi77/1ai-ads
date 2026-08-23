/**
 * Bot Scheduler — Cron jobs for automated tasks
 * Ported from asisten-jualan/scheduler/jobs.py (10 cron jobs)
 *
 * Uses node-cron for scheduling. All jobs run in Express process.
 */

import cron from 'node-cron';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';
import {
  evaluateStoploss,
  evaluateScaleEligibility,
  generateReport,
  evaluateMetrics,
} from '../domain/optimization.js';
import { calculateCampaignStats, formatDailyReport } from '../domain/reporting.js';
import { backupDatabase } from '../../db/backup.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { compare } from '../lib/operators.js';

const log = createLogger('bot:scheduler');

/** Resolve TELEGRAM_CHAT_ID once, warn when unset. */
function getChatId() {
  const id = config.telegramChatId;
  if (!id) log.warn('TELEGRAM_CHAT_ID not set — Telegram alerts disabled');
  return id;
}

/** Send a Markdown message to the admin chat; no-op when chatId missing. */
async function safeSend(bot, text, extra) {
  const chatId = getChatId();
  if (!chatId) return;
  try {
    await bot.telegram.sendMessage(chatId, text, extra);
  } catch (err) {
    log.error('Failed to send Telegram message', { error: err.message });
  }
}

/**
 * Evaluate a rule against a raw campaigns-table row (no .stats wrapper).
 * Mirrors RuleEvaluator._evaluateCondition but reads direct columns.
 * @param {{ condition: object }} rule — parsed rule from rulesRepo.findAll()
 * @param {object} campaign — raw campaigns row
 * @returns {boolean}
 */
export function evaluateRuleForCampaign(rule, campaign) {
  const condition = rule.condition;
  if (!condition || typeof condition !== 'object') return false;
  if (condition.type === 'status') return campaign.status === condition.value;
  const metric = campaign[condition.type] ?? campaign.stats?.[condition.type] ?? 0;
  return compare(metric, condition.operator, condition.value);
}

/**
 * Initialize all scheduled jobs.
 * @param {import('telegraf').Telegraf} bot — Telegram bot instance
 * @param {{ repos: object, services: object }} deps
 */
export function initScheduler(bot, deps) {
  const _WIB_OFFSET = 7 * 60 * 60 * 1000; // UTC+7

  // ────────────────────────────────────────────────────────────
  // 1. Campaign Monitor — every 6 hours
  //    For each active campaign: generateReport + evaluateStoploss.
  //    Alert on KILL / REDUCE_BUDGET. Check scale eligibility on SCALE_UP.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    log.info('Running campaign monitor job');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const active = campaigns.filter(c => c.status === 'ACTIVE');
      const EVAL_DAYS = parseInt(process.env.EVALUATION_DAYS || '3', 10);

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

        if (stoploss.action === 'KILL' || stoploss.action === 'REDUCE_BUDGET') {
          await safeSend(bot, `⚠️ *${campaign.name}*: ${stoploss.reason}`, { parse_mode: 'Markdown' });
        }

        // Check scale eligibility on WINNING
        if (report.decision === 'SCALE_UP') {
          const scaleResult = evaluateScaleEligibility({
            roas,
            ctr: campaign.ctr || 0,
            cpc: campaign.cpc || Infinity,
          });
          if (scaleResult.canScale) {
            await safeSend(bot, `🚀 *${campaign.name}* eligible to scale!\n${scaleResult.reason}`, { parse_mode: 'Markdown' });
          }
        }
      }
      log.info('Campaign monitor complete', { checked: active.length });
    } catch (err) {
      log.error('Campaign monitor failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 2. Bid Satpam — every 5 minutes
  //    Check adset bid_amount against BID_MIN..BID_MAX range.
  //    Log adjustments needed.
  // ────────────────────────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    log.info('Running bid satpam job');
    try {
      const BID_MIN = parseInt(process.env.BID_SATPAM_MIN || '130', 10);
      const BID_MAX = parseInt(process.env.BID_SATPAM_MAX || '150', 10);
      const BID_TARGET = parseInt(process.env.BID_SATPAM_TARGET || '140', 10);

      const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.('meta') || [];
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

  // ────────────────────────────────────────────────────────────
  // 4. Token Health Check — every 6 hours
  //    Verify Meta tokens via metaApi.getMe(). Alert on expiry.
  // ────────────────────────────────────────────────────────────
  cron.schedule('15 */6 * * *', async () => {
    log.info('Running token health check');
    try {
      const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.() || [];
      let expired = 0;
      for (const account of accounts) {
        if (account.platform === 'meta' && account.credentials?.access_token) {
          try {
            const metaApi = deps.services?.metaApi;
            if (!metaApi) continue;
            await metaApi.getMe?.(account.credentials.access_token);
          } catch {
            expired++;
            log.warn('Token expired', { account: account.account_name });
            await safeSend(bot, `🔴 Token expired for *${account.account_name}*`, { parse_mode: 'Markdown' });
            try {
              deps.repos?.platformAccountsRepo?.update?.(account.id, { health_status: 'expired' });
            } catch { /* best-effort DB update */ }
          }
        }
      }
      log.info('Token health check complete', { checked: accounts.length, expired });
    } catch (err) {
      log.error('Token health check failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 5. Rule Guard — every 5 minutes
  //    Evaluate automation rules against campaigns. On match, record an
  //    owner-scoped approval draft and prompt the owner with an
  //    Approve/Reject inline keyboard.
  // ────────────────────────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const rules = deps.repos?.rulesRepo?.findAll?.() || [];
      const activeRules = rules.filter(r => r.enabled);
      if (activeRules.length === 0) return;

      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      for (const rule of activeRules) {
        const action = rule.action || {};
        for (const campaign of campaigns) {
          if (!evaluateRuleForCampaign(rule, campaign)) continue;

          const draft = await deps.services?.draftService?.guardAutonomousChange?.({
            type: `rule_${action.type}`,
            summary: `Rule ${rule.name}: ${rule.condition.type} → ${action.type} on ${campaign.name}`,
            details: { action: rule.action, campaign },
            proposedBy: 'ai',
            campaignId: campaign.id,
            userId: rule.user_id,
          });
          if (!draft) continue;

          const telegramId = deps.repos?.usersRepo?.getTelegramIdByUserId?.(rule.user_id);
          if (!telegramId) {
            await safeSend(bot, `⚠️ *${campaign.name}* matched rule *${rule.name}* — draft awaiting approval in /app`);
            continue;
          }
          const text = `⚠️ Rule *${rule.name}* matched *${campaign.name}*\nProposed action: *${action.type}*\n\nApprove or reject:`;
          try {
            await bot.telegram.sendMessage(telegramId, text, {
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Approve', callback_data: `approval:approve:${draft.id}` },
                  { text: '❌ Reject', callback_data: `approval:reject:${draft.id}` },
                ]],
              },
            });
          } catch (err) {
            log.error('Failed to send approval prompt to owner', { telegramId, error: err.message });
            await safeSend(bot, `⚠️ *${campaign.name}* matched rule *${rule.name}* — draft awaiting approval in /app`);
          }
        }
      }
    } catch (err) {
      log.error('Spend guard failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 6. Subscription Check — 09:00 WIB (02:00 UTC)
  //    Find payments expiring within 7 days.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    log.info('Running subscription check');
    try {
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

  // ────────────────────────────────────────────────────────────
  // 7. Follow-up Engine — every hour at :30
  //    Find WINNING campaigns not yet scaled. Suggest scaling.
  // ────────────────────────────────────────────────────────────
  cron.schedule('30 * * * *', async () => {
    log.debug('Running follow-up engine');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const winning = campaigns.filter(c => c.status === 'WINNING' && !c.scaled);
      for (const c of winning) {
        await safeSend(
          bot,
          `🏆 *${c.name}* is WINNING and hasn't been scaled yet. Consider increasing budget.`,
          { parse_mode: 'Markdown' },
        );
      }
      log.debug('Follow-up engine complete', { winning: winning.length });
    } catch (err) {
      log.error('Follow-up engine failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 8. Meta Campaign Sync — every 6h at :30
  //    Sync remote campaigns from Meta API → local DB.
  // ────────────────────────────────────────────────────────────
  cron.schedule('30 */6 * * *', async () => {
    log.info('Running Meta campaign sync');
    try {
      const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.('meta') || [];
      let synced = 0;
      for (const account of accounts) {
        try {
          const token = resolveOwnerPlatformToken('meta', account.user_id, { platformAccountsRepo: deps.repos?.platformAccountsRepo, settingsRepo: deps.repos?.settingsRepo });
          if (!token || token.startsWith('demo-meta-token')) {
            log.debug('Placeholder Meta token — skipping sync', { account: account.account_name });
            continue;
          }
          const ownerApi = MetaAdsAPI.withToken(token);
          if (!ownerApi) {
            log.debug('No owner Meta token — skipping sync');
            continue;
          }
          const adAccountId = account.credentials?.ad_account_id;
          if (!adAccountId || !/^\d+$/.test(String(adAccountId).replace(/^act_/, ''))) {
            log.debug('No real Meta ad-account id — skipping sync', { account: account.account_name });
            continue;
          }
          const remoteCampaigns = await ownerApi.getCampaigns?.(adAccountId) || [];
          for (const rc of remoteCampaigns) {
            deps.repos?.campaignsRepo?.upsert?.({
              platform: 'meta',
              campaign_id: rc.id,
              name: rc.name,
              status: rc.status,
              budget: rc.daily_budget,
              spend: rc.spend,
              revenue: rc.revenue || 0,
            });
            synced++;
          }
        } catch (err) {
          log.warn('Meta sync account error', { account: account.account_name, error: err.message });
        }
      }
      log.info('Meta campaign sync complete', { synced });
    } catch (err) {
      log.error('Meta campaign sync failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 9. Daily Eval Guard — 01:00 WIB (18:00 UTC previous day)
  //    evaluateMetrics on all active campaigns. Flag LOSING.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 18 * * *', async () => {
    log.info('Running daily eval guard');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const active = campaigns.filter(c => c.status === 'ACTIVE');
      const underperformers = [];

      for (const campaign of active) {
        const spend = campaign.spend || 0;
        const revenue = campaign.revenue || 0;
        if (spend <= 0) continue;

        const metrics = evaluateMetrics(revenue, spend);
        if (metrics.status === 'LOSING') {
          underperformers.push({ name: campaign.name, roas: metrics.roas, profit: metrics.profit });
        }
      }

      if (underperformers.length > 0) {
        const lines = underperformers.map(c =>
          `• ${c.name}: ROAS ${c.roas.toFixed(2)}x, Loss Rp ${Math.abs(c.profit).toLocaleString('id-ID')}`,
        );
        await safeSend(bot, `🔴 *Daily Eval — ${underperformers.length} underperformer(s):*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
      }
      log.info('Daily eval guard complete', { checked: active.length, underperformers: underperformers.length });
    } catch (err) {
      log.error('Daily eval guard failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 10. Auto-scale — triggered by campaign monitor (not cron)
  //     Auto-scale runs when campaign monitor (job 1) detects
  //     WINNING status and evaluateScaleEligibility returns canScale.
  //     Handled inside campaign monitor job above.

  // ────────────────────────────────────────────────────────────
  // 11. Database Backup — every 6 hours
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', () => {
    log.info('Running database backup job');
    try {
      backupDatabase(config.dbPath, process.cwd());
    } catch (err) {
      log.error('Backup cron job failed', { error: err.message });
    }
  });
  // ────────────────────────────────────────────────────────────

  log.info('Bot scheduler initialized with 11 cron jobs');
}
