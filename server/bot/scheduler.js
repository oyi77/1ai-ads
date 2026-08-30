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

/** Escape HTML special chars in dynamic bot content. */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}
function fmtRoas2(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}x`;
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
      const active = campaigns.filter(c => c.status === 'ACTIVE');
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

        if (stoploss.action === 'KILL' || stoploss.action === 'REDUCE_BUDGET') {
          // Dedup: max 1 alert per campaign per day
          const dedupKey = `campaign_monitor_alerted_${campaign.id}_${today}`;
          if (deps.repos?.settingsRepo?.get(dedupKey)) continue;

          await safeSend(bot, `⚠️ *${campaign.name}*: ${stoploss.reason}`, { parse_mode: 'Markdown' });
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
              await safeSend(bot, `🚀 *${campaign.name}* eligible to scale!\n${scaleResult.reason}`, { parse_mode: 'Markdown' });
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

      const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.('meta')?.filter(a => a.is_active !== 0) || [];
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
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      if (!platformAccountsRepo || !settingsRepo) return;

      // Fan out per-user / per-platform using the OWNER's bound token
      // (SaaS isolation) — never read stored creds or a system metaApi.
      const { listPlatformKeys, getPlatformSync } = await import('../platforms/index.js');

      let checked = 0;
      let expired = 0;

      for (const platform of listPlatformKeys()) {
        const accounts = platformAccountsRepo.getDistinctUserPlatforms
          ? platformAccountsRepo.getDistinctUserPlatforms(platform)
          : [];
        if (!accounts.length) continue;

        for (const account of accounts) {
          try {
            const token = resolveOwnerPlatformToken(platform, account.user_id, {
              platformAccountsRepo,
              settingsRepo,
            });
            if (!token || token.startsWith('demo-')) {
              log.debug('Placeholder token — skipping health check', { platform, account: account.user_id });
              continue;
            }
            const PlatformClass = getPlatformSync(platform, settingsRepo);
            const api = new PlatformClass();
            api.setActiveAccount(null, token, true);

            // Feature-detect a token-verify method. Only Meta exposes getMe().
            // Platforms without one are skipped — never fabricate validity.
            const verify = api.getMe || api.verifyToken;
            if (typeof verify !== 'function') {
              log.debug('No token-verify method for platform — skipping', { platform });
              continue;
            }
            checked++;
            await verify.call(api);
          } catch {
            expired++;
            const label = account.account_name || account.user_id;
            log.warn('Token expired', { platform, account: label });
            await safeSend(bot, `🔴 Token expired for *${label}*`, { parse_mode: 'Markdown' });
            try {
              platformAccountsRepo.update?.(account.id, { health_status: 'expired' });
            } catch { /* best-effort DB update */ }
          }
        }
      }
      log.info('Token health check complete', { checked, expired });
    } catch (err) {
      log.error('Token health check failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 5. Rule Guard — every 5 minutes
  //    Evaluate automation rules against campaigns. On match, record an
  //    owner-scoped approval draft and prompt the owner with an
  //    Approve/Reject inline keyboard.
  //    Dedup: skip if pending draft already exists for this rule+campaign.
  // ────────────────────────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const rules = deps.repos?.rulesRepo?.findAll?.() || [];
      const activeRules = rules.filter(r => r.enabled);
      if (activeRules.length === 0) return;

      const { data: allCampaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const campaignsByUser = {};
      for (const c of allCampaigns) {
        const uid = c.user_id || 'system';
        if (!campaignsByUser[uid]) campaignsByUser[uid] = [];
        campaignsByUser[uid].push(c);
      }

      for (const rule of activeRules) {
        const action = rule.action || {};
        const ownerId = rule.user_id || 'system';
        const campaigns = campaignsByUser[ownerId] || [];
        if (campaigns.length === 0) continue;

        for (const campaign of campaigns) {
          if (!evaluateRuleForCampaign(rule, campaign)) continue;

          // Dedup: skip if a pending draft already exists for this rule+campaign
          const existingDraft = deps.repos?.draftsRepo?.findPendingForRuleCampaign?.(rule.name, campaign.id);
          if (existingDraft) continue;

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
  // 5b. Daily Per-Account AI Report Digest — 08:00 WIB (01:00 UTC)
  //     For each user with a connected Meta account, send a compact
  //     per-account performance report + AI recommendations. Includes a
  //     "since last digest" window and skips accounts with zero activity
  //     since the previous digest (no spam for dormant accounts).
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 1 * * *', async () => {
    log.info('Running daily account report digest');
    try {
      const repo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!repo || !usersRepo) return;

      const { listPlatformKeys, getPlatformSync } = await import('../platforms/index.js');
      const { resolveOwnerPlatformToken } = await import('../lib/resolve-owner-platform.js');
      const { AccountReportService } = await import('../services/account-report-service.js');
      const svc = new AccountReportService({ llmClient: deps.services?.llmClient });

      const platformKeys = listPlatformKeys();
      let sent = 0;

      for (const platform of platformKeys) {
        const accounts = repo.getDistinctUserPlatforms
          ? repo.getDistinctUserPlatforms(platform)
          : [];
        if (!accounts.length) continue;

        for (const row of accounts) {
          try {
            const pa = repo.getByPlatform(row.user_id, platform);
            if (!pa?.access_token) continue;
            const user = usersRepo.findById(row.user_id);
            if (!user?.telegram_id) continue;

            const token = resolveOwnerPlatformToken(platform, row.user_id, {
              platformAccountsRepo: repo,
              settingsRepo,
            });
            if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) continue;

            const api = getPlatformSync(platform, settingsRepo);
            api.setActiveAccount(null, token, true);

            // Feature-detect account enumeration. Meta has getAdAccounts,
            // others may have getAccounts or neither.
            const getAccounts = api.getAdAccounts || api.getAccounts;
            if (typeof getAccounts !== 'function') {
              log.debug('Platform lacks account enumeration', { platform, user: row.user_id });
              continue;
            }

            const lastAt = settingsRepo?.get(`last_report_at_${row.user_id}_${platform}`);
            const sinceDate = lastAt ? new Date(lastAt).toISOString().slice(0, 10) : null;

            const owned = await getAccounts.call(api);
            for (const acc of owned.slice(0, 5)) {
              const report = await svc.buildReport(api, acc.id, acc.name, { sinceDate, platform });
              // Skip unsupported platforms (no getAccountInsights) and dormant accounts
              if (!report.supported) continue;
              const s = report.summary;
              const sl = report.sinceLastReport;
              if (sinceDate && s.spend === 0 && (!sl || sl.spend === 0)) continue;

              const lines = [
                `📊 <b>Digest Harian — ${esc(acc.name)} (${platform})</b>`,
                `💰 Belanja: ${fmtRp(s.spend)} · ROAS ${fmtRoas2(s.roas)} · Purchase ${s.purchases}`,
              ];
              if (sl && sinceDate) {
                lines.push(`↩️ Sejak digest lalu (${sinceDate}): ${fmtRp(sl.spend)} · ROAS ${fmtRoas2(sl.roas)} · Purchase ${sl.purchases}`);
              }
              if (report.ai?.actions) lines.push(`🔧 ${esc(report.ai.actions)}`);
              if (report.anomalies?.length) lines.push(...report.anomalies.map(a => `🚨 ${esc(a)}`));
              await bot.telegram.sendMessage(user.telegram_id, lines.join('\n'), { parse_mode: 'HTML' });
              sent++;
            }
            settingsRepo?.set(`last_report_at_${row.user_id}_${platform}`, new Date().toISOString());
          } catch (err) {
            log.warn('Digest failed for user', { platform, userId: row.user_id, error: err.message });
          }
        }
      }
      log.info('Daily account report digest complete', { messagesSent: sent });
    } catch (err) {
      log.error('Daily account report digest failed', { error: err.message });
    }
  });

  // ────────────────────────────────────────────────────────────
  // 5c. Hourly Anomaly Push — top of every hour
  //     Per active account on ANY platform: build compact report,
  //     detect anomalies, push to the owner's Telegram.
  //     Dedup: max 1 alert per account/day.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const repo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!repo || !settingsRepo || !usersRepo) return;

      const { listPlatformKeys, getPlatformSync } = await import('../platforms/index.js');
      const { resolveOwnerPlatformToken } = await import('../lib/resolve-owner-platform.js');
      const { AccountReportService } = await import('../services/account-report-service.js');
      const svc = new AccountReportService({ llmClient: deps.services?.llmClient });
      const today = new Date().toISOString().slice(0, 10);
      let pushed = 0;

      const platformKeys = listPlatformKeys();

      for (const platform of platformKeys) {
        const accounts = repo.getDistinctUserPlatforms
          ? repo.getDistinctUserPlatforms(platform)
          : [];
        if (!accounts.length) continue;

        for (const row of accounts) {
          try {
            const pa = repo.getByPlatform(row.user_id, platform);
            if (!pa?.access_token) continue;
            const user = usersRepo.findById(row.user_id);
            if (!user?.telegram_id) continue;

            // dedup per account per day (account id = pa.id)
            const dedupKey = `anomaly_alerted_${pa.id}_${today}`;
            if (settingsRepo.get(dedupKey)) continue;

            const token = resolveOwnerPlatformToken(platform, row.user_id, {
              platformAccountsRepo: repo,
              settingsRepo,
            });
            if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) continue;

            const api = getPlatformSync(platform, settingsRepo);
            api.setActiveAccount(null, token, true);

            // Feature-detect account enumeration
            const getAccounts = api.getAdAccounts || api.getAccounts;
            if (typeof getAccounts !== 'function') continue;

            const ownedAccounts = await getAccounts.call(api);
            if (!ownedAccounts.length) continue;
            const acc0 = ownedAccounts[0];
            const report = await svc.buildReport(api, acc0.id, acc0.name, { platform });
            // Unsupported platform → no anomalies, skip silently
            if (!report.supported || !report.anomalies?.length) continue;

            const lines = [
              `🚨 <b>Anomali Terdeteksi — ${esc(report.accountName)} (${platform})</b>`,
              `💰 Spend hari ini: ${fmtRp(report.summary.spend)} · ROAS ${fmtRoas2(report.summary.roas)}`,
              ...report.anomalies.map(a => `⚠️ ${esc(a)}`),
              '',
              `<i>Cek /reports di Mini App untuk detail.</i>`,
            ];
            await bot.telegram.sendMessage(user.telegram_id, lines.join('\n'), { parse_mode: 'HTML' });
            settingsRepo.set(dedupKey, new Date().toISOString());
            pushed++;
          } catch (err) {
            log.warn('Anomaly push failed', { platform, userId: row.user_id, error: err.message });
          }
        }
      }
      if (pushed) log.info('Anomaly push complete', { alertsSent: pushed });
    } catch (err) {
      log.error('Hourly anomaly check failed', { error: err.message });
    }
  });

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
              `⏰ Paket *${u.plan}* kamu sudah berakhir.\n\nPerpanjang untuk mempertahankan fitur Pro:\n👉 ${process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com'}/billing`,
              { parse_mode: 'Markdown' }
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

  // ────────────────────────────────────────────────────────────
  // 7. Follow-up Engine — every hour at :30
  //    Find WINNING campaigns not yet scaled. Suggest scaling.
  //    Dedup: max 1 alert per campaign per day.
  // ────────────────────────────────────────────────────────────
  cron.schedule('30 * * * *', async () => {
    log.debug('Running follow-up engine');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const today = new Date().toISOString().slice(0, 10);
      const winning = campaigns.filter(c => c.status === 'WINNING');
      for (const c of winning) {
        // Dedup: skip if already alerted today for this campaign
        const dedupKey = `followup_alerted_${c.id}_${today}`;
        if (deps.repos?.settingsRepo?.get(dedupKey)) continue;

        await safeSend(
          bot,
          `🏆 *${c.name}* is WINNING and hasn't been scaled yet. Consider increasing budget.`,
          { parse_mode: 'Markdown' },
        );
        deps.repos?.settingsRepo?.set(dedupKey, new Date().toISOString());
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
    log.info('Running multi-platform campaign sync');
    try {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      if (!platformAccountsRepo || !settingsRepo) return;

      const { listPlatformKeys, getPlatformSync } = await import('../platforms/index.js');
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
            const token = resolveOwnerPlatformToken(platform, row.user_id, {
              platformAccountsRepo,
              settingsRepo,
            });
            if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) {
              log.debug('Placeholder token — skipping sync', { platform, account: row.user_id });
              continue;
            }
            const PlatformClass = getPlatformSync(platform, settingsRepo);
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

  // ────────────────────────────────────────────────────────────
  // 9. Daily Eval Guard — 01:00 WIB (18:00 UTC previous day)
  //    evaluateMetrics on all active campaigns. Flag LOSING.
  //    Dedup: max 1 alert per campaign per day.
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 18 * * *', async () => {
    log.info('Running daily eval guard');
    try {
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const active = campaigns.filter(c => c.status === 'ACTIVE');
      const underperformers = [];
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

          underperformers.push({ name: campaign.name, roas: metrics.roas, profit: metrics.profit, dedupKey });
        }
      }

      if (underperformers.length > 0) {
        const lines = underperformers.map(c =>
          `• ${c.name}: ROAS ${c.roas.toFixed(2)}x, Loss Rp ${Math.abs(c.profit).toLocaleString('id-ID')}`,
        );
        await safeSend(bot, `🔴 *Daily Eval — ${underperformers.length} underperformer(s):*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
        for (const c of underperformers) {
          deps.repos?.settingsRepo?.set(c.dedupKey, new Date().toISOString());
        }
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
