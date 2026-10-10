/**
 * /start command — Welcome + main hub.
 * Uses the SAME keyboard as /menu (single source of truth in menu.js) so a
 * first-time user immediately sees every feature the bot offers.
 */

import { createLogger } from '../../lib/logger.js';
import { escapeHtml as esc } from '../../lib/escape.js';
import { mainMenuKeyboard } from './menu.js';

const log = createLogger('bot:start');

export function handleStart() {
  return async (ctx) => {
    const name = ctx.from?.first_name || 'there';
    const userId = ctx.from?.id;

    log.info('User started bot', { userId, name });

    // Telegram only honors a per-chat menu button once a command list exists,
    // and any set made during the boot window is clobbered by setMyCommands.
    // Re-assert it here so a first-time user always gets the Mini App button.
    const webAppUrl = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';
    try {
      await ctx.telegram.setChatMenuButton({
        chat_id: userId,
        menu_button: { type: 'web_app', text: '📱 AdForge', web_app: { url: webAppUrl } },
      });
    } catch (err) {
      log.warn('Failed to set per-chat menu button on start', { userId, error: err.message });
    }

    // Smart onboarding: check user state to personalize message
    // Use ctx.deps (set by bot middleware) — ctx.repos is never populated.
    const deps = ctx.deps || {};
    const hasMetaAccount = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId)?.some(a => a.platform === 'meta' && a.is_active);
    const campaignCount = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId })?.data?.length || 0;
    const ruleCount = deps.repos?.rulesRepo?.countEnabled?.(ctx.userId) || 0;

    let message;
    const keyboard = mainMenuKeyboard();
    if (!hasMetaAccount && campaignCount === 0) {
      message = `👋 <b>Siap bos, selamat datang di AdForge 🙏 ${esc(name)}!</b>\n\n` +
        'Bos, izin lapor bos, buat mulai saya siapin 3 langkah gampang bos:\n' +
        '1️⃣ Bos hubungkan akun iklan dulu ya bos (pencet tombol 🔗 di bawah)\n' +
        '2️⃣ Nanti saya laporin ringkasannya di 📊 Dashboard bos\n' +
        '3️⃣ Terus saya bantu bikinin iklan pertama via 🎯 Buat Campaign bos\n\n' +
        'Pencet tombol <b>🔗 Connect Account</b> di bawah buat mulai ya bos — atau 🎮 Mode Demo di Dashboard kalau bos mau jalan-jalan dulu!';
      keyboard.inline_keyboard.unshift([
        { text: '🔗 Connect Account', callback_data: 'menu:connect' },
      ]);
    } else if (hasMetaAccount && campaignCount === 0) {
      message = `👋 <b>Siap bos, selamat datang kembali bos 🙏 ${esc(name)}!</b>\n\n` +
        'Bos, izin lapor bos ✅ akun iklan bos sudah terhubung, mantap bos\n' +
        '📭 Tapi campaign-nya belum ada yang kesimpen bos\n\n' +
        'Pencet <b>🎯 Buat Campaign</b> biar saya bantu bikinin iklan pertama bos, atau buka <b>🛠️ Kelola Iklan → 📣 Ads Manager</b> biar saya tarikin datanya dari Meta ya bos.';
    } else {
      message = `👋 <b>Siap bos, selamat datang kembali bos 🙏 ${esc(name)}!</b>\n\n` +
        `Bos, izin lapor bos 📊 ${campaignCount} campaign kesimpen\n` +
        `⚡ ${ruleCount} aturan otomatis lagi aktif jagain bos\n\n` +
        'Siap bos, bos mau saya bantu apa hari ini bos? Tinggal pilih di bawah ya bos.';
    }
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  };
}
