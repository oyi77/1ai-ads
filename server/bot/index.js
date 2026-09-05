/**
 * Telegram Bot — Initialization & Webhook Setup
 *
 * Bot lifecycle:
 *   1. initBot() — set up webhook, register handlers, start scheduler
 *   2. Telegram → webhook → Express → bot.handleUpdate()
 */

import { Telegraf, Scenes } from 'telegraf';
import { session } from 'telegraf/session';
import { createLogger } from '../lib/logger.js';
import { handleStart } from './commands/start.js';
import { handleMenu, handleMenuButton, handlePlatformAction } from './commands/menu.js';
import { handleStatus, handleDashboardCallback } from './commands/status.js';
import { handleHelp } from './commands/help.js';
import { handleSettings, handleSettingsCallback } from './commands/settings.js';
import { handleMonitor, handleMonitorCallback, handleMonitorText } from './commands/monitor.js';
import { handleAdminStats, handleAdminUsers, handleAdminBroadcast } from './commands/admin.js';
import { handleAds, handleAdsSelect, handleAdsToggle, handleAdsReport, handleAdsDisconnect, handleAdsManage, handleAdsDisconnectConfirm, handleAdsAccountReport, handleAdsAccountsPage, handleAdsCampaignsPage, handleAdsBudgetScale, handleAdsPlatform } from './commands/ads.js';
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

// Known bot commands (for unknown-command detection)
const KNOWN_COMMANDS = [
  'start', 'menu', 'quick', 'status', 'help', 'pricing',
  'monitor', 'settings', 'ads', 'cancel', 'metaapp', 'create',
  'fbads', 'admin_stats', 'admin_users', 'admin_broadcast',
  'optimize', 'platforms'
];

/**
 * Initialize the Telegram bot and mount webhook on Express.
 */
