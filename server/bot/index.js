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
import { handleAdminStats, handleAdminUsers, handleAdminBroadcast, handleAdminGrant, handleAdminRevoke, handleAdminAddons } from './commands/admin.js';
import { handleApprovalApprove, handleApprovalReject } from './commands/approvals.js';
import { handleAds, handleAdsSelect, handleAdsToggle, handleAdsAsk, handleAdsAskBud, handleAdsReport, handleAdsDisconnect, handleAdsManage, handleAdsDisconnectConfirm, handleAdsAccountReport, handleAdsAccountsPage, handleAdsCampaignsPage, handleAdsBudgetScale, handleAdsPlatform } from './commands/ads.js';
import { handlePricing, handlePricingCallback } from './commands/pricing.js';
import { handleStrategy, handleStrategyCallback } from './commands/strategy.js';
import { initScheduler } from './scheduler.js';
import { errorHandler } from './middleware/error-handler.js';
import { loadingIndicator } from '../lib/bot-loading.js';
import { escapeHtml as esc } from '../lib/escape.js';
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
  'strategy',
  'admin_stats', 'admin_users', 'admin_broadcast', 'admin_grant', 'admin_revoke', 'admin_addons',
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
  // Loading UX: toast saat tap tombol + typing heartbeat kalau handler
  // lambat. Sekali di sini = berlaku ke semua 47 call-site answerCbQuery.
  bot.use(loadingIndicator());

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
    cancel: async (ctx) => {
      // /cancel must actually cancel the active wizard, not just repaint the
      // menu: the scene stayed live so the next typed value was swallowed by
      // the abandoned wizard step. Leave first, then show the main menu.
      try { await ctx.scene?.leave(); } catch { /* no active scene */ }
      if (ctx.session?.ruleBuilder) delete ctx.session.ruleBuilder;
      if (ctx.session) ctx.session.__scenes = {};
      return handleMenu()(ctx);
    },
    help: handleHelp(),
    status: handleStatus(deps),
    quick: handleMenu(),
    settings: handleSettings(deps),
    pricing: handlePricing(),
    strategy: handleStrategy(),
    admin_stats: handleAdminStats(deps),
    admin_users: handleAdminUsers(deps),
    admin_broadcast: handleAdminBroadcast(deps),
    admin_grant: handleAdminGrant(deps),
    admin_revoke: handleAdminRevoke(deps),
    admin_addons: handleAdminAddons(deps),
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
      `⚠️ Maaf bos, perintah saya nggak kenal 🙏 Bos buka /menu ya, saya tunjukin pilihannya bos.`,
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
  bot.action(/^pricing:(.+)$/, handlePricingCallback());
  bot.action(/^strategy:(.+)$/, handleStrategyCallback());
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
  // ROOT CAUSE (proven 2026-09-25): app.use(path, handler) makes Express strip
  // the mount prefix from req.url, so Telegraf's webhook filter compared its
  // own hookPath ('/webhook/telegram') against '/' and never matched — every
  // Telegram update fell through to the SPA catch-all and the bot answered
  // nothing (silent since the hermes proxy was removed, 357b13c).
  // Mounting on a Router keeps req.url intact, which is what the filter needs.
  const webhookPath = '/webhook/telegram';
  // No path on app.use: Express strips a mount path from req.url, which is what
  // broke the filter. Registering path-less keeps req.url intact for Telegraf's
  // own comparison, and non-webhook requests fall through via next().
  const telegramWebhook = bot.webhookCallback(webhookPath);
  app.use((req, res, next) => telegramWebhook(req, res, next));

  const host = process.env.WEBAPP_HOST || 'adforge.aitradepulse.com';
  const protocol = 'https';
  const webAppUrl = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';

  // Sync command picker
  const MY_COMMANDS = [
    { command: 'start', description: '🚀 Mulai / menu utama' },
    { command: 'menu', description: '📋 Menu utama' },
    { command: 'quick', description: '📋 Menu cepat' },
    { command: 'status', description: '📊 Ringkasan kampanye & ROAS' },
    { command: 'ads', description: '📣 Kelola akun iklan multi-platform' },
    { command: 'create', description: '🎯 Buat kampanye (wizard)' },
    { command: 'monitor', description: '⚡ Aturan otomatis & alert' },
    { command: 'optimize', description: '🤖 Saran AI optimasi' },
    { command: 'strategy', description: '🎓 Cara pakai (panduan pemula)' },
    { command: 'cancel', description: '❌ Batalkan wizard/flow aktif' },
    { command: 'pricing', description: '💰 Harga — Rp 99rb lifetime' },
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

    const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const setOne = async (chatId) => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await bot.telegram.setChatMenuButton({
            ...(chatId ? { chat_id: chatId } : {}),
            menu_button: MENU_BUTTON,
          });
          // Telegram's getChatMenuButton readback lags server-side (observed
          // 10s-90s+), so a successful set can still read back 'commands'.
          // Trust the ok:true from setChatMenuButton; retrying on readback
          // mismatch burned the rate limit and flooded logs (51 warns / 3min).
          log.info('Mini App menu button set', { chatId: chatId || 'default', attempt });
          return true;
        } catch (err) {
          // 429 carries a server-mandated retry_after; using the shorter local
          // backoff would just burn attempts into the same 429.
          const m = /retry after (\d+)/i.exec(err?.message || '');
          if (m) {
            const waitSec = Math.min(Number(m[1]) + 1, 150);
            log.warn('Mini App menu button rate-limited, waiting', { chatId: chatId || 'default', waitSec, attempt });
            await sleepMs(waitSec * 1000);
            continue;
          }
          log.warn('Failed to set Mini App menu button', { chatId: chatId || 'default', error: err.message, attempt });
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
      return false;
    };

    // Read-first: chats already showing the button are skipped, so the
    // 10-minute re-assert never spends rate limit re-setting what Telegram
    // already holds.
    const ensureChat = async (target) => {
      try {
        const cur = await bot.telegram.getChatMenuButton(
          target ? { chat_id: target } : undefined);
        if (cur?.type === 'web_app') return true;
      } catch { /* fall through to set */ }
      return setOne(target);
    };

    let ok = await ensureChat(null);
    for (const chatId of chatIds) {
      ok = (await ensureChat(chatId)) || ok;
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
  // twice inside the boot clobber window, then stop — a forever-interval kept
  // fighting readback lag and tripped 429 retry-after on live users. Remaining
  // recovery paths: /start re-asserts the button for that chat, and the next
  // boot re-runs this.
  for (const delay of [30000, 90000]) {
    const bootTimer = setTimeout(() => { syncBotSurface(); }, delay);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();
  }

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
          `❓ Maaf bos, perintah <b>${cmd}</b> saya nggak kenal 🙏\n\n` +
          `Bos buka /menu biar saya tunjukin pilihannya ya bos, atau /help buat panduan saya bos.`,
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
    ctx.reply('Bos, buka /menu ya biar saya tunjukin pilihannya bos, atau /help buat panduan saya bos.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          [{ text: '❓ Help', callback_data: 'menu:help' }],
        ],
      },
    });
  };
}

