/**
 * /settings command — Token & account management
 * Ported from asisten-jualan/bot/handlers/settings_update.js
 */

import { PLATFORM_NAMES } from '../scenes/connect-account.js';
export function handleSettings(deps) {
  return async (ctx) => {
    const accounts = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [];

    const platformRows = Object.entries(PLATFORM_NAMES).map(([key, label]) => {
      const active = accounts.find(a => a.platform === key && a.is_active);
      const status = active
        ? `✅ Connected (${active.account_name})`
        : '— Belum terhubung';
      const button = key === 'meta'
        ? { text: active ? `🔑 Meta Token — ${active.account_name}` : '🔑 Hubungkan Meta via Token', callback_data: 'settings:connect_meta' }
        : { text: `${active ? '✅' : '🔗'} ${label}`, url: `https://adforge.aitradepulse.com/platforms?platform=${key}` };
      return { label, status, button };
    });

    const body = platformRows.map(r => `• ${r.label}: ${r.status}`).join('\n');

    return ctx.reply(
      '🔧 *Settings*\n\n' +
      `${body}\n\n` +
      'Pilih platform untuk terhubung lewat web, atau kelola akun:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...platformRows.map(r => [r.button]),
            [{ text: '🔄 Sync Campaigns', callback_data: 'settings:sync' }],
            [{ text: '📊 View Accounts', callback_data: 'settings:accounts' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
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
        return ctx.scene.enter('connect-account', { platform: 'meta' });
      case 'sync':
        return ctx.reply('🔄 Syncing campaigns... Use the dashboard for real-time sync status.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        });
      case 'accounts': {
        const accounts = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
        if (accounts.length === 0) {
          return ctx.reply('No accounts connected. Use /settings to connect.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔧 Settings', callback_data: 'menu:settings' }],
                [{ text: '📋 Menu', callback_data: 'quick:menu' }],
              ],
            },
          });
        }
        const list = accounts.map(a => `• ${a.account_name} (${a.platform}) ${a.is_active ? '✅' : '⏸'}`).join('\n');
        return ctx.reply(`📊 *Connected Accounts:*\n\n${list}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔧 Settings', callback_data: 'menu:settings' }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        });
      }
      default:
        return ctx.reply('Unknown settings action.');
    }
  };
}
