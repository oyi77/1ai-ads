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

// Periode laporan: key → date_preset Meta + label user-friendly.
export const REPORT_PERIODS = {
  '7d': { preset: 'last_7d', label: '7 hari' },
  '30d': { preset: 'last_30d', label: '30 hari' },
  '90d': { preset: 'last_90d', label: '90 hari' },
};

/**
 * Sapu live ad accounts untuk SATU koneksi tersimpan (owner row).
 * Return { api, live } — live = [{ id, name, ... }] nama asli dari Meta,
 * bukan nama koneksi saat submit token.
 */
export async function liveAccountsForOwner(owner) {
  const token = owner?.credentials?.access_token || owner?.access_token;
  if (!token) return { api: null, live: [] };
  let api = null;
  try {
    api = MetaAdsAPI.withToken(token);
  } catch { return { api: null, live: [] }; }
  try {
    const live = await api.getAdAccounts();
    return { api, live: live || [] };
  } catch {
    return { api, live: [] };
  }
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

    if (action.startsWith('pick:')) {
      const [, ownerId, idxStr] = action.split(':');
      return showPeriodPicker(ctx, ownerId, parseInt(idxStr, 10));
    }

    if (action.startsWith('rep:')) {
      const [, ownerId, idxStr, periodKey] = action.split(':');
      return showAccountReport(ctx, deps, ownerId, parseInt(idxStr, 10), periodKey);
    }

    if (action.startsWith('account:')) {
      const ownerId = action.split(':')[1];
      return showAccountPicker(ctx, deps, ownerId);
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

/**
 * Alur laporan: dash:account:<ownerUuid> → daftar LIVE ad accounts milik
 * token itu (nama asli dari Meta) → user pilih → pilih periode (7/30/90d)
 * → laporan kinerja. Bukan langsung tembak 1 insights yang sering kosong.
 */
async function showAccountPicker(ctx, deps, ownerId) {
  const owner = deps.repos?.platformAccountsRepo?.findById?.(ownerId);
  if (!owner || owner.user_id !== ctx.userId) return ctx.reply('⚠️ Koneksi tidak ditemukan.');
  const { live } = await liveAccountsForOwner(owner);
  if (!live.length) {
    return ctx.reply(
      `📭 <b>${escHtml(owner.account_name || 'Koneksi')}</b> belum kebaca akun iklannya.\n\n` + BM_NOTE,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '📊 Dashboard', callback_data: 'menu:status' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      }
    );
  }
  const keyboard = live.slice(0, 8).map(a => [{
    // Callback ringkas: dash:pick:<ownerUuid>:<idx> — id Meta numeric 16-18 digit
    // + uuid 36 + prefix bisa jebol cap 64B, jadi referensi via index.
    text: `📊 ${shortName(a.name || a.id)}`,
    callback_data: `dash:pick:${ownerId}:${live.indexOf(a)}`,
  }]);
  keyboard.push([{ text: '📊 Dashboard', callback_data: 'menu:status' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return ctx.reply(
    `📊 <b>${escHtml(owner.account_name || 'Koneksi')}</b> — ada <b>${live.length}</b> akun iklan.\n\nPilih akun yang mau dilihat laporannya:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showPeriodPicker(ctx, ownerId, idx) {
  return ctx.reply(
    '🗓 <b>Mau lihat kinerja berapa hari terakhir?</b>',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          Object.entries(REPORT_PERIODS).map(([key, p]) => ({
            text: `🗓 ${p.label}`,
            callback_data: `dash:rep:${ownerId}:${idx}:${key}`,
          })),
          [{ text: '⬅️ Pilih akun lain', callback_data: `dash:account:${ownerId}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    }
  );
}

async function showAccountReport(ctx, deps, ownerId, idx = null, periodKey = '30d') {
  try {
    const platformAccountsRepo = deps.repos?.platformAccountsRepo;
    const owner = platformAccountsRepo?.findById?.(ownerId);
    if (!owner || owner.user_id !== ctx.userId) return ctx.reply('⚠️ Koneksi tidak ditemukan.');

    const { api, live } = await liveAccountsForOwner(owner);
    if (!api) return ctx.reply('🔑 Token koneksi ini bermasalah. Hubungkan ulang via ➕ Tambah Akun.');
    if (!live.length) {
      return ctx.reply(
        `📭 <b>${escHtml(owner.account_name || 'Koneksi')}</b> belum kebaca akun iklannya.\n\n` + BM_NOTE,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '📊 Dashboard', callback_data: 'menu:status' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
        }
      );
    }

    // Belum pilih akun spesifik → tampilkan picker.
    if (idx === null || idx === undefined || live[idx] === undefined) {
      return showAccountPicker(ctx, deps, ownerId);
    }

    const acct = live[idx];
    const period = REPORT_PERIODS[periodKey] || REPORT_PERIODS['30d'];
    const periodParam = { datePreset: period.preset };

    await ctx.reply(`🔄 Lagi nyusun laporan <b>${escHtml(acct.name || acct.id)}</b> (${period.label})…`, { parse_mode: 'HTML' });

    let insights = null;
    let tokenOk = true;
    try {
      insights = await api.getAccountInsights(acct.id, periodParam);
    } catch (err) {
      if (isTokenExpiryError(err)) {
        tokenOk = false;
        try { flagAccountTokenInvalid(platformAccountsRepo, ownerId, err); } catch { /* best-effort */ }
      } else {
        log.warn('report insights failed', { accountId: acct.id, error: err?.message });
      }
    }

    // Campaign aktif akun ini (biar laporan ada isinya walau insights kosong).
    let campaigns = [];
    try {
      campaigns = await api.getCampaigns(acct.id, { limit: 50 });
    } catch (err) {
      log.warn('report campaigns failed', { accountId: acct.id, error: err?.message });
    }
    const counts = countByStatus(campaigns);
    const topActive = (campaigns || []).filter(c => normalizeCampaignStatus(c?.status) === 'active').slice(0, 5);

    let message = `📊 <b>Laporan: ${escHtml(acct.name || acct.id)}</b> (${period.label})\n\n`;
    if (!tokenOk) {
      message += `🔑 Token koneksi ini bermasalah. Hubungkan ulang via ➕ Tambah Akun biar laporannya kebaca lagi.`;
    } else if (insights && (insights.spend > 0 || insights.impressions > 0)) {
      const roas = insights.spend > 0 ? (insights.revenue / insights.spend).toFixed(2) : '0.00';
      message += `💰 Spend: ${fmtRp(insights.spend)}\n`;
      message += `💵 Revenue: ${fmtRp(insights.revenue)}\n`;
      message += `📈 ROAS: ${roas}x\n`;
      message += `👆 Klik: ${(insights.clicks || 0).toLocaleString('id-ID')}\n`;
      message += `👁 Impresi: ${(insights.impressions || 0).toLocaleString('id-ID')}\n`;
      message += `🎯 Campaign: 🟢 ${counts.active} aktif • ⏸️ ${counts.inactive} nonaktif (total ${counts.total})`;
    } else {
      // Jujur + spesifik: sebut akun + periode + campaign aktifnya, bukan "no insight" generik.
      message += `📭 <b>Belum ada belanja/klik/impresi</b> di <b>${escHtml(acct.name || acct.id)}</b> selama ${period.label}.\n`;
      message += `🎯 Campaign di akun ini: 🟢 ${counts.active} aktif • ⏸️ ${counts.inactive} nonaktif (total ${counts.total}).\n`;
      if (counts.active > 0) {
        message += `Coba periode lebih panjang (90 hari), atau cek campaign-nya langsung:`;
      } else {
        message += `Akun ini belum ada campaign yang jalan — bikin dulu via 🎯 Buat Campaign.`;
      }
    }
    if (topActive.length > 0) {
      message += `\n\n<b>Campaign aktif:</b>\n`;
      topActive.forEach((c, i) => { message += `${i + 1}. ${escHtml(c.name || c.id)}\n`; });
    }

    const periodRow = Object.entries(REPORT_PERIODS)
      .filter(([key]) => key !== periodKey)
      .map(([key, p]) => ({ text: `🗓 ${p.label}`, callback_data: `dash:rep:${ownerId}:${idx}:${key}` }));
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...(periodRow.length ? [periodRow] : []),
          [{ text: '⬅️ Pilih akun lain', callback_data: `dash:account:${ownerId}` }],
          [{ text: '📊 Dashboard', callback_data: 'menu:status' }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    });
  } catch (err) {
    return ctx.reply(`⚠️ Gagal memuat laporan: ${err.message}`);
  }
}

export default { handleStatus, handleDashboardCallback };
