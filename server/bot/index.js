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
import { handleMonitorCallback } from './commands/monitor.js';
import { handleAdminStats, handleAdminUsers, handleAdminBroadcast } from './commands/admin.js';
import { handleAds, handleAdsSelect, handleAdsToggle, handleAdsReport, handleAdsDisconnect } from './commands/ads.js';
import { handleFbAds } from './commands/fbads.js';
import { initScheduler } from './scheduler.js';
import { errorHandler } from './middleware/error-handler.js';
import { identify } from './middleware/identify.js';
import { connectScene } from './scenes/connect-account.js';

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
  // Session + Stage middleware — REQUIRED for WizardScene (connect flow)
  bot.use(session());
  const stage = new Scenes.Stage([connectScene]);
  bot.use(stage);

  // ── Commands ─────────────────────────────────────────────
  bot.start(handleStart());
  bot.command('menu', handleMenu());
  bot.command('cancel', handleMenu());
  bot.help(handleHelp());
  bot.command('status', handleStatus(deps));
  bot.command('settings', handleSettings(deps));
  bot.command('pricing', handlePricing());
  bot.command('admin_stats', handleAdminStats(deps));
  bot.command('admin_users', handleAdminUsers(deps));
  bot.command('admin_broadcast', handleAdminBroadcast(deps));
  bot.command('fbads', handleFbAds(deps));
  bot.command('ads', handleAds(deps));

  // ── Callback queries (inline buttons) ────────────────────
  bot.action(/^menu:/, handleMenuButton(deps));
  bot.action(/^settings:(.+)$/, handleSettingsCallback(deps));
  bot.action(/^ads:select:(.+)$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsSelect(deps)(ctx, ctx.match[1]); });
  bot.action(/^ads:toggle:(.+):(.+):(.+)$/, async (ctx) => { await ctx.answerCbQuery(); const [, acct, camp, mode] = ctx.match; await handleAdsToggle(deps)(ctx, acct, camp, mode); });
  bot.action(/^ads:report$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsReport(deps)(ctx); });
  bot.action(/^ads:disconnect$/, async (ctx) => { await ctx.answerCbQuery(); await handleAdsDisconnect(deps)(ctx); });
  bot.action(/^monitor:/, handleMonitorCallback(deps));
  bot.action(/^quick:menu$/, handleMenu());
  // ── Connect wizard (per-customer platform connection) ────
  bot.action(/^connect:(.+)$/, async (ctx) => {
    const platform = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.scene.enter('connect-account', { platform });
  });

  // ── Message router ───────────────────────────────────────
  bot.on('text', handleTextMessage(deps));
  bot.on('photo', handlePhotoMessage(deps));

  // ── Error handler (bulletproof — never crashes) ──────────
  bot.catch(errorHandler);

  // ── Mount webhook on Express ─────────────────────────────
  const webhookPath = '/webhook/telegram';
  app.use(bot.webhookCallback(webhookPath));

  // Set webhook (async, non-blocking)
  const host = process.env.TELEGRAM_WEBHOOK_HOST || 'adforge.aitradepulse.com';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  bot.telegram.setWebhook(`${protocol}://${host}${webhookPath}`)
    .then(() => log.info('Telegram webhook set', { url: `${protocol}://${host}${webhookPath}` }))
    .catch(err => log.warn('Failed to set webhook', { error: err.message }));

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

function handlePricing() {
  return (ctx) => {
    const plan = ctx.user?.plan || 'free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    ctx.reply(
      `💰 *AdForge Pricing*\n\n` +
      `Your plan: *${planLabel}*\n\n` +
      '🆓 *Free* — 3 campaigns, basic analytics\n' +
      '💎 *Pro* — Unlimited campaigns, AI optimization, priority support\n' +
      '🏢 *Enterprise* — Custom limits, dedicated support, white-label\n\n' +
      'Use /menu → Connect Account to add integrations. Contact @adforge_support for upgrades.',
      { parse_mode: 'Markdown' }
    );
  };
}

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
  return (ctx) => {
    ctx.reply('📸 Photo received! Use /menu to see what you can do with it.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]],
      },
    });
  };
}
