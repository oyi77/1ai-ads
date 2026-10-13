/**
 * Admin commands — Stats, user management, broadcast
 * Ported from asisten-jualan/bot/handlers/admin.py
 */

import { filterActiveCampaigns } from '../../lib/campaign-status.js';

import { escapeHtml as esc } from '../../lib/escape.js';
import { ADDONS, addonLabel } from '../../lib/addons.js';

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
        '<code>/admin_grant <telegram_id|user_id|username> <plan|addon></code>\n\n' +
        'Plan: <b>enterprise</b> (Lifetime, expires NULL) atau <b>pro</b> (30 hari).\n' +
        'Add-on: <b>lp</b> (Landing Page 49rb), <b>bridge</b> (Content + Social Bridge 49rb).\n\n' +
        'Contoh:\n' +
        '<code>/admin_grant 5220170786 enterprise</code>\n' +
        '<code>/admin_grant 5220170786 lp</code>\n' +
        '<code>/admin_grant @username bridge</code>',
        { parse_mode: 'HTML' }
      );
    }

    const [target, what] = args;
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

    // ── Add-on branch ──────────────────────────────────────────
    if (ADDONS[what]) {
      const userAddonsRepo = deps.repos?.userAddonsRepo;
      if (!userAddonsRepo) return ctx.reply('⚠️ Repo add-on tidak tersedia.');
      userAddonsRepo.grant(user.id, what, String(ctx.from?.id));
      await ctx.reply(
        `✅ <b>Add-on ${esc(addonLabel(what))} diaktifkan untuk:</b>\n` +
        `User: ${esc(user.username)} (<code>${esc(user.id)}</code>)`,
        { parse_mode: 'HTML' }
      );
      if (user.telegram_id) {
        try {
          await ctx.telegram.sendMessage(
            user.telegram_id,
            `🎉 <b>Bos, add-on ${esc(addonLabel(what))} sudah aktif 🙏</b>\n\n` +
            `Sekarang bos bisa pakai fiturnya ya bos. Buka /menu atau 📱 Mini App.`,
            { parse_mode: 'HTML' }
          );
        } catch { /* ignore */ }
      }
      return;
    }

    // ── Plan branch ────────────────────────────────────────────
    const plan = what;
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
          `Paket: <b>${esc(plan)}</b>\n` +
          `${expiresAt ? `Berlaku sampai: ${new Date(expiresAt).toLocaleString('id-ID')}` : 'LIFETIME — selamanya aktif!'}\n\n` +
          `Sekarang bos bisa pakai semua fiturnya ya bos. Buka /menu atau 📱 Mini App.`,
          { parse_mode: 'HTML' }
        );
      } catch { /* ignore */ }
    }
  };
}

/**
 * /admin_revoke <target> <plan|addon> — cabut paket atau add-on.
 */
export function handleAdminRevoke(deps) {
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
        '<code>/admin_revoke <telegram_id|user_id|username> <addon></code>\n\n' +
        'Add-on: <b>lp</b>, <b>bridge</b>. Cabut paket base tidak didukung.',
        { parse_mode: 'HTML' }
      );
    }

    const [target, addonKey] = args;
    const usersRepo = deps.repos?.usersRepo;
    if (!usersRepo) return ctx.reply('⚠️ Repo users tidak tersedia.');

    let user = null;
    if (target.startsWith('@')) {
      user = usersRepo.findByUsername?.(target.slice(1));
    } else if (target.includes('-') && target.length > 20) {
      user = usersRepo.findById?.(target);
    } else {
      user = usersRepo.findByTelegramId?.(target);
    }
    if (!user) return ctx.reply('⚠️ User tidak ketemu. Cek ID/username bos.');

    if (!ADDONS[addonKey]) {
      return ctx.reply(`⚠️ Add-on tidak dikenal. Pilihan: ${Object.keys(ADDONS).join(', ')}`);
    }

    const userAddonsRepo = deps.repos?.userAddonsRepo;
    if (!userAddonsRepo) return ctx.reply('⚠️ Repo add-on tidak tersedia.');
    userAddonsRepo.revoke(user.id, addonKey);
    await ctx.reply(
      `✅ <b>Add-on ${esc(addonLabel(addonKey))} dicabut untuk:</b>\n` +
      `User: ${esc(user.username)} (<code>${esc(user.id)}</code>)`,
      { parse_mode: 'HTML' }
    );
  };
}

/**
 * /admin_addons <target> — lihat add-on aktif seorang user.
 */
export function handleAdminAddons(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Maaf bos, ini cuma buat admin.');
    }

    const args = (ctx.message?.text || '').trim().split(/\s+/).slice(1);
    const target = args[0];
    if (!target) {
      return ctx.reply('🛠️ <b>Cara pakai:</b>\n<code>/admin_addons <telegram_id|user_id|username></code>', { parse_mode: 'HTML' });
    }
    const usersRepo = deps.repos?.usersRepo;
    if (!usersRepo) return ctx.reply('⚠️ Repo users tidak tersedia.');

    let user = null;
    if (target.startsWith('@')) {
      user = usersRepo.findByUsername?.(target.slice(1));
    } else if (target.includes('-') && target.length > 20) {
      user = usersRepo.findById?.(target);
    } else {
      user = usersRepo.findByTelegramId?.(target);
    }
    if (!user) return ctx.reply('⚠️ User tidak ketemu. Cek ID/username bos.');

    const userAddonsRepo = deps.repos?.userAddonsRepo;
    const active = userAddonsRepo?.listActive?.(user.id) || [];
    const lines = Object.values(ADDONS).map(a => `${active.includes(a.key) ? '✅' : '🔒'} ${esc(a.name)} (<code>${esc(a.key)}</code>) — Rp ${a.price.toLocaleString('id-ID')}`);
    await ctx.reply(
      `📋 <b>Add-on untuk ${esc(user.username)}</b> (<code>${esc(user.id)}</code>)\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  };
}
