/**
 * Admin commands — Stats, user management, broadcast
 * Ported from asisten-jualan/bot/handlers/admin.py
 */

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

      ctx.reply(
        `📊 *Admin Stats*\n\n` +
        `Users: ${users.length}\n` +
        `Campaigns: ${campaigns.length}\n` +
        `Connected accounts: ${accounts.length}\n` +
        `Active campaigns: ${campaigns.filter(c => c.status === 'ACTIVE').length}`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      ctx.reply('⚠️ Failed to load admin stats.');
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
      const list = users.slice(0, 20).map(u => `• ${u.username} (${u.role || 'user'})`).join('\n');
      ctx.reply(`👥 *Users (${users.length}):*\n\n${list || 'No users found.'}`, { parse_mode: 'Markdown' });
    } catch {
      ctx.reply('⚠️ Failed to load users.');
    }
  };
}

export function handleAdminBroadcast(_deps) {
  return async (ctx) => {
    const userId = ctx.from?.id;
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(Number).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return ctx.reply('⛔ Admin only.');
    }

    ctx.reply('📢 Broadcast feature — send a message to all users. Usage: /admin_broadcast <message>');
  };
}
