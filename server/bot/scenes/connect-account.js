/**
 * Connect Account Wizard — per-customer platform connection.
 * Entered with state { platform } from the /start connect buttons.
 * Stores the account scoped to the current user (ctx.userId from identify middleware).
 */
import { Scenes } from 'telegraf';
import { verifyMetaTokenApp } from '../../services/meta-connection.js';
import { MetaAdsAPI } from '../../services/meta/index.js';
import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';
import { sanitizeAccessToken } from '../../lib/token-sanitize.js';

const log = createLogger('bot:scene:connect');

export const PLATFORM_NAMES = {
  meta: 'Meta (Facebook/Instagram)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  twitter: 'Twitter/X Ads',
  snapchat: 'Snapchat Ads',
  pinterest: 'Pinterest Ads',
  microsoft: 'Microsoft/Bing Ads',
};

function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'connect:cancel' }];

export async function validateMetaAccessToken(accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(
    `https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name`,
    { signal: AbortSignal.timeout(15000) }
  );
  const me = await res.json();
  if (!me || me.error) {
    const code = me?.error?.code ? ` (code ${me.error.code})` : '';
    throw new Error(`Invalid Meta token${code}`);
  }
  return me;
}

/** Shared scene-cancel callback — usable from any wizard via its own prefix. */
export function handleSceneCancel(msg = '❌ Dibatalkan.') {
  return async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(msg);
    return ctx.scene.leave();
  };
}

export const connectScene = new Scenes.WizardScene(
  'connect-account',
  // Step 0 — capture platform, ask for account name
  async (ctx) => {
    const platform = ctx.scene.state?.platform || ctx.wizard.state.platform;
    if (!platform) {
      await ctx.reply('⚠️ Platform belum dipilih. Pencet tombol platform dari /start dulu ya.');
      return ctx.scene.leave();
    }
    ctx.wizard.state.platform = platform;
    await ctx.reply(
      `🔌 <b>Hubungkan ${escapeHtml(PLATFORM_NAMES[platform] || platform)}</b>\n\n` +
      'Kasih nama buat koneksi ini ya (misal "Akun Toko Utama"). Cuma buat pengingat kamu aja:',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 1 — capture account name, ask for token
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Kirim nama buat koneksi ini ya (tulisan aja).');
      return;
    }
    ctx.wizard.state.accountName = text;
    const platform = ctx.wizard.state.platform;
    const isMeta = platform === 'meta';

    let msg = `Oke — <b>${escapeHtml(text)}</b>.\n\n`;

    if (isMeta) {
      msg +=
        '🔑 <b>Cara ambil token Meta:</b>\n' +
        '1. Buka https://developers.facebook.com/tools/explorer/\n' +
        '2. Pilih aplikasimu (atau bikin baru)\n' +
        '3. Klik "Generate Access Token"\n' +
        '4. Centang: ads_management, ads_read, business_management, pages_show_list\n' +
        '5. Tempel tokennya di sini\n\n' +
        'Token dienkripsi dan cuma berlaku buat akun Telegram-mu.';
    } else {
      msg += 'Sekarang tempel access token / API key akun ini. Dienkripsi dan cuma buat kamu.';
    }

    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 2 — validate token, persist, confirm
  async (ctx) => {
    const token = sanitizeAccessToken(ctx.message?.text);
    if (!token) {
      await ctx.reply('Tempel access token-nya ya (tulisan aja).');
      return;
    }
    const { platform, accountName } = ctx.wizard.state;
    if (platform === 'meta') {
      try {
        await validateMetaAccessToken(token);
        await verifyMetaTokenApp(token);
      } catch (err) {
        log.warn('Meta token rejected before persistence', { userId: ctx.userId, error: err.message });
        await ctx.reply(`Token ditolak: ${err.message}\n\nPastikan token dibuat di bawah aplikasi AdForge (Settings → Connect), bukan aplikasi lain.`);
        return;
      }
    }
    const repo = ctx.deps?.repos?.platformAccountsRepo;
    if (!repo) {
      await ctx.reply('⚠️ Storage unavailable. Please try again later.');
      return ctx.scene.leave();
    }
    try {
      const created = repo.create({
        user_id: ctx.userId,
        platform,
        account_name: accountName,
        credentials: { access_token: token },
      });
      // Enforce single-active invariant: only the newly connected account stays active.
      repo.setActiveAccountForUser(platform, created.id, ctx.userId);
      // Record first_sync milestone via the payments repo (the method lives on
      // PaymentsRepository, not PlatformAccountsRepository).
      try {
        ctx.deps?.repos?.paymentsRepo?.recordMilestone?.(ctx.userId, 'first_sync', { platform, accountId: created.id });
      } catch { /* milestone recording is best-effort */ }
      log.info('Platform account connected via bot', {
        userId: ctx.userId,
        platform,
        accountId: created?.id,
      });
      // Ceritakan ke pemula: token ini kebaca berapa akun iklan (live check, best-effort).
      let foundNote = '';
      if (platform === 'meta') {
        try {
          const live = await MetaAdsAPI.withToken(token).getAdAccounts();
          foundNote = live.length > 0
            ? `\n\n🎉 Token kamu kebaca <b>${live.length} akun iklan</b>: ${live.slice(0, 3).map(a => escapeHtml(a.name || a.id)).join(', ')}${live.length > 3 ? `, dan ${live.length - 3} lainnya` : ''}.`
            : `\n\n📭 Token valid, tapi <b>belum ada akun iklan yang kebaca</b> dari token ini.`;
        } catch { /* live check best-effort — pesan sukses tetap terkirim */ }
      }
      await ctx.reply(
        `✅ <b>${escapeHtml(accountName)}</b> berhasil dihubungkan untuk ${escapeHtml(PLATFORM_NAMES[platform] || platform)}!` +
        foundNote +
        `\n\n💡 <b>Kok akun saya yang lain belum muncul?</b>\n` +
        `Bot hanya membaca akun iklan yang <b>token-nya terhubung</b> — biasanya semua akun dalam <b>1 Business Manager yang sama</b>.\n` +
        `Caranya: buka <b>Business Manager → Business Settings → Ad Accounts</b>, pastikan akunnya ada di BM itu, ` +
        `lalu hubungkan token dari BM yang sama via /status → ➕ Tambah Akun.` +
        `\n\nLihat ringkasannya di /status.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      log.error('Failed to store platform account', { userId: ctx.userId, platform, error: err.message });
      await ctx.reply('⚠️ Could not save the connection. Please try again or use the web dashboard.');
    }
    return ctx.scene.leave();
  }
);

connectScene.action(/^connect:cancel$/, handleSceneCancel('❌ Koneksi dibatalkan.'));

export default connectScene;