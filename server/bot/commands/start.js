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

    // Smart onboarding: check user state to personalize message
    // Use ctx.deps (set by bot middleware) — ctx.repos is never populated.
    const deps = ctx.deps || {};
    const hasMetaAccount = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId)?.some(a => a.platform === 'meta' && a.is_active);
    const campaignCount = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId })?.data?.length || 0;
    const ruleCount = deps.repos?.rulesRepo?.countEnabled?.(ctx.userId) || 0;

    let message;
    const keyboard = mainMenuKeyboard();
    if (!hasMetaAccount && campaignCount === 0) {
      message = `👋 <b>Halo ${esc(name)}, selamat datang di AdForge!</b>\n\n` +
        '🚀 <b>Mulai dalam 3 langkah gampang:</b>\n' +
        '1️⃣ Hubungkan akun iklanmu (pencet tombol 🔗 di bawah)\n' +
        '2️⃣ Lihat ringkasannya di 📊 Dashboard\n' +
        '3️⃣ Bikin iklan pertama via 🎯 Buat Campaign\n\n' +
        'Pencet tombol <b>🔗 Connect Account</b> di bawah buat mulai — atau 🎮 Mode Demo di Dashboard kalau mau jalan-jalan dulu!';
      keyboard.inline_keyboard.unshift([
        { text: '🔗 Connect Account', callback_data: 'menu:connect' },
      ]);
    } else if (hasMetaAccount && campaignCount === 0) {
      message = `👋 <b>Halo lagi, ${esc(name)}!</b>\n\n` +
        '✅ Akun iklan sudah terhubung\n' +
        '📭 Belum ada campaign yang kesimpen\n\n' +
        'Pencet <b>🎯 Buat Campaign</b> buat bikin iklan pertamamu, atau buka <b>🛠️ Kelola Iklan → 📣 Ads Manager</b> buat tarik data dari Meta.';
    } else {
      message = `👋 <b>Halo lagi, ${esc(name)}!</b>\n\n` +
        `📊 ${campaignCount} campaign kesimpen\n` +
        `⚡ ${ruleCount} aturan otomatis aktif\n\n` +
        'Mau ngapain hari ini? Pilih di bawah ya.';
    }
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  };
}
