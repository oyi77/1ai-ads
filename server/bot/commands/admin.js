/**
 * Admin commands — Stats, user management, broadcast
 * Ported from asisten-jualan/bot/handlers/admin.py
 */

function escMd(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[_*[\]()~`>#+\-=|.!{}]/g, '\\$&');
}

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
        `📊 *Admin Stats*\n\n` +
        `Users: ${users.length}\n` +
        `Campaigns: ${campaigns.length}\n` +
        `Connected accounts: ${accounts.length}\n` +
        `Active campaigns: ${campaigns.filter(c => c.status === 'ACTIVE').length}`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      return ctx.reply('⚠️ Failed to load admin stats.');
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
      const list = users.slice(0, 20).map(u => `• ${escMd(u.username)} (${escMd(u.role || 'user')})`).join('\n');
      return ctx.reply(`👥 *Users (${users.length}):*\n\n${list || 'No users found.'}`, { parse_mode: 'Markdown' });
    } catch {
      return ctx.reply('⚠️ Failed to load users.');
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
      return ctx.reply('📢 Broadcast feature — send a message to all users. Usage: /admin_broadcast <message>');
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
      return ctx.reply(`📢 Broadcast sent to ${sent} user${sent !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`);
    } catch (err) {
      return ctx.reply(`⚠️ Broadcast failed: ${err?.message || 'unknown error'}`);
    }
  };
}
