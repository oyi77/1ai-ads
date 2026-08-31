/**
 * Manage Meta App Wizard — per-Telegram-user Meta App-level credentials (App Creds).
 * Stores SystemToken / AppSecret / AppId / ThreadsId / ThreadsSecret scoped to the
 * current user (ctx.userId from identify middleware). One active row per user.
 *
 * Entered via /metaapp command. Steps:
 *   0 — welcome + ask for a friendly label
 *   1 — System Token
 *   2 — App ID
 *   3 — App Secret
 *   4 — Threads (optional, /skip to omit) → persist
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';
import { subscribeUserWebhook } from '../../lib/meta-subscribe.js';
import { handleSceneCancel } from './connect-account.js';

const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'metaapp:cancel' }];

const log = createLogger('bot:scene:metaapp');

export const manageMetaAppScene = new Scenes.WizardScene(
  'manage-meta-app',
  // Step 0 — welcome + friendly label
  async (ctx) => {
    const existing = ctx.deps?.repos?.userMetaAppsRepo?.getMasked?.(ctx.userId);
    const note = existing
      ? `\n\nℹ️ You already have an App configured (AppId ${existing.appIdHint}). Saving new credentials will replace the current one.`
      : '';
    await ctx.reply(
      '🔧 *Manage Meta App Credentials*\n\n' +
        'These power your own Meta App (System User, App Secret, Threads).\n' +
        'All values are encrypted at rest and scoped to your Telegram user only.' +
        note +
        '\n\nFirst — give this App a short label (e.g. "My PixelAD App"):',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 1 — System Token
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Please send a label (just text).');
      return;
    }
    ctx.wizard.state.label = text;
    await ctx.reply(
      `Got it — *${text}*.\n\n` +
        'Paste your Meta *System User Access Token* (long-lived).\n' +
        'It is encrypted at rest and never shown back in full.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 2 — App ID
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Please paste your System User Access Token (just text).');
      return;
    }
    ctx.wizard.state.systemToken = text;
    await ctx.reply(
      'Now paste your Meta *App ID* (numeric, e.g. 1234567890).',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 3 — App Secret
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Please paste your App ID (just text).');
      return;
    }
    ctx.wizard.state.appId = text;
    await ctx.reply('Now paste your Meta *App Secret*.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 4 — Threads (optional) → persist
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Please paste your App Secret (just text).');
      return;
    }
    ctx.wizard.state.appSecret = text;
    await ctx.reply(
      'Finally — your *Threads App ID* and *Threads App Secret* (optional).\n' +
        'Send them as `THREADS_ID THREADS_SECRET` (space-separated, no quotes),\n' +
        'or send `/skip` to finish without Threads.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 5 — persist
  async (ctx) => {
    const raw = ctx.message?.text?.trim();
    let threadsId = null;
    let threadsSecret = null;
    if (raw && !/^[\/]?skip$/i.test(raw)) {
      const parts = raw.split(/\s+/);
      threadsId = parts[0] || null;
      threadsSecret = parts[1] || null;
    }
    const { label, systemToken, appId, appSecret } = ctx.wizard.state;
    const repo = ctx.deps?.repos?.userMetaAppsRepo;
    if (!repo) {
      await ctx.reply('⚠️ Storage unavailable. Please try again later.');
      return ctx.scene.leave();
    }
    try {
      repo.upsert(ctx.userId, {
        appId,
        appSecret,
        systemToken,
        threadsId,
        threadsSecret,
      });
      // Best-effort: subscribe the user's Meta app to their per-user webhook.
      // Parity with REST /api/meta-app. A failure here does not fail the save.
      subscribeUserWebhook(ctx.userId, repo).catch((err) =>
        log.warn('meta_app_subscribe_async_failed', { userId: ctx.userId, error: err.message })
      );
      log.info('Meta App Creds saved via bot', {
        userId: ctx.userId,
        appId,
        hasThreads: Boolean(threadsId),
      });
      await ctx.reply(
        `✅ *${label}* configured!\n\n` +
          `App ID: \`${appId}\`\n` +
          'Your webhook endpoint is now:\n' +
          `\`/webhooks/u/${ctx.userId}\`\n\n` +
          'Subscribe this URL in your Meta App dashboard (verify token = your user id).\n' +
          'All Meta calls now route through your own App credentials.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      log.error('Failed to store Meta App Creds', { userId: ctx.userId, error: err.message });
      await ctx.reply('⚠️ Could not save credentials. Please try again or use the web dashboard.');
    }
    return ctx.scene.leave();
  }
);

manageMetaAppScene.action(/^metaapp:cancel$/, handleSceneCancel('❌ Konfigurasi Meta App dibatalkan.'));

// Allow /skip ONLY on the final persist step (cursor 5) so the user can
// finish without Threads. Forwarding /skip into earlier credential steps
// would store the literal string '/skip' as the label/token/secret.
manageMetaAppScene.command('skip', async (ctx) => {
  if (ctx.wizard.cursor < 5) {
    return ctx.reply('⚠️ /skip hanya tersedia di langkah Threads (opsional). Kirim nilai yang diminta.');
  }
  ctx.message = { ...(ctx.message || {}), text: '/skip' };
  return ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

export default manageMetaAppScene;
