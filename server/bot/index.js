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
import { handleApprovalApprove, handleApprovalReject } from './commands/approvals.js';
import { handleAds, handleAdsSelect, handleAdsToggle, handleAdsAsk, handleAdsAskBud, handleAdsReport, handleAdsDisconnect, handleAdsManage, handleAdsDisconnectConfirm, handleAdsAccountReport, handleAdsAccountsPage, handleAdsCampaignsPage, handleAdsBudgetScale, handleAdsPlatform } from './commands/ads.js';
import { handlePricing, handlePricingCallback } from './commands/pricing.js';
import { initScheduler } from './scheduler.js';
import { errorHandler } from './middleware/error-handler.js';
import { identify } from './middleware/identify.js';
import { connectScene, handleSceneCancel } from './scenes/connect-account.js';
import { connectOAuthScene } from './scenes/connect-oauth.js';
import { manageMetaAppScene } from './scenes/manage-meta-app.js';
import { createCampaignScene } from './scenes/create-campaign.js';
const log = createLogger('bot');

let botInstance = null;
const KNOWN_COMMANDS = [
  'start', 'menu', 'quick', 'status', 'help', 'pricing',
  'monitor', 'settings', 'ads', 'cancel', 'metaapp', 'create',
  'admin_stats', 'admin_users', 'admin_broadcast',
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
    pricing: handlePricing(deps),
    admin_stats: handleAdminStats(deps),
    admin_users: handleAdminUsers(deps),
    admin_broadcast: handleAdminBroadcast(deps),
    ads: handleAds(deps),
    monitor: handleMonitor(deps),
    optimize: (ctx) => { ctx.match = ['menu:optimize', 'optimize']; return handleMenuButton(deps)(ctx); },
    platforms: (ctx) => { ctx.match = ['menu:platforms', 'platforms']; return handleMenuButton(deps)(ctx); },
    metaapp: (ctx) => ctx.scene.enter('manage-meta-app'),
    create: (ctx) => ctx.scene.enter('create-campaign'),
  };

  // metaapp + create handled by custom command router (see commandHandlers above)

  // Stage middleware MUST run before custom command router
  // so ctx.scene is available for scene commands
  bot.use(stage);

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
      `⚠️ Nggak kenal perintah <code>${cmd}</code>. Buka /menu buat lihat pilihan yang ada.`,
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

    // NOTE: stage is now registered BEFORE custom command router (see above)

  // ── Callback queries (inline buttons) ────────────────────
  // ads:* callbacks carry explicit platform:accountId segments:
  //   ads:select:<platform>:<accountId>
  //   ads:accts:<platform>:<page>
  //   ads:camps:<platform>:<accountId>:<page>
  //   ads:toggle:<platform>:<campaignId>:<mode>  (no accountId — 64-byte cap)
  //   ads:report:<platform>[:<accountId>]
  //   ads:repacc:<platform>:<accountId>
  //   ads:bud:<platform>:<accountId>:<mult>  (compact — pct: form overflowed)
  //   ads:platform:<platform>  (list accounts for a platform)
  bot.action(/^ads:bud:(.+):(.+):([\d.]+)$/, async (ctx) => {
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
  // `pacc:<platform>:<id>` compact key — `platform:account:` overflowed the 64-byte cap for thetradedesk.
  bot.action(/^pacc:(.+):(.+)$/, async (ctx) => {
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
  bot.action(/^ads:toggle:(.+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, camp, mode] = ctx.match;
    await handleAdsToggle(deps)(ctx, platform, camp, mode);
  });
  bot.action(/^ads:ask:(.+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, camp, mode] = ctx.match;
    await handleAdsAsk(deps)(ctx, platform, camp, mode);
  });
  bot.action(/^ads:abud:(.+):(.+):([\d.]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const [, platform, acct, mult] = ctx.match;
    await handleAdsAskBud(deps)(ctx, platform, acct, mult);
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
  bot.action(/^pricing:(.+)$/, handlePricingCallback(deps));
  bot.action(/^quick:menu$/, handleMenu());
  // ── Navigation callbacks (nav.js NAV constant) ──────────
  bot.action(/^nav:back(?::.+)?$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handleMenu()(ctx);
  });
  bot.action(/^nav:cancel(?::.+)?$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handleMenu()(ctx);
  });
  bot.action(/^nav:close$/, async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch { /* already gone */ }
  });
  bot.action(/^connect:cancel$/, handleSceneCancel('❌ Koneksi dibatalkan.'));
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

  const host = process.env.WEBAPP_HOST || 'adforge.aitradepulse.com';
  const protocol = 'https';
  const webAppUrl = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';

  // Sync command picker
  const MY_COMMANDS = [
    { command: 'start', description: '🚀 Mulai / menu utama' },
    { command: 'quick', description: '📋 Menu cepat' },
    { command: 'status', description: '📊 Ringkasan kampanye & ROAS' },
    { command: 'ads', description: '📣 Kelola akun iklan multi-platform' },
    { command: 'create', description: '🎯 Buat kampanye (wizard)' },
    { command: 'monitor', description: '⚡ Aturan otomatis & alert' },
    { command: 'optimize', description: '🤖 Saran AI optimasi' },
    { command: 'settings', description: '⚙️ Token & koneksi akun' },
    { command: 'cancel', description: '❌ Batalkan wizard/flow aktif' },
    { command: 'help', description: '❓ Bantuan' },
  ];

  // ROOT CAUSE (isolated via MTProto + container stop/start, 2026-09-24):
  //   1. setMyCommands() resets the bot's menu button to 'commands'. Anything
  //      set in that same boot window is clobbered, which is why the bot-wide
  //      set read back 'commands' while a manual set minutes later persisted.
  //   2. With a command list registered, Telegram IGNORES the bot-wide
  //      (no chat_id) setChatMenuButton; the button only sticks PER-CHAT
  //      (chat_id=<telegram user id>). Proven: bot-wide set read 'commands'
  //      via Bot API and menu_button=None via MTProto, while the per-chat set
  //      read back BotMenuButton(text,url) and held 60s+.
  // So: only call setMyCommands when the list actually changed (no clobber),
  // set the button per user, and re-assert it after the boot window settles.
  const MENU_BUTTON = {
    type: 'web_app',
    text: '📱 AdForge',
    web_app: { url: webAppUrl },
  };

  const ensureMiniAppButton = async (attempts = 4) => {
    // Per-chat for every user who has a telegram_id (the only scope Telegram
    // honors once a command list exists), plus one bot-wide attempt for users
    // we have not seen yet.
    const chatIds = [];
    try {
      const usersRepo = deps?.repos?.usersRepo || deps?.services?.usersRepo;
      const users = usersRepo?.findAll?.() || [];
      for (const u of users) {
        if (u.telegram_id) chatIds.push(String(u.telegram_id));
      }
    } catch { /* fall back to bot-wide only */ }

    const setOne = async (chatId) => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await bot.telegram.setChatMenuButton({
            ...(chatId ? { chat_id: chatId } : {}),
            menu_button: MENU_BUTTON,
          });
          const current = await bot.telegram.getChatMenuButton(
            chatId ? { chat_id: chatId } : undefined);
          if (current?.type === 'web_app') {
            log.info('Mini App menu button set', { chatId: chatId || 'default', attempt });
            return true;
          }
          log.warn('Mini App menu button reverted, retrying', { chatId: chatId || 'default', got: current?.type, attempt });
        } catch (err) {
          log.warn('Failed to set Mini App menu button', { chatId: chatId || 'default', error: err.message, attempt });
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
      return false;
    };

    let ok = await setOne(null);
    for (const chatId of chatIds) {
      ok = (await setOne(chatId)) || ok;
    }
    return ok;
  };

  const commandsDiffer = (current) => {
    if (!Array.isArray(current) || current.length !== MY_COMMANDS.length) return true;
    return MY_COMMANDS.some((want, i) => (
      current[i]?.command !== want.command || current[i]?.description !== want.description
    ));
  };

  // Skipping the unchanged setMyCommands is what stops the button clobber.
  const syncCommandsIfChanged = () =>
    bot.telegram.getMyCommands()
      .then((current) => {
        if (!commandsDiffer(current)) {
          log.info('Bot command list already current, skipping set', { count: MY_COMMANDS.length });
          return undefined;
        }
        return bot.telegram.setMyCommands(MY_COMMANDS)
          .then(() => log.info('Bot command list synced', { count: MY_COMMANDS.length }));
      })
      .catch((err) => log.warn('Failed to sync MyCommands', { error: err.message }));

  const syncBotSurface = () => syncCommandsIfChanged().then(() => ensureMiniAppButton());

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

  retrySync('Telegram webhook set', () =>
    bot.telegram.setWebhook(`${protocol}://${host}${webhookPath}`).then(syncBotSurface));
  // Readback lag is nondeterministic server-side (observed 10s-90s+), so a
  // confirmed set can still read back 'commands' minutes later. Re-assert
  // shortly after boot (the setMyCommands clobber window) and then every
  // 10 minutes; cheap (2 calls) and guarantees convergence.
  for (const delay of [30000, 90000]) {
    const bootTimer = setTimeout(() => { syncBotSurface(); }, delay);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();
  }
  const surfaceTimer = setInterval(syncBotSurface, 10 * 60 * 1000);
  if (typeof surfaceTimer.unref === 'function') surfaceTimer.unref();

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
          `❓ Unknown command: <b>${cmd}</b>\n\n` +
          `Use /menu to see available options, or /help for guidance.`,
          {
            parse_mode: 'HTML',
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
