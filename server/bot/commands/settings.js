/**
 * /settings command — Token & account management
 * Ported from asisten-jualan/bot/handlers/settings_update.py
 */

export function handleSettings(deps) {
  return async (ctx) => {
    const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.() || [];
    const metaAccounts = accounts.filter(a => a.platform === 'meta');

    ctx.reply(
      '🔧 *Settings*\n\n' +
      `Connected accounts: ${metaAccounts.length}\n` +
      (metaAccounts.length > 0
        ? metaAccounts.map(a => `• ${a.account_name} (${a.is_active ? '✅ active' : '⏸ paused'})`).join('\n')
        : 'No accounts connected yet.') +
      '\n\nChoose an action:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Connect Meta Account', callback_data: 'settings:connect_meta' }],
            [{ text: '🔄 Sync Campaigns', callback_data: 'settings:sync' }],
            [{ text: '📊 View Accounts', callback_data: 'settings:accounts' }],
          ],
        },
      }
    );
  };
}

export function handleSettingsCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    switch (action) {
      case 'connect_meta':
        return ctx.reply(
          '🔗 *Connect Meta Account*\n\n' +
          'Use the web dashboard to connect your Facebook account:\n' +
          '👉 /app → Settings → Connect Meta\n\n' +
          'Or paste your access token directly (advanced):',
          { parse_mode: 'Markdown' }
        );
      case 'sync':
        return ctx.reply('🔄 Syncing campaigns... Use the dashboard for real-time sync status.');
      case 'accounts':
        const accounts = deps.repos?.platformAccountsRepo?.getAccounts?.() || [];
        if (accounts.length === 0) return ctx.reply('No accounts connected. Use /settings to connect.');
        const list = accounts.map(a => `• ${a.account_name} (${a.platform}) ${a.is_active ? '✅' : '⏸'}`).join('\n');
        return ctx.reply(`📊 *Connected Accounts:*\n\n${list}`, { parse_mode: 'Markdown' });
      default:
        return ctx.reply('Unknown settings action.');
    }
  };
}