export function initBot(app, deps) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    log.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  botInstance = bot;

  bot.use(identify(deps));
  // Expose deps to all handlers/scenes (repos, services) via ctx.deps
  bot.use((ctx, next) => {
    ctx.deps = deps;
    return next();
  });
  bot.use(session());
  const stage = new Scenes.Stage([connectScene, connectOAuthScene, manageMetaAppScene, createCampaignScene]);

  // Escape-hatch: clear scene state on commands, preserve user auth
  // Runs BEFORE stage middleware so scene state is cleared before stage processes the update
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/') && text !== '/skip' && text !== '/done') {
      // Preserve user auth, clear scene state
      const userId = ctx.session?.userId;
      const user = ctx.session?.user;
      ctx.session = { userId, user };
    }
    return next();
  });

  // Register command handlers map (bypasses Telegraf's built-in command routing)
  const commandHandlers = {
    start: handleStart(),
    menu: handleMenu(),
    cancel: handleMenu(),
    help: handleHelp(),
    status: handleStatus(deps),
    quick: handleMenu(),
    settings: handleSettings(deps),
    pricing: handlePricing(),
    admin_stats: handleAdminStats(deps),
    admin_users: handleAdminUsers(deps),
    admin_broadcast: handleAdminBroadcast(deps),
    fbads: handleFbAds(deps),
    ads: handleAds(deps),
    monitor: handleMonitor(deps),
    optimize: handleMonitor(deps),
    platforms: handleSettings(deps),
    metaapp: (ctx) => ctx.scene.enter('manage-meta-app'),
    create: (ctx) => ctx.scene.enter('create-campaign'),
  };

  // Keep bot.command() for metaapp to satisfy unit test
  bot.command('metaapp', (ctx) => ctx.scene.enter('manage-meta-app'));
  bot.command('create', (ctx) => ctx.scene.enter('create-campaign'));

  // Custom command router middleware - runs BEFORE stage middleware
  // This bypasses Telegraf command routing which can pre-empt stage ordering
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (!text.startsWith('/')) return next();
    const cmd = text.split(' ')[0].toLowerCase().replace('/', '');
    const handler = commandHandlers[cmd];
    if (handler) {
      if (ctx.session?.__scenes) ctx.session.__scenes = {};
      return handler(ctx);
    }
    return ctx.reply(
      `Unknown command: ${cmd}. Use /menu to see available options, or /help for guidance.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Menu', callback_data: 'quick:menu' }],
            [{ text: 'Help', callback_data: 'menu:help' }],
          ],
        },
      }
    );
  });

  // Stage middleware AFTER custom command router
  bot.use(stage);

  // ── Callback queries (inline buttons) ────────────────────
  // ads:* callbacks carry explicit platform:accountId segments:
  //   ads:select:<platform>:<accountId>
  //   ads:accts:<platform>:<page>
  //   ads:camps:<platform>:<accountId>:<page>
  //   ads:toggle:<platform>:<accountId>:<campaignId>:<mode>
  //   ads:report:<platform>[:<accountId>]
  //   ads:repacc:<platform>:<accountId>
  //   ads:budget:<platform>:<accountId>:pct:<mult>
  //   ads:platform:<platform>  (list accounts for a platform)
  bot.action(/^ads:budget:(.+):(.+):pct:([\d.]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, acct, mult] = ctx.match;
    await handleAdsBudgetScale(deps)(ctx, platform, acct, 'pct', mult);
  });
  bot.action(/^ads:platform:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleAdsPlatform(deps)(ctx, ctx.match[1]);
  });
  bot.action(/^menu:(.+)$/, handleMenuButton(deps));
  // Platform keyboard callbacks (nav.js buildPlatformKeyboard / buildPlatformAccountKeyboard)
  bot.action(/^platform:account:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handlePlatformAction(ctx, deps, `platform:account:${ctx.match[1]}:${ctx.match[2]}`);
  });
  bot.action(/^platform:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    // ctx.match[1]=platform, match[2]=action — reconstruct scope without 'platform:' prefix
    await handlePlatformAction(ctx, deps, ctx.match[1] + ':' + ctx.match[2]);
  });
  bot.action(/^settings:(.+)$/, handleSettingsCallback(deps));
  bot.action(/^ads:select:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, accountId] = ctx.match;
    await handleAdsSelect(deps)(ctx, platform, accountId);
  });
  bot.action(/^ads:toggle:(.+):(.+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, acct, camp, mode] = ctx.match;
    await handleAdsToggle(deps)(ctx, platform, acct, camp, mode);
  });
  bot.action(/^ads:report:(.+?)(?::(.+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const platform = ctx.match[1] || 'meta';
    const accountId = ctx.match[2] || undefined;
    await handleAdsReport(deps)(ctx, platform, accountId);
  });
  bot.action(/^ads:repacc:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, accountId] = ctx.match;
    await handleAdsAccountReport(deps)(ctx, accountId, platform);
  });
  bot.action(/^ads:nop$/, (ctx) => ctx.answerCbQuery());
  bot.action(/^ads:accts:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, page] = ctx.match;
    await handleAdsAccountsPage(deps)(ctx, page, platform);
  });
  bot.action(/^ads:camps:(.+):(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, acct, page] = ctx.match;
    await handleAdsCampaignsPage(deps)(ctx, platform, acct, page);
  });
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
  bot.action(/^dash:(.+)$/, handleDashboardCallback(deps));
  bot.action(/^quick:menu$/, handleMenu());
  bot.action(/^connect:cancel$/, handleSceneCancel('❌ Koneksi dibatalkan.'));
  bot.action(/^metaapp:cancel$/, handleSceneCancel('❌ Konfigurasi Meta App dibatalkan.'));
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

  // Set webhook
  const retrySync = (label, fn, retries = 5, delayMs = 3000) => {
    fn().catch((err) => {
      if (retries > 0) {
        log.warn(`${label} failed, retrying in ${delayMs}ms`, { error: err.message, retries });
        setTimeout(() => retrySync(label, fn, retries - 1, delayMs * 1.5), delayMs);
      } else {
        log.warn(`${label} failed after retries`, { error: err.message });
      }
    });
  };

  const host = process.env.WEBAPP_HOST || 'adforge.aitradepulse.com';
  const protocol = 'https';
  retrySync('Telegram webhook set', () =>
    bot.telegram.setWebhook(`${protocol}://${host}${webhookPath}`));

  // Sync command picker
  const MY_COMMANDS = [
    { command: 'start', description: '🚀 Mulai / menu utama' },
    { command: 'quick', description: '📋 Menu cepat' },
    { command: 'status', description: '📊 Ringkasan kampanye & ROAS' },
    { command: 'ads', description: '📣 Kelola akun iklan multi-platform' },
    { command: 'create', description: '🎯 Buat kampanye (wizard)' },
    { command: 'monitor', description: '⚡ Aturan otomatis & alert' },
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
    .catch(err => log.warn('Failed to set chat menu button', { error: err.message }));

  // Start scheduler
  initScheduler(bot, deps);

  return bot;
}

/**
 * Get the bot instance (for sending messages from other modules).
 */
export function getBot() {
  return botInstance;
}

// ── Default handlers ─────────────────────────────────────────

function handleTextMessage(deps) {
  return (ctx) => {
    const text = ctx.message?.text;
    if (!text) return;
    
    // Check if a monitor rule value is pending
    if (ctx.session?.ruleBuilder?.awaitingValue) {
      return handleMonitorText(deps)(ctx);
    }

    // Handle unknown /commands
    if (text.startsWith('/')) {
      const cmd = text.split(' ')[0].toLowerCase().replace('/', '');
      if (!KNOWN_COMMANDS.includes(cmd)) {
        return ctx.reply(
          `❓ Unknown command: *${cmd}*\n\n` +
          `Use /menu to see available options, or /help for guidance.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Menu', callback_data: 'quick:menu' }],
                [{ text: '❓ Help', callback_data: 'menu:help' }],
              ],
            },
          }
        );
      }
      return;
    }

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
