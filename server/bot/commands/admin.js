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
      return ctx.reply('⛔ Admin only.');
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
      return ctx.reply('⚠️ Gagal muat statistik admin.');
    }
  };
}

export function handleAdminUsers(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Admin only.');
    }

    try {
      const users = deps.repos?.usersRepo?.findAll?.() || [];
      const list = users.slice(0, 20).map(u => `• ${esc(u.username)} (${esc(u.role || 'user')})`).join('\n');
      return ctx.reply(`👥 <b>Users (${users.length}):</b>\n\n${list || 'Belum ada user.'}`, { parse_mode: 'HTML' });
    } catch {
      return ctx.reply('⚠️ Gagal muat daftar user.');
    }
  };
}

export function handleAdminBroadcast(deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Admin only.');
    }

    const text = (ctx.message?.text || '').replace(/^\/admin_broadcast\s*/, '').trim();
    if (!text) {
      return ctx.reply('📢 Fitur broadcast — kirim pesan ke semua user. Cara: /admin_broadcast <pesan>');
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
      return ctx.reply(`📢 Broadcast kekirim ke ${sent} user${failed ? `, ${failed} gagal` : ''}.`);
    } catch (err) {
      return ctx.reply(`⚠️ Broadcast gagal: ${err?.message || 'error tidak dikenal'}`);
    }
  };
}
