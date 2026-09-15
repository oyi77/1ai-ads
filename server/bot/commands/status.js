/**
 * /status command — Dashboard: akun iklan yang terhubung + ringkasan campaign
 * per akun (live dari Meta) + draft menunggu persetujuan.
 *
 * Ditulis untuk advertiser pemula: bahasa Indonesia santai, tiap angka ada
 * label jelas (aktif / nonaktif / dihapus / draft), token mati ditandai eksplisit.
 */
import { MetaAdsAPI } from '../../services/meta/index.js';
import { normalizeCampaignStatus } from '../../lib/campaign-status.js';
import { isTokenExpiryError, flagAccountTokenInvalid } from '../../lib/token-health.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:status');

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export const BM_NOTE =
  '💡 <b>Belum semua akun muncul?</b>\n' +
  'Bot hanya bisa membaca akun iklan yang <b>token-nya terhubung</b> — ' +
  'biasanya semua akun dalam <b>1 Business Manager yang sama</b> dengan token itu.\n' +
  'Kalau ada akun yang belum kebaca, buka <b>Business Manager → Business Settings → Ad Accounts</b>, ' +
  'pastikan akunnya ada di sana, lalu hubungkan token dari BM yang sama via tombol ➕ Tambah Akun.';

function shortName(name, max = 22) {
  const s = String(name || 'Akun Iklan');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function countByStatus(campaigns) {
  let active = 0;
  let deleted = 0;
  let inactive = 0;
  for (const c of campaigns || []) {
    const s = normalizeCampaignStatus(c?.status);
    if (s === 'active') active++;
    else if (s === 'deleted' || s === 'archived') deleted++;
    else inactive++;
  }
  return { active, inactive, deleted, total: (campaigns || []).length };
}

export function handleStatus(deps) {
  return async (ctx) => {
    try {
      const connected = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
      const stored = connected.filter(a => a.is_active);
      const keyboard = [];

      // Satu token bisa menaungi banyak akun iklan — dedup per token.
      const seenTokens = new Set();
      const tokenOwners = [];
      for (const row of stored) {
        const token = row.credentials?.access_token || row.access_token;
        if (!token || seenTokens.has(token)) continue;
        seenTokens.add(token);
        tokenOwners.push(row);
      }

      // Sapu live: tiap token → daftar ad account → campaign per akun.
      const accounts = [];
      const deadOwners = [];
      for (const owner of tokenOwners) {
        const token = owner.credentials?.access_token || owner.access_token;
        let api = null;
        try {
          api = MetaAdsAPI.withToken(token);
        } catch { continue; }
        let live = [];
        try {
          live = await api.getAdAccounts();
        } catch (err) {
          if (isTokenExpiryError(err)) {
            deadOwners.push(owner);
            try { flagAccountTokenInvalid(deps.repos?.platformAccountsRepo, owner.id, err); } catch { /* best-effort */ }
          } else {
            log.warn('dashboard adaccounts failed', { userId: ctx.userId, error: err?.message });
          }
          continue;
        }
        for (const a of live) {
          let campaigns = [];
          try {
            campaigns = await api.getCampaigns(a.id, { limit: 50 });
          } catch (err) {
            log.warn('dashboard campaigns failed', { accountId: a.id, error: err?.message });
          }
          accounts.push({ ...a, campaigns, counts: countByStatus(campaigns), ownerId: owner.id });
        }
      }

      // Draft menunggu persetujuan (best-effort).
      let draftPending = 0;
      try {
        const draftsRepo = deps.repos?.draftsRepo;
        if (draftsRepo?.findByUser) {
          draftPending = draftsRepo.findByUser(ctx.userId, { status: 'pending', limit: 1 })?.total || 0;
        } else if (deps.services?.draftService?.listDrafts) {
          const r = await deps.services.draftService.listDrafts('pending', { userId: ctx.userId, limit: 1 });
          draftPending = r?.total ?? (Array.isArray(r) ? r.length : 0);
        }
      } catch { /* draft count best-effort */ }

      const totals = { active: 0, inactive: 0, deleted: 0, total: 0 };
      for (const a of accounts) {
        totals.active += a.counts.active;
        totals.inactive += a.counts.inactive;
        totals.deleted += a.counts.deleted;
        totals.total += a.counts.total;
      }

      let message = `📊 <b>Dashboard Iklan Kamu</b>\n\n`;
      message += `🔗 Akun iklan terhubung: <b>${accounts.length}</b> (dari ${tokenOwners.length} koneksi token)\n`;
      message += `🎯 Campaign total: <b>${totals.total}</b> (🟢 ${totals.active} aktif • ⏸️ ${totals.inactive} nonaktif • 🗑️ ${totals.deleted} dihapus)\n`;
      message += `📝 Draft menunggu persetujuan: <b>${draftPending}</b>`;
      if (deadOwners.length > 0) {
        message += `\n\n🔑 <b>${deadOwners.length} koneksi token bermasalah</b> (kedaluwarsa/dicabut) — hubungkan ulang biar datanya kebaca lagi.`;
      }

      if (accounts.length > 0) {
        message += `\n\n<b>Rincian per akun iklan:</b>\n`;
        accounts.slice(0, 10).forEach((a, i) => {
          message += `${i + 1}. ${escHtml(a.name || a.id)} — 🟢 ${a.counts.active} aktif • ⏸️ ${a.counts.inactive} nonaktif • 🗑️ ${a.counts.deleted} hapus (total ${a.counts.total})\n`;
        });
        if (accounts.length > 10) message += `…dan ${accounts.length - 10} akun lainnya.\n`;
        message += `\n${BM_NOTE}`;
        // Tombol per koneksi tersimpan (kontrak callback dash:account:<uuid> tidak berubah).
        const perOwner = new Map();
        for (const a of accounts) {
          if (!perOwner.has(a.ownerId)) perOwner.set(a.ownerId, { ownerId: a.ownerId, n: 0 });
          perOwner.get(a.ownerId).n++;
        }
        for (const { ownerId, n } of [...perOwner.values()].slice(0, 6)) {
          const owner = tokenOwners.find(o => o.id === ownerId);
          keyboard.push([{
            text: `📊 ${shortName(owner?.account_name || owner?.platform)} (${n} akun)`,
            callback_data: `dash:account:${ownerId}`,
          }]);
        }
        keyboard.push([
          { text: '➕ Tambah Akun', callback_data: 'dash:add' },
          { text: '➖ Hapus Akun', callback_data: 'dash:remove' },
        ]);
      } else if (stored.length > 0) {
        message += `\n\n📭 Token kamu terhubung, tapi <b>belum ada akun iklan yang kebaca</b> dari token itu.`;
        message += `\n\n${BM_NOTE}`;
        keyboard.push([{ text: '➕ Tambah Akun', callback_data: 'dash:add' }]);
      } else {
        message += '\n\n📭 <b>Belum ada akun iklan yang terhubung.</b>\nHubungkan akun iklanmu dulu biar dashboard-nya keisi.';
        message += `\n\n${BM_NOTE}`;
        keyboard.push([{ text: '🔗 Hubungkan Akun', callback_data: 'menu:connect' }]);
      }

      keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      log.error('dashboard failed', { userId: ctx.userId, error: err?.message });
      await ctx.reply('⚠️ Dashboard gagal dimuat. Coba lagi sebentar ya.');
    }
  };
}

export function handleDashboardCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action.startsWith('account:')) {
      const accountId = action.split(':')[1];
      return showAccountReport(ctx, deps, accountId);
    }

    if (action === 'add') {
      return ctx.reply(
        '🔗 <b>Tambah Akun Iklan</b>\n\nPilih platform, lalu tempel token-nya.\n\n' + BM_NOTE,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📘 Meta (FB/IG)', callback_data: 'connect:meta' }],
              [{ text: '🔗 Google Ads', callback_data: 'connect:google' }],
              [{ text: '🎵 TikTok', callback_data: 'connect:tiktok' }],
              [{ text: '💼 LinkedIn', callback_data: 'connect:linkedin' }],
              [{ text: '⬅️ Kembali', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    }

    if (action === 'remove') {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const connected = platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
      const activeAccounts = connected.filter(a => a.is_active);

      if (activeAccounts.length === 0) {
        return ctx.reply('📭 Tidak ada akun untuk dihapus.');
      }

      const keyboard = activeAccounts.map(a => [{
        text: `❌ ${a.account_name || a.platform}`,
        callback_data: `dash:remove:${a.id}`,
      }]);
      keyboard.push([{ text: '⬅️ Kembali', callback_data: 'quick:menu' }]);

      return ctx.reply(
        '➖ <b>Hapus Akun</b>\n\nPilih koneksi yang mau dihapus:',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
      );
    }

    if (action.startsWith('remove:')) {
      const removeId = action.split(':')[1];
      try {
        const row = deps.repos.platformAccountsRepo.findById(removeId);
        if (!row || row.user_id !== ctx.userId) {
          return ctx.reply('⚠️ Akun tidak ditemukan.');
        }
        deps.repos.platformAccountsRepo.update(removeId, { is_active: 0 });
        return ctx.reply('✅ Koneksi dihapus.', {
          reply_markup: { inline_keyboard: [[{ text: '📊 Dashboard', callback_data: 'menu:status' }]] },
        });
      } catch (err) {
        return ctx.reply(`❌ Gagal: ${err.message}`);
      }
    }

    return ctx.reply('Unknown action.');
  };
}

async function showAccountReport(ctx, deps, accountId) {
  try {
    const platformAccountsRepo = deps.repos?.platformAccountsRepo;

    const account = platformAccountsRepo?.findById?.(accountId);
    if (!account) return ctx.reply('⚠️ Akun tidak ditemukan.');

    // Get account insights via Meta API using the REAL ad account id (not internal UUID)
    let insights = null;
    const token = account.credentials?.access_token || account.access_token;
    let realAccountId = account.credentials?.ad_account_id;
    let tokenOk = false;
    if (token) {
      try {
        const api = MetaAdsAPI.withToken(token);
        if (!realAccountId) {
          const adAccounts = await api.getAdAccounts();
          if (adAccounts.length > 0) realAccountId = adAccounts[0].id;
        }
        if (realAccountId) {
          tokenOk = true;
          insights = await api.getAccountInsights(realAccountId, { datePreset: 'last_30d' });
        }
      } catch {
        // Token expired or API error → tokenOk stays false
      }
    }

    let message = `📊 <b>Laporan: ${escHtml(account.account_name || account.platform)}</b>\n\n`;

    if (insights) {
      const roas = insights.spend > 0 ? (insights.revenue / insights.spend).toFixed(2) : '0.00';
      message += `<b>Performa 30 hari</b>\n`;
      message += `💰 Spend: ${fmtRp(insights.spend)}\n`;
      message += `💵 Revenue: ${fmtRp(insights.revenue)}\n`;
      message += `📈 ROAS: ${roas}x\n`;
      message += `👆 Klik: ${(insights.clicks || 0).toLocaleString('id-ID')}\n`;
      message += `👁 Impresi: ${(insights.impressions || 0).toLocaleString('id-ID')}`;
    } else if (!tokenOk) {
      message += `\n🔑 Token koneksi ini bermasalah. Hubungkan ulang via ➕ Tambah Akun biar laporannya kebaca lagi.`;
    } else {
      message += `\n📭 Belum ada aktivitas iklan 30 hari terakhir.`;
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📈 Laporan Lengkap', callback_data: `ads:report:${account.platform}:${realAccountId || accountId}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    });
  } catch (err) {
    return ctx.reply(`⚠️ Gagal memuat laporan: ${err.message}`);
  }
}

export default { handleStatus, handleDashboardCallback };
