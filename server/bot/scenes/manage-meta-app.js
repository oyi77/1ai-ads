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
      ? `\n\nℹ️ Bos, bos sudah punya App terpasang (AppId ${existing.appIdHint}). Kalau simpan yang baru, yang lama saya ganti ya bos.`
      : '';
    await ctx.reply(
      '🔧 <b>Bos, saya atur Kredensial Meta App ya</b>\n\n' +
        'Ini buat pakai Meta App milik bos sendiri (System User, App Secret, Threads) bos.\n' +
        'Semua nilai saya enkripsi dan cuma berlaku buat akun Telegram bos aja.' +
        note +
        '\n\nPertama bos — kasih nama pendek buat App ini ya (misal "App Toko Saya"):',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 1 — System Token
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Bos kirim nama dulu ya (tulisan aja) bos.');
      return;
    }
    ctx.wizard.state.label = text;
    await ctx.reply(
      `Siap bos — <b>${text}</b> 🙏.\n\n` +
        'Bos tempel <b>System User Access Token</b> Meta bos ya (yang awet, long-lived).\n' +
        'Saya enkripsi bos, nggak pernah saya tampilin balik utuh.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 2 — App ID
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Bos tempel System User Access Token-nya dulu ya (tulisan aja) bos.');
      return;
    }
    ctx.wizard.state.systemToken = text;
    await ctx.reply(
      'Sekarang bos tempel <b>App ID</b> Meta bos ya (angka, misal 1234567890).',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 3 — App Secret
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Bos tempel App ID-nya dulu ya (tulisan aja) bos.');
      return;
    }
    ctx.wizard.state.appId = text;
    await ctx.reply('Sekarang bos tempel <b>App Secret</b> bos ya.', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 4 — Threads (optional) → persist
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Bos tempel App Secret-nya dulu ya (tulisan aja) bos.');
      return;
    }
    ctx.wizard.state.appSecret = text;
    await ctx.reply(
      'Terakhir bos — <b>Threads App ID</b> dan <b>Threads App Secret</b> (opsional).\n' +
        'Kirim sebagai <code>ID_THREADS SECRET_THREADS</code> (dipisah spasi, tanpa kutip),\n' +
        'atau bos kirim <code>/skip</code> biar saya selesai tanpa Threads bos.',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
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
      await ctx.reply('⚠️ Maaf bos, penyimpanannya lagi bermasalah 🙏 Coba lagi nanti ya bos.');
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
        `✅ <b>Siap bos, ${label}</b> sudah saya pasang! 🙏\n\n` +
          `App ID: <code>${appId}</code>\n` +
          'Webhook endpoint bos sekarang:\n' +
          `<code>/webhooks/u/${ctx.userId}</code>\n\n` +
          'Bos daftarkan URL ini di dashboard Meta App bos ya (verify token = user id bos).\n' +
          'Semua panggilan Meta sekarang saya lewatkan kredensial App milik bos sendiri bos.',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
      );
    } catch (err) {
      log.error('Failed to store Meta App Creds', { userId: ctx.userId, error: err.message });
      await ctx.reply('⚠️ Maaf bos, gagal saya simpan kredensialnya 🙏 Coba lagi ya bos, atau pakai dashboard web.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
    return ctx.scene.leave();
  }
);

manageMetaAppScene.action(/^metaapp:cancel$/, handleSceneCancel('❌ Siap bos, konfigurasi Meta App saya batalkan 🙏'));

// Allow /skip ONLY on the final persist step (cursor 5) so the user can
// finish without Threads. Forwarding /skip into earlier credential steps
// would store the literal string '/skip' as the label/token/secret.
manageMetaAppScene.command('skip', async (ctx) => {
  if (ctx.wizard.cursor < 5) {
    return ctx.reply('⚠️ Maaf bos, /skip cuma bisa di langkah Threads (opsional) 🙏 Bos kirim nilai yang diminta ya.');
  }
  ctx.message = { ...(ctx.message || {}), text: '/skip' };
  return ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

export default manageMetaAppScene;
