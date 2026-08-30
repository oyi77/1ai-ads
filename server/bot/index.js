/**
 * Telegram Bot — Initialization & Webhook Setup
 *
 * Ported from asisten-jualan/ (Python FastAPI + python-telegram-bot)
 * to Node.js Telegraf inside Express.
 *
 * All asisten-jualan features available via Telegram:
 * - 7 commands (start, menu, cancel, help, status, settings, pricing)
 * - Connect-account wizard (per-customer platform connection via /start buttons)
 * - 10 scheduled jobs (bid-satpam, daily-dashboard, etc.)
 */

import { Telegraf, Scenes } from 'telegraf';
import { session } from 'telegraf/session';
import { createLogger } from '../lib/logger.js';
import { handleStart } from './commands/start.js';
import { handleMenu, handleMenuButton } from './commands/menu.js';
import { handleStatus } from './commands/status.js';
import { handleHelp } from './commands/help.js';
import { handleSettings, handleSettingsCallback } from './commands/settings.js';
import { handleMonitor, handleMonitorCallback } from './commands/monitor.js';
import { handleAdminStats, handleAdminUsers, handleAdminBroadcast } from './commands/admin.js';
import { handleAds, handleAdsSelect, handleAdsToggle, handleAdsReport, handleAdsDisconnect, handleAdsManage, handleAdsDisconnectConfirm, handleAdsAccountReport, handleAdsAccountsPage, handleAdsCampaignsPage, handleAdsBudgetScale } from './commands/ads.js';
import { handleApprovalApprove, handleApprovalReject } from './commands/approvals.js';
import { handleFbAds } from './commands/fbads.js';
import { handlePricing } from './commands/pricing.js';
import { initScheduler } from './scheduler.js';
import { errorHandler } from './middleware/error-handler.js';
import { identify } from './middleware/identify.js';
import { connectScene, handleSceneCancel } from './scenes/connect-account.js';
import { connectOAuthScene } from './scenes/connect-oauth.js';
import { manageMetaAppScene } from './scenes/manage-meta-app.js';
import { createCampaignScene } from './scenes/create-campaign.js';
const log = createLogger('bot');

let botInstance = null;

/**
 * Initialize the Telegram bot and mount webhook on Express.
 * @param {object} app — Express app
 * @param {object} deps — { repos, services }
 * @returns {Telegraf} bot instance
 */
export function initBot(app, deps) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  const bot = new Telegraf(token);
  botInstance = bot;

  // Store deps in bot context
  bot.context.repos = deps.repos;
  bot.context.services = deps.services;

  // Identify/auto-bind Telegram user -> local multi-tenant account
  bot.use(identify(deps));
  // Session + Stage middleware — REQUIRED for WizardScene (connect + meta-app flows)
  bot.use(session());
  const stage = new Scenes.Stage([connectScene, connectOAuthScene, manageMetaAppScene, createCampaignScene]);

  // Escape hatch: any /command while inside a wizard clears the scene state
  // from the session BEFORE stage sees it, so an abandoned wizard can never
  // eat subsequent commands (/start, /pricing etc still work normally).
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (ctx.session?.__scenes && text.startsWith('/') && text !== '/skip') {
      delete ctx.session.__scenes;
      ctx.session.__scenes = undefined;
    }
    return next();
  });

  bot.use(stage);

  // ── Commands ─────────────────────────────────────────────
  bot.start(handleStart());
  bot.command('menu', handleMenu());
  bot.command('cancel', handleMenu());
  bot.help(handleHelp());
  bot.command('status', handleStatus(deps));
  bot.command('quick', handleMenu());
  bot.command('settings', handleSettings(deps));
  bot.command('pricing', handlePricing());
  bot.command('admin_stats', handleAdminStats(deps));
  bot.command('admin_users', handleAdminUsers(deps));
  bot.command('admin_broadcast', handleAdminBroadcast(deps));
  bot.command('fbads', handleFbAds(deps));
  bot.command('ads', handleAds(deps));
  bot.command('monitor', handleMonitor(deps));
  bot.command('metaapp', (ctx) => ctx.scene.enter('manage-meta-app'));
  bot.command('create', (ctx) => ctx.scene.enter('create-campaign'));
  bot.action(/^ads:budget:(.+):pct:([\d.]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, acct, mult] = ctx.match;
    await handleAdsBudgetScale(deps)(ctx, acct, 'pct', mult);
  });
  // ── Callback queries (inline buttons) ────────────────────
  bot.action(/^menu:(.+)$/, handleMenuButton(deps));
  bot.action(/^settings:(.+)$/, handleSettingsCallback(deps));
  bot.action(/^ads:select:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsSelect(deps)(ctx, ctx.match[1]); });
  bot.action(/^ads:toggle:(.+):(.+):(.+)$/, async (ctx) => { await ctx.answerCbQuery(); const [, acct, camp, mode] = ctx.match; await handleAdsToggle(deps)(ctx, acct, camp, mode); });
  bot.action(/^ads:report$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsReport(deps)(ctx); });
  bot.action(/^ads:repacc:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsAccountReport(deps)(ctx, ctx.match[1]); });
  bot.action(/^ads:nop$/, (ctx) => ctx.answerCbQuery());
  bot.action(/^ads:accts:(\d+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsAccountsPage(deps)(ctx, ctx.match[1]); });
  bot.action(/^ads:camps:(.+):(\d+)$/, async (ctx) => { await ctx.answerCbQuery(); const [, acct, page] = ctx.match; await handleAdsCampaignsPage(deps)(ctx, acct, page); });
