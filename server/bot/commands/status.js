/**
 * /status command — Account and campaign status
 */
import { NAV, buildKeyboard } from '../nav.js';

export function handleStatus(deps) {
  return async (ctx) => {
    try {
      const result = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [], total: 0 };
      const campaigns = result.data || [];
      const active = campaigns.filter(c => c.status === 'ACTIVE').length;
      const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
      const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
      const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

      let message = `📊 *Account Status*\n\n`;
      message += `Campaigns: ${active} active / ${campaigns.length} total\n`;
      message += `Total Spend: Rp ${totalSpend.toLocaleString('id-ID')}\n`;
      message += `Total Revenue: Rp ${totalRevenue.toLocaleString('id-ID')}\n`;
      message += `ROAS: ${roas}x`;

      if (campaigns.length === 0) {
        message += '\n\n📭 No campaigns yet. Connect platforms and sync campaigns to get started!';
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📣 Ads Manager', callback_data: 'menu:ads' }],
            [{ text: '⚡ Rules', callback_data: 'menu:monitor' }],
            [{ text: '🌐 Platforms', callback_data: 'menu:platforms' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      });
    } catch {
      await ctx.reply('⚠️ Failed to load status. Is the database connected?');
    }
  };
}