/**
 * Foto masuk = hampir selalu bukti transfer (alur /pricing → Beli Lifetime).
 * Teruskan ke chat admin (ops channel) supaya bos bisa konfirmasi & grant
 * plan. Ini bukan alert lintas-tenant: isinya cuma foto dari user ini sendiri.
 * Kalau bukan alur pembelian, user tetap dapat balasan yang sama seperti biasa.
 */
function handlePhotoMessage(_deps) {
  return async (ctx) => {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const uname = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'tanpa nama');
    const caption = `🧾 <b>Bukti transfer masuk</b>\n\nDari: ${esc(uname)}\nUser ID: <code>${esc(String(ctx.userId || '-'))}</code>\nTelegram ID: <code>${esc(String(ctx.from?.id || '-'))}</code>`;
    let forwarded = false;
    try {
      if (chatId && ctx.telegram) {
        await ctx.telegram.sendPhoto(chatId, ctx.message.photo.at(-1).file_id, {
          caption,
          parse_mode: 'HTML',
        });
        forwarded = true;
      }
    } catch { /* ops channel optional */ }
    await ctx.reply(
      forwarded
        ? '📸 <b>Siap bos, bukti transfernya sudah saya teruskan ke admin 🙏</b>\n\nAdmin biasanya proses dalam beberapa menit. Begitu paketnya aktif, saya kabarin bos di chat ini ya.'
        : '📸 Siap bos, fotonya saya terima 🙏 Chat admin langsung ya buat konfirmasi transfernya, atau buka /menu ya.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  };
}