bot.action(/^ads:disconnect(?::(.+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match?.[1];
    const handler = id ? handleAdsDisconnectConfirm(deps, id) : handleAdsDisconnect(deps);
    await handler(ctx);
  });
  bot.action(/^ads:manage$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleAdsManage(deps)(ctx);
  });
  bot.action(/^ads$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleAds(deps)(ctx);
  });
  bot.action(/^approval:approve:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleApprovalApprove(deps)(ctx, ctx.match[1]); });
  bot.action(/^approval:reject:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleApprovalReject(deps)(ctx, ctx.match[1]); });
  bot.action(/^monitor:(.+)$/, handleMonitorCallback(deps));
  bot.action(/^rule:(.+)$/, handleMonitorCallback(deps));
  // Scene-cancel buttons must beat their generic enter-regexes below.
  bot.action(/^connect:cancel$/, handleSceneCancel('❌ Koneksi dibatalkan.'));
  bot.action(/^metaapp:cancel$/, handleSceneCancel('❌ Konfigurasi Meta App dibatalkan.'));
  bot.action(/^quick:menu$/, handleMenu());
  // ── Connect wizard (per-customer platform connection) ────
  bot.action(/^connect:(.+)$/, async (ctx) => {
    const platform = ctx.match[1];
    const oauthPlatforms = ['google', 'tiktok', 'linkedin'];
    await ctx.answerCbQuery();
    if (oauthPlatforms.includes(platform)) {
      await ctx.scene.enter('connect-oauth', { platform });
    } else {
      await ctx.scene.enter('connect-account', { platform });
    }
  });

  // ── Message router ───────────────────────────────────────
  bot.on('text', handleTextMessage(deps));
  bot.on('photo', handlePhotoMessage(deps));

  // ── Error handler (bulletproof — never crashes) ──────────
  bot.catch(errorHandler);

  // ── Mount webhook on Express ─────────────────────────────
  const webhookPath = '/webhook/telegram';
  app.use(bot.webhookCallback(webhookPath));

  // Set webhook (async, non-blocking, retried — Telegram API calls can fail
  // transiently right after container boot before DNS/network settles).
  const host = process.env.TELEGRAM_WEBHOOK_HOST || 'adforge.aitradepulse.com';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const retrySync = (label, fn) => {
    let attempt = 0;
    const run = async () => {
      for (; attempt < 3; attempt++) {
        try {
          await fn();
          log.info(label);
          return;
        } catch (err) {
          if (attempt === 2) log.warn(`${label} failed after retries`, { error: err.message });
          else await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
    };
    run();
  };
  retrySync('Telegram webhook set', () =>
    bot.telegram.setWebhook(`${protocol}://${host}${webhookPath}`));

  // ── Sync the "/" command picker & chat menu button with reality ──
  // The BotFather-side list was stale from a previous product; keep it
  // authoritative from code so commands and buttons never drift apart.
  const MY_COMMANDS = [
    { command: 'start', description: '🚀 Mulai / menu utama' },
    { command: 'quick', description: '📋 Menu cepat' },
    { command: 'monitor', description: '⚡ Aturan otomatis & alert' },
    { command: 'status', description: '📊 Ringkasan kampanye & ROAS' },
    { command: 'ads', description: '📣 Kelola akun Meta Ads' },
    { command: 'create', description: '🎯 Buat kampanye (wizard)' },
    { command: 'monitor', description: '⚡ Aturan otomatis & alert' },
    { command: 'metaapp', description: '🔧 Kredensial Meta App' },
    { command: 'settings', description: '⚙️ Token & koneksi akun' },
    { command: 'pricing', description: '💰 Paket & harga' },
    { command: 'cancel', description: '❌ Batalkan wizard/flow aktif' },
    { command: 'help', description: '❓ Bantuan' },
  ];
  bot.telegram.setMyCommands(MY_COMMANDS)
    .then(() => log.info('Bot command list synced', { count: MY_COMMANDS.length }))
    .catch(err => log.warn('Failed to set MyCommands', { error: err.message }));

  const webAppUrl = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';
  bot.telegram.setChatMenuButton({
    menu_button: { type: 'web_app', text: '📱 AdForge', web_app: { url: webAppUrl } },
  })
    .then(() => log.info('Chat menu button set to Mini App', { url: webAppUrl }))
    .catch(err => log.warn('Failed to set chat menu button (register the domain in @BotFather to enable)', { error: err.message }));

  // ── Start scheduled jobs ─────────────────────────────────
  initScheduler(bot, deps);

  log.info('Telegram bot initialized');
  return bot;
}

/**
 * Get the bot instance (for sending messages from other modules).
 */
export function getBot() {
  return botInstance;
}

// ── Default handlers ─────────────────────────────────────────



function handleTextMessage(_deps) {
  return (ctx) => {
    const text = ctx.message?.text;
    if (!text || text.startsWith('/')) return;

    // Default: show menu
    ctx.reply('Use /menu to see available options, or /help for guidance.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          [{ text: '❓ Help', callback_data: 'menu:help' }],
        ],
      },
    });
  };
}

function handlePhotoMessage(_deps) {
  return async (ctx) => {
    await ctx.reply('📸 Photo received! Use /menu to see what you can do with it.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]],
      },
    });
  };
}
