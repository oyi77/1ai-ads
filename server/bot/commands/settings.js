/**
 * /settings command — Token & account management
 * Ported from asisten-jualan/bot/handlers/settings_update.js
 */

import { PLATFORM_NAMES } from '../scenes/connect-account.js';
import { MetaAdsAPI } from '../../services/meta/index.js';
import { escapeHtml as esc } from '../../lib/escape.js';
export function handleSettings(deps) {
  return async (ctx) => {
    const accounts = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [];

    const platformRows = Object.entries(PLATFORM_NAMES).map(([key, label]) => {
      const active = accounts.find(a => a.platform === key && a.is_active);
      const status = active
        ? `✅ Terhubung (${esc(active.account_name)})`
        : '— Belum terhubung';
      // Semua platform masuk flow bot (connect:scene), bukan URL web —
      // tombol URL keluar dari Telegram dan halaman web-nya belum tentu ada.
      const button = { text: `${active ? '✅' : '🔗'} ${label}`, callback_data: `connect:${key}` };
      return { label, status, button };
    });

    const body = platformRows.map(r => `• ${r.label}: ${r.status}`).join('\n');

    return ctx.reply(
      '🔧 <b>Pengaturan</b>\n\n' +
      `${body}\n\n` +
      'Pencet platform di bawah buat hubungkan akun baru, atau kelola yang sudah ada:',
      {
        parse_mode: 'HTML',
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
      case 'sync': {
        // Sync beneran (path yang sama dengan monitor:sync): tarik campaign live
        // per koneksi Meta user ini lalu upsert ke DB lokal.
        const rows = (deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [])
          .filter(a => a.platform === 'meta' && (a.credentials?.access_token || a.access_token));
        if (!rows.length) {
          return ctx.reply('🔌 Belum ada koneksi Meta. Hubungkan dulu via /status → ➕ Tambah Akun.');
        }
        await ctx.reply('🔄 Lagi narik data campaign dari Meta…');
        let synced = 0;
        let failed = 0;
        for (const acct of rows) {
          try {
            const token = acct.credentials?.access_token || acct.access_token;
            const api = MetaAdsAPI.withToken(token);
            const live = await api.getAdAccounts();
            for (const a of live) {
              const campaigns = await api.getCampaigns(a.id, { limit: 50 });
              for (const c of campaigns) {
                deps.repos?.campaignsRepo?.upsert?.({
                  platform: 'meta',
                  campaign_id: c.id,
                  name: c.name,
                  status: c.status,
                  budget: c.dailyBudget || 0,
                  userId: ctx.userId,
                });
              }
              synced += campaigns.length;
            }
          } catch {
            failed++;
          }
        }
        return ctx.reply(
          failed
            ? `🔄 Sync selesai: ${synced} campaign ketarik, ${failed} koneksi gagal. Cek /status buat hasilnya.`
            : `✅ Sync selesai: ${synced} campaign ketarik. Cek /status buat hasilnya.`
        );
      }
      case 'accounts': {
        const accounts = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
        if (accounts.length === 0) {
          return ctx.reply('📭 Belum ada akun terhubung. Pencet platform di atas buat hubungkan.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔧 Pengaturan', callback_data: 'menu:settings' }],
                [{ text: '📋 Menu', callback_data: 'quick:menu' }],
              ],
            },
          });
        }
        const list = accounts.map(a => `• ${esc(a.account_name)} (${esc(a.platform)}) ${a.is_active ? '✅' : '⏸'}`).join('\n');
        return ctx.reply(`📊 <b>Akun terhubung:</b>\n\n${list}`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔧 Pengaturan', callback_data: 'menu:settings' }],
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
