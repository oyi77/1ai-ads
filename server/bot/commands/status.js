/**
 * /status command — Account and campaign status
 */

export function handleStatus(deps) {
  return async (ctx) => {
    try {
      const campaigns = deps.repos?.campaignsRepo?.findAll?.() || [];
      const active = campaigns.filter(c => c.status === 'ACTIVE').length;
      const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
      const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
      const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

      ctx.reply(
        `📊 *Account Status*\n\n` +
        `Campaigns: ${active} active / ${campaigns.length} total\n` +
        `Total Spend: Rp ${totalSpend.toLocaleString('id-ID')}\n` +
        `Total Revenue: Rp ${totalRevenue.toLocaleString('id-ID')}\n` +
        `ROAS: ${roas}x\n\n` +
        `Use /menu for more options.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      ctx.reply('⚠️ Failed to load status. Is the database connected?');
    }
  };
}
