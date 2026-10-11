/**
 * Admin commands — Stats, user management, broadcast
 * Ported from asisten-jualan/bot/handlers/admin.py
 */

import { filterActiveCampaigns } from '../../lib/campaign-status.js';

import { escapeHtml as esc } from '../../lib/escape.js';

export function handleAdminStats(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Maaf bos, ini cuma buat admin.');
    }

    try {
      const users = deps.repos?.usersRepo?.findAll?.() || [];
      const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.() || [];

      return ctx.reply(
        `📊 <b>Admin Stats</b>\n\n` +
        `Users: ${users.length}\n` +
        `Campaigns: ${campaigns.length}\n` +
        `Connected accounts: ${accounts.length}\n` +
        `Active campaigns: ${filterActiveCampaigns(campaigns).length}`,
        { parse_mode: 'HTML' }
      );
    } catch {
      return ctx.reply('⚠️ Maaf bos, statistik admin gagal saya muat 🙏');
    }
  };
}

export function handleAdminUsers(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Maaf bos, ini cuma buat admin.');
    }

    try {
      const users = deps.repos?.usersRepo?.findAll?.() || [];
      const list = users.slice(0, 20).map(u => `• ${esc(u.username)} (${esc(u.role || 'user')})`).join('\n');
      return ctx.reply(`👥 <b>Bos, ini daftar user (${users.length}):</b>\n\n${list || 'Belum ada user.'}`, { parse_mode: 'HTML' });
    } catch {
      return ctx.reply('⚠️ Maaf bos, daftar user gagal saya muat 🙏');
    }
  };
}

export function handleAdminBroadcast(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Maaf bos, ini cuma buat admin.');
    }

    const text = (ctx.message?.text || '').replace(/^\/admin_broadcast\s*/, '').trim();
    if (!text) {
      return ctx.reply('📢 Bos, ini fitur broadcast — saya kirimin pesan ke semua user. Cara: /admin_broadcast <pesan>');
    }

    try {
      const users = deps.repos?.usersRepo?.findAll?.() || [];
      const tgIds = users
        .map(u => u.telegram_id)
        .filter(Boolean)
        .map(String);
      let sent = 0;
      let failed = 0;
      const bot = ctx.telegram;
      for (const tgId of tgIds) {
        try {
          await bot.sendMessage(tgId, text);
          sent++;
        } catch {
          failed++;
        }
      }
      return ctx.reply(`📢 Bos, broadcast sudah saya kirim ke ${sent} user${failed ? `, ${failed} gagal` : ''} 🙏`);
    } catch (err) {
      return ctx.reply(`⚠️ Maaf bos, broadcast gagal: ${err?.message || 'error tidak dikenal'} 🙏`);
    }
  };
}
/**
 * /admin_grant <telegram_id|user_id|username> <plan> — aktifkan paket
 * manual setelah bos konfirmasi pembayaran. Lifetime = plan enterprise,
 * expires NULL (tidak pernah kedaluwarsa — lihat findExpiredPaidPlans).
 *
 * Contoh:
 *   /admin_grant 5220170786 enterprise   → lifetime
 *   /admin_grant 5220170786 pro          → pro 30 hari
 */
export function handleAdminGrant(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Maaf bos, ini cuma buat admin.');
    }

    const args = (ctx.message?.text || '').trim().split(/\s+/).slice(1);
    if (args.length < 2) {
      return ctx.reply(
        '🛠️ <b>Cara pakai:</b>\n' +
        '<code>/admin_grant <telegram_id|user_id|username> <plan></code>\n\n' +
        'Plan: <b>enterprise</b> (Lifetime, expires NULL) atau <b>pro</b> (30 hari).\n\n' +
        'Contoh:\n' +
        '<code>/admin_grant 5220170786 enterprise</code>\n' +
        '<code>/admin_grant e78f2a01-2132-40b9-8bfa-33b17ae729e1 pro</code>\n' +
        '<code>/admin_grant @username enterprise</code>',
        { parse_mode: 'HTML' }
      );
    }

    const [target, plan] = args;
    const usersRepo = deps.repos?.usersRepo;
    if (!usersRepo) return ctx.reply('⚠️ Repo users tidak tersedia.');

    let user = null;
    if (target.startsWith('@')) {
      user = usersRepo.findByUsername?.(target.slice(1));
    } else if (target.includes('-') && target.length > 20) {
      // UUID
      user = usersRepo.findById?.(target);
    } else {
      // telegram_id
      user = usersRepo.findByTelegramId?.(target);
    }

    if (!user) {
      return ctx.reply('⚠️ User tidak ketemu. Cek ID/username bos.');
    }

    const expiresAt = plan === 'pro' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    usersRepo.update(user.id, { plan, plan_expires_at: expiresAt });

    await ctx.reply(
      `✅ <b>Paket <code>${esc(plan)}</code> diaktifkan untuk:</b>\n` +
      `User: ${esc(user.username)} (<code>${esc(user.id)}</code>)\n` +
      `Telegram ID: <code>${esc(String(user.telegram_id || '-'))}</code>\n` +
      `${expiresAt ? `Berlaku sampai: ${new Date(expiresAt).toLocaleString('id-ID')}` : 'LIFETIME (tidak expired)'}`,
      { parse_mode: 'HTML' }
    );

    // Notif user kalau punya telegram_id
    if (user.telegram_id) {
      try {
        await ctx.telegram.sendMessage(
          user.telegram_id,
          `🎉 <b>Bos, paketmu sudah aktif 🙏</b>\n\n` +
          `Paket: <b>${plan}</b>\n` +
          `${expiresAt ? `Berlaku sampai: ${new Date(expiresAt).toLocaleString('id-ID')}` : 'LIFETIME — selamanya aktif!'}\n\n` +
          `Sekarang bos bisa pakai semua fiturnya ya bos. Buka /menu atau 📱 Mini App.`,
          { parse_mode: 'HTML' }
        );
      } catch { /* ignore */ }
    }
  };
}
