import { filterActiveCampaigns } from '../../lib/campaign-status.js';
import { createLogger } from '../../lib/logger.js';
import { MetaAdsAPI } from '../../services/meta/index.js';

const log = createLogger('bot:ads');

// Lantai budget harian Meta untuk IDR ≈ Rp 17.715 (sama kayak wizard create-campaign).
export const MIN_DAILY_BUDGET_IDR = 17500;

export function getUserPlatformAccount(ctx, deps, platform = 'meta') {
  const repo = deps?.repos?.platformAccountsRepo;
  if (!repo) return [];
  const accounts = repo.findAllActiveByUserAndPlatform(ctx.userId, platform);
  if (!accounts?.length) return [];
  return accounts.filter(a => a.access_token);
}

export function getUserMetaAccount(ctx, deps) {
  return getUserPlatformAccount(ctx, deps, 'meta');
}

export async function makeApi(ctx, deps, platform = 'meta') {
  const accounts = getUserPlatformAccount(ctx, deps, platform);
  if (!accounts.length) return { api: null, acct: null, all: [] };
  const all = [];
  for (const acct of accounts) {
    let api = null;
    if (platform === 'meta') {
      api = MetaAdsAPI.withToken(acct.access_token);
    } else {
      try {
        const { getPlatform } = await import('../../platforms/index.js');
        api = await getPlatform(platform, deps.repos?.settingsRepo);
        api.setActiveAccount(null, acct.access_token, true);
      } catch {
        api = null;
      }
    }
    all.push({ api, acct });
  }
  const first = all[0];
  return { api: first.api, acct: first.acct, all };
}

export function isExpiredToken(err) {
  // safeFetch throws { status, data: <parsed JSON body>, message } — Meta 4xx
  // bodies carry { error: { code, message } } under err.data.
  const code = err?.code || err?.error?.code || err?.data?.error?.code;
  const msg = `${err?.message || ''} ${err?.error?.message || ''} ${err?.data?.error?.message || ''}`.toLowerCase();
  return (
    code === 190 || code === 110 || code === 463 ||
    msg.includes('session has expired') ||
    msg.includes('user token is expired') ||
    msg.includes('invalid oauth') ||
    msg.includes('cannot parse access token')
  );
}

function fmtCurrency(n) {
  const v = parseFloat(n || 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

function money(n) {
  const v = parseFloat(n || 0);
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── /ads entry ──────────────────────────────────────────────
// Multi-platform Ads Manager: always show ALL platforms with connection
// status (connected accounts per platform + connect/manage actions).
// Clicking a connected platform drills into its ad accounts.
export function handleAds(deps) {
  return async (ctx) => {
    const platformAccountsRepo = deps.repos?.platformAccountsRepo;
    const connected = platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
    const active = connected.filter(a => a.is_active);

    const { data: campaigns = [] } = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [] };
    const activeCampaigns = filterActiveCampaigns(campaigns).length;

    // Platform labels (same registry as Platforms page)
    const PLATFORM_LABELS = {
      meta: 'Meta (FB/IG)', google: 'Google Ads', tiktok: 'TikTok Ads', linkedin: 'LinkedIn Ads',
      twitter: 'Twitter/X', snapchat: 'Snapchat', pinterest: 'Pinterest', microsoft: 'Microsoft/Bing',
      reddit: 'Reddit', yandex: 'Yandex', amazon: 'Amazon Ads', apple: 'Apple Search',
      taboola: 'Taboola', criteo: 'Criteo', thetradedesk: 'The Trade Desk', spotify: 'Spotify',
      kakao: 'Kakao', line: 'LINE', whatsapp: 'WhatsApp', baidu: 'Baidu',
    };
    const ALL_PLATFORMS = Object.keys(PLATFORM_LABELS);

    // Group active accounts by platform
    const byPlatform = {};
    for (const a of active) {
      if (!byPlatform[a.platform]) byPlatform[a.platform] = [];
      byPlatform[a.platform].push(a);
    }

    const rows = [];
    for (const key of ALL_PLATFORMS) {
      const accts = byPlatform[key] || [];
      if (accts.length > 0) {
        const names = accts.slice(0, 2).map(a => a.account_name || key).join(', ');
        rows.push([{
          text: `✅ ${PLATFORM_LABELS[key]} — ${names}`,
          callback_data: `ads:platform:${key}`,
        }]);
      } else {
        rows.push([{
          text: `🔗 ${PLATFORM_LABELS[key]}`,
          callback_data: `connect:${key}`,
        }]);
      }
    }
    rows.push([{ text: '⬅️ Menu', callback_data: 'quick:menu' }]);

    const connectedCount = active.length;
    const summary =
      `📣 <b>Ads Manager</b>\n\n` +
      `Multiple ad platforms — ${connectedCount} connected\n` +
      `Campaigns: ${activeCampaigns} active / ${campaigns.length} total\n\n` +
      `Tap ✅ to manage a connected platform, 🔗 to connect one:`;

    return ctx.reply(summary, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows },
    });
  };
}

async function showPlatformAccounts(ctx, deps, platform) {
  const { api } = await makeApi(ctx, deps, platform);
  if (!api) {
    return ctx.reply(
      `🔌 <b>Belum ada koneksi ${platform.toUpperCase()}.</b>\n\nHubungkan dulu biar bisa kelola akun iklanmu:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Buka Dashboard', callback_data: 'menu:status' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  }

  await ctx.reply(`🔄 Lagi ngambil daftar akun iklan ${platform.toUpperCase()}-mu…`);
  try {
    const accounts = await api.getAdAccounts();
    if (!accounts.length) {
      return ctx.reply(
        `📭 <b>Token terhubung tapi nggak ada akun iklan yang kebaca.</b>\n\nTambahkan akun iklan di ${platform.toUpperCase()} dulu, atau cek Business Manager-mu, lalu coba lagi.`,
        { reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
      );
    }
    await replyAccountList(ctx, accounts, 1, platform);
  } catch (err) {
    log.error('ads list failed', { userId: ctx.userId, platform, error: err?.message });
    if (isExpiredToken(err)) {
      return ctx.reply('🔑 Token Meta-mu kedaluwarsa. Hubungkan ulang via /status → ➕ Tambah Akun.');
    }
    return ctx.reply('⚠️ Gagal memuat akun iklan. Mungkin token kurang izin atau jaringan lagi bermasalah. Coba lagi nanti.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
}

// ── Platform account list (used by ads:platform: callbacks) ──
export function handleAdsPlatform(deps) {
  return async (ctx, platform) => {
    await showPlatformAccounts(ctx, deps, platform);
  };
}

// ── Pagination helpers ──────────────────────────────────────
const ACCOUNTS_PER_PAGE = 6;
const CAMPAIGNS_PER_PAGE = 8;

function pageSlice(items, page, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(Math.max(1, page), pages);
  return { slice: items.slice((p - 1) * perPage, p * perPage), pages, p };
}

function pagerRow(prefix, p, pages) {
  if (pages <= 1) return [];
  return [
    { text: '◀️ Prev', callback_data: `${prefix}:${Math.max(1, p - 1)}` },
    { text: `Halaman ${p}/${pages}`, callback_data: 'ads:nop' },
    { text: 'Next ▶️', callback_data: `${prefix}:${Math.min(pages, p + 1)}` },
  ];
}

async function replyAccountList(ctx, accounts, page, platform = 'meta') {
  const { slice, pages, p } = pageSlice(accounts, page, ACCOUNTS_PER_PAGE);
  const start = (p - 1) * ACCOUNTS_PER_PAGE;
  const lines = slice
    .map((a, i) => `${start + i + 1}. ${escHtml(a.name)} (${a.id}) — ${a.status === 'active' ? '✅ aktif' : '⏸ nonaktif'}`)
    .join('\n');
  return ctx.reply(
    `📣 <b>Akun Iklan ${platform.toUpperCase()}</b> (${accounts.length})\n\n${lines}\n\nPencet akun buat ngaturnya:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((a) => [{ text: `⚙️ ${a.name}`, callback_data: `ads:select:${platform}:${a.id}` }]),
          pagerRow(`ads:accts:${platform}`, p, pages),
          [{ text: '📈 Laporan Semua Akun', callback_data: `ads:report:${platform}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    }
  );
}

export function handleAdsAccountsPage(deps) {
  return async (ctx, pageStr, platform = 'meta') => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${platform.toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);
    try {
      const accounts = await api.getAdAccounts();
      await replyAccountList(ctx, accounts, parseInt(pageStr, 10) || 1, platform);
    } catch (err) {
      log.error('ads accounts pager failed', { userId: ctx.userId, platform, error: err?.message });
      return ctx.reply('⚠️ Gagal memuat akun iklan. Coba lagi nanti.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
  };
}

// ── Account detail: list campaigns ──────────────────────────
export function handleAdsSelect(deps) {
  return async (ctx, platform, accountId) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${platform.toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);
    await ctx.reply(`🔄 Lagi ngambil campaign buat akun ini…`);
    try {
      const campaigns = await api.getCampaigns(accountId);
      if (!campaigns.length) {
        return ctx.reply(`📭 <b>Belum ada campaign di akun ini.</b>\n\nBikin dulu yuk:`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🎯 Buat Campaign', callback_data: 'menu:create' }], [{ text: '◀️ Kembali ke akun', callback_data: `ads:platform:${platform}` }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
        });
      }
      await replyCampaignList(ctx, accountId, campaigns, 1, platform);
    } catch (err) {
      log.error('ads select failed', { userId: ctx.userId, platform, accountId, error: err?.message });
      return ctx.reply('⚠️ Gagal memuat campaign akun ini. Coba lagi nanti.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
  };
}
async function replyCampaignList(ctx, accountId, campaigns, page, platform = 'meta') {
  const { slice, pages, p } = pageSlice(campaigns, page, CAMPAIGNS_PER_PAGE);
  const lines = slice.map((c) => `• ${escHtml(c.name)} — ${c.status === 'active' ? '✅ NYALA' : '⏸ MATI'}`).join('\n');
  return ctx.reply(
    `⚙️ <b>Campaign (${campaigns.length}) — ${accountId}</b>\n\n${lines}\n\nPencet buat nyalain/matiin:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((c) => [{
            text: (c.status === 'active' ? '⏸ Matiin ' : '▶️ Nyalain ') + c.name,
            // Dua langkah biar kepencet nggak langsung eksekusi: ask → toggle.
            // accountId tetap di luar (cap 64B) — ask resolve nama via repo lokal.
            callback_data: `ads:ask:${platform}:${c.id}:${c.status === 'active' ? 'pause' : 'resume'}`,
          }]),
          pagerRow(`ads:camps:${platform}:${accountId}`, p, pages),
          [{ text: '➕20%', callback_data: `ads:abud:${platform}:${accountId}:1.2` }, { text: '➖20%', callback_data: `ads:abud:${platform}:${accountId}:0.8` }, { text: '🎯 Buat', callback_data: 'menu:create' }],
          [{ text: '◀️ Kembali ke akun', callback_data: `ads:platform:${platform}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    }
  );
}

export function handleAdsCampaignsPage(deps) {
  return async (ctx, platform, accountId, pageStr) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${platform.toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);
    try {
      const campaigns = await api.getCampaigns(accountId);
      await replyCampaignList(ctx, accountId, campaigns, parseInt(pageStr, 10) || 1, platform);
    } catch (err) {
      log.error('campaigns pager failed', { userId: ctx.userId, platform, accountId, error: err?.message });
      return ctx.reply('⚠️ Gagal memuat campaign. Coba lagi nanti.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
  };
}
// ── Pause / Resume ──────────────────────────────────────────
export function handleAdsToggle(deps) {
  return async (ctx, platform, campaignId, mode) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${platform.toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);
    await ctx.reply(`🔄 Lagi ${mode === 'pause' ? 'matiin' : 'nyalain'} campaign…`);
    try {
      await api.updateCampaign(campaignId, { status: mode === 'pause' ? 'PAUSED' : 'ACTIVE' });
      return ctx.reply(`✅ Campaign <b>${mode === 'pause' ? 'dimatiin' : 'dinyalain'}</b>.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⚙️ Kembali ke campaign', callback_data: `ads:platform:${platform}` }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    } catch (err) {
      log.error('ads toggle failed', { userId: ctx.userId, platform, campaignId, mode, error: err?.message });
      if (isExpiredToken(err)) return ctx.reply('🔑 Token Meta-mu kedaluwarsa. Hubungkan ulang via /status → ➕ Tambah Akun.');
      return ctx.reply('⚠️ Gagal update campaign. Coba lagi nanti.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
  };
}

// ── Konfirmasi sebelum mutasi ─────────────────────────────────
// Kepencet tombol Matiin/Nyalain/±20% TIDAK langsung eksekusi ke Meta.
// ask-* tampilkan nama + dampak, eksekusi cuma lewat tombol "Ya".
export function handleAdsAsk(deps) {
  return async (ctx, platform, campaignId, mode) => {
    const local = deps.repos?.campaignsRepo?.findByCampaignId?.(campaignId);
    const name = local?.name || campaignId;
    const verb = mode === 'pause' ? 'matiin' : 'nyalain';
    return ctx.reply(
      `⚠️ <b>Yakin mau ${verb} "${escHtml(name)}"?</b>\n\n` +
      (mode === 'pause'
        ? 'Campaign berhenti tayang dan nggak makan budget lagi.'
        : 'Campaign mulai tayang lagi dan makan budget lagi.') +
      `\n\nPencet Ya buat lanjut:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Ya, ${verb}`, callback_data: `ads:toggle:${platform}:${campaignId}:${mode}` },
              { text: '❌ Batal', callback_data: `ads:platform:${platform}` },
            ],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}

export function handleAdsAskBud(deps) {
  return async (ctx, platform, accountId, multStr) => {
    const { api } = await makeApi(ctx, deps, platform || 'meta');
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${(platform || 'meta').toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);
    const mult = parseFloat(multStr);
    if (!Number.isFinite(mult) || mult <= 0.2 || mult >= 5) return ctx.reply('⚠️ Angka nggak valid.');
    const pct = Math.round((mult - 1) * 100);
    let acctName = accountId;
    let activeCount = null;
    try {
      const owned = (await api.getAdAccounts()).find(a => String(a.id) === String(accountId));
      if (owned?.name) acctName = owned.name;
      const campaigns = await api.getCampaigns(accountId, { limit: 50 });
      activeCount = campaigns.filter(c => c.status === 'active').length;
    } catch {
      // nama/jumlah best-effort — konfirmasi tetap jalan
    }
    return ctx.reply(
      `⚠️ <b>Ubah budget ${activeCount === null ? 'campaign aktif' : `${activeCount} campaign aktif`} di "${escHtml(acctName)}" ${pct > 0 ? '+' : ''}${pct}%?</b>\n\n` +
      `Contoh: budget Rp 50.000/hari ${pct > 0 ? 'jadi' : 'turun ke'} <b>${fmtCurrency(Math.round(50000 * mult))}/hari</b>.\n` +
      `Nggak bisa undo otomatis — tapi bisa balikin manual dengan pencet kebalikannya.\n\nPencet Ya buat lanjut:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Ya, ubah ${pct > 0 ? '+' : ''}${pct}%`, callback_data: `ads:bud:${platform}:${accountId}:${multStr}` },
              { text: '❌ Batal', callback_data: `ads:platform:${platform}` },
            ],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
export function handleAdsReport(deps) {
  return async (ctx, platformOrAccountId, accountIdOrUndefined) => {
    const platform = accountIdOrUndefined ? platformOrAccountId : 'meta';
    // When no accountId, platform is the platform name, NOT an accountId
    const accountId = accountIdOrUndefined || null;

    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Belum ada koneksi ${platform.toUpperCase()}. Hubungkan dulu via /status → ➕ Tambah Akun.`);

    if (accountId) {
      // Alur baru lewat dashboard (pilih akun + periode). Jalur lama ini
      // dipertahankan biar tombol lama tidak mati — arahkan ke picker.
      const rows = (deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [])
        .filter(a => a.platform === (platform || 'meta') && a.is_active);
      if (!rows.length) return ctx.reply('🔌 Belum ada koneksi. Hubungkan dulu via /status → ➕ Tambah Akun.');
      return ctx.reply(
        '📊 <b>Laporan pindah ke Dashboard biar bisa pilih akun + periode (7/30/90 hari).</b>\n\nPencet tombol di bawah, pilih koneksimu, lalu pilih akun + periodenya:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Buka Dashboard', callback_data: 'menu:status' }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    }

    await ctx.reply('📈 Lagi ngumpulin data laporanmu…');
    try {
      const accounts = await api.getAdAccounts();
      if (!accounts.length) {
        return ctx.reply('📭 Nggak ada akun iklan yang kebaca dari token ini.', {
          reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
        });
      }
      let totalSpend = 0, totalRev = 0, totalClicks = 0, totalImpr = 0;
      const perAcct = [];
      for (const acct of accounts) {
        try {
          const ins = await api.getAccountInsights(acct.id, { datePreset: 'last_30d' });
          if (!ins) continue;
          totalSpend += ins.spend || 0;
          totalRev += ins.revenue || 0;
          totalClicks += ins.clicks || 0;
          totalImpr += ins.impressions || 0;
          perAcct.push(`• ${escHtml(acct.name)}: ${fmtCurrency(ins.spend)} spend · ${money(ins.revenue)} omzet · ${ins.clicks || 0} klik`);
        } catch (err) {
          log.warn('ads report acct failed', { accountId: acct.id, error: err?.message });
        }
      }
      const roas = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : '0.00';
      const body =
        `📊 <b>Laporan ${platform.toUpperCase()} (30 hari)</b>\n\n` +
        `Total Belanja: ${fmtCurrency(totalSpend)}\n` +
        `Total Omzet: ${fmtCurrency(totalRev)}\n` +
        `ROAS: ${roas}x\n` +
        `Klik: ${totalClicks.toLocaleString('id-ID')}\n` +
        `Impresi: ${totalImpr.toLocaleString('id-ID')}\n\n` +
        (perAcct.length ? `<b>Per akun:</b>\n${perAcct.join('\n')}` : '') +
        `\n\n<i>Mau per akun + pilih periode (7/30/90 hari)? Lewat 📊 Dashboard aja.</i>`;
      return ctx.reply(body, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `ads:report:${platform}` }], [{ text: '📊 Dashboard', callback_data: 'menu:status' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } });
    } catch (err) {
      log.error('ads report list failed', { userId: ctx.userId, platform, error: err?.message });
      if (isExpiredToken(err)) return ctx.reply('🔑 Token kamu kedaluwarsa. Hubungkan ulang via /status → ➕ Tambah Akun.');
      return ctx.reply('⚠️ Gagal memuat laporan. Coba lagi nanti.', { reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] } });
    }
  };
}

// ── Quick budget scale: ±% applied to ACTIVE campaigns of one account ──
export function handleAdsBudgetScale(deps) {
  return async (ctx, platform, accountId, _pctStr, multStr) => {
    await ctx.answerCbQuery();
    const { api } = await makeApi(ctx, deps, platform || 'meta');
    if (!api) return ctx.reply('🔌 Hubungkan akun Meta dulu via /start.');
    const mult = parseFloat(multStr);
    if (!Number.isFinite(mult) || mult <= 0.2 || mult >= 5) {
      return ctx.reply('⚠️ Angka nggak valid. Coba lagi ya.');
    }
    await ctx.reply(`🔄 Lagi menyesuaikan budget untuk campaign AKTIF di akun ini…`);
    try {
      let acctName = accountId;
      try {
        const owned = (await api.getAdAccounts()).find(a => String(a.id) === String(accountId));
        if (owned?.name) acctName = owned.name;
      } catch { /* nama best-effort */ }
      const campaigns = await api.getCampaigns(accountId, { limit: 50 });
      const active = campaigns.filter(c => c.status === 'active');
      let done = 0;
      for (const c of active) {
        try {
          const current = c.dailyBudget || 0; // already major IDR (getCampaigns converts)
          if (current <= 0) continue;
          // Lantai minimal Facebook ≈ Rp 17.715 — jangan turunkan budget ke bawah itu.
          const next = Math.max(MIN_DAILY_BUDGET_IDR, Math.round(current * mult));
          await api.updateCampaign(c.id, { dailyBudget: next });
          done++;
        } catch (e) {
          log.warn('budget scale failed per campaign', { campaignId: c.id, error: e.message });
        }
      }
      const pct = Math.round((mult - 1) * 100);
      return ctx.reply(
        `✅ <b>Budget ${done} campaign aktif di ${escHtml(acctName)} disesuaikan (${pct > 0 ? '+' : ''}${pct}%).</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚙️ Lihat Campaign', callback_data: `ads:select:${platform || 'meta'}:${accountId}` }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    } catch (err) {
      log.error('budget scale failed', { userId: ctx.userId, accountId, error: err.message });
      return ctx.reply('⚠️ Gagal menyesuaikan budget. Coba lagi nanti.', {
        reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
  };
}

export function handleAdsDisconnect(deps) {
  const manage = handleAdsManage(deps);
  return async (ctx) => manage(ctx);
}

// ── Manage Connections: list the caller's own stored Meta connections ───
export function handleAdsManage(deps) {
  return async (ctx) => {
    const repo = deps?.repos?.platformAccountsRepo;
    if (!repo) return ctx.reply('⚠️ Storage unavailable.');
    const rows = (repo.findByUserId(ctx.userId) || [])
      .filter((r) => r.platform === 'meta')
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return b.is_active ? -1 : 1;
        return (a.created_at || '') < (b.created_at || '') ? 1 : -1;
      });
    if (!rows.length) {
      return ctx.reply('🔌 You have no Meta connections stored. Connect one via /settings → Connect Meta Account.');
    }
    const lines = rows.map((r, i) => `${i + 1}. ${r.is_active ? '✅' : '⛔️'} <b>${escHtml(r.account_name)}</b>`).join('\n');
    await ctx.reply(
      `⚙️ <b>Manage Meta Connections</b>\n\n${lines}\n\nTap a connection to disconnect it.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            ...rows.map((r) => [
              {
                text: `${r.is_active ? '🔌 Disconnect' : '🟢 Inactive'}: ${r.account_name}`,
                callback_data: `ads:disconnect:${r.id}`,
              },
            ]),
            [{ text: '⬅️ Back', callback_data: 'ads' }],
          ],
        },
      }
    );
  };
}

// ── Disconnect a specific connection by platform_accounts.id ──
export function handleAdsDisconnectConfirm(deps, id) {
  return async (ctx) => {
    const repo = deps?.repos?.platformAccountsRepo;
    if (!id || !repo) return ctx.reply('⚠️ Invalid request.');
    const row = repo.findById(id);
    if (!row || row.user_id !== ctx.userId) {
      return ctx.reply('⚠️ Connection not found.');
    }
    repo.update(id, { is_active: 0 });
    const remaining = (repo.findByUserId(ctx.userId) || []).filter(
      (r) => r.platform === 'meta' && r.is_active
    );
    if (!remaining.length) {
      return ctx.reply(`🗑 Disconnected <b>${escHtml(row.account_name)}</b>. You now have no active Meta connection.`);
    }
    const names = remaining.map((r) => `• ${r.account_name}`).join('\n');
    await ctx.reply(
      `🗑 Disconnected <b>${escHtml(row.account_name)}</b>.\n\nRemaining active Meta connections:\n${names}`,
      { parse_mode: 'HTML' }
    );
  };
}

function fmtRoas(v) { return v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}x`; }
function fmtCpr(v) { return v === null || v === undefined ? '—' : fmtCurrency(v); }

export function handleAdsAccountReport(deps) {
  return async (ctx, accountId, platform = 'meta') => {
    const { api } = await makeApi(ctx, deps, platform || 'meta');
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    const reportService = deps?.services?.accountReportService;
    if (!reportService) return ctx.reply('⚠️ Report service belum tersedia.');
    await ctx.reply('🔄 Menyusun laporan + analisis AI…');
    try {
      let displayName = accountId;
      try {
        const owned = (await api.getAdAccounts()).find(a => String(a.id).replace(/^act_/, '') === String(accountId).replace(/^act_/, ''));
        if (owned?.name) displayName = owned.name;
      } catch { /* name lookup is best-effort */ }
      const report = await reportService.buildReport(api, accountId, displayName);
      const s = report.summary;
      const y = report.comparison.yesterdayFullDay;
      const avg = report.comparison.avg7d;
      const ai = report.ai;
      const anomalies = report.anomalies || [];
      const delta = (cur, prev) => {
        if (cur === null || cur === undefined || prev === null || prev === undefined) return '';
        if (prev === 0) return cur > 0 ? ' (baru)' : '';
        const pct = Math.round((cur / prev - 1) * 100);
        if (pct === 0) return ' (sama)';
        return ` (${pct > 0 ? '+' : ''}${pct}%)`;
      };
      const aiTag = ai?.source === 'ai' ? '🤖 <b>ANALISIS AI</b>' : '🤖 <b>Analisis otomatis</b> <i>(AI lagi sibuk, pakai analisa pola)</i>';
      const body =
        `📊 <b>LAPORAN AKUN — ${escHtml(report.accountName)}</b>\n` +
        `🗓 Hari ini sampai sekarang (WIB)\n\n` +
        `💰 <b>Belanja:</b> ${fmtCurrency(s.spend)}${delta(s.spend, y.spend)}\n` +
        `👁 Tayangan: ${(s.impressions).toLocaleString('id-ID')}\n` +
        `🔗 Klik link: ${(s.linkClicks).toLocaleString('id-ID')} · CTR ${Number(s.ctr).toFixed(2)}%\n` +
        `🛒 Purchase: ${(s.purchases).toLocaleString('id-ID')}\n` +
        `💵 CPR: ${fmtCpr(s.cpr)} · CPC ${fmtCurrency(s.cpc)}\n` +
        `📈 <b>ROAS:</b> ${fmtRoas(s.roas)}${delta(s.roas, y.roas)}\n\n` +
        `⚖️ <b>PERBANDINGAN</b>\n` +
        `• Hari ini: ${fmtCurrency(s.spend)} · ROAS ${fmtRoas(s.roas)}\n` +
        `• Kemarin: ${fmtCurrency(y.spend)} · ROAS ${fmtRoas(y.roas)}\n` +
        `• Rata-rata 7 hari: ${fmtCurrency(avg.spend)} · ROAS ${fmtRoas(avg.roas)}\n` +
        (anomalies.length ? `\n🚨 <b>PERHATIAN:</b>\n${anomalies.map(a => `• ${escHtml(a)}`).join('\n')}\n` : `\n✅ <b>Aman:</b> nggak ada anomali hari ini.\n`) +
        `\n${aiTag}\n` +
        `✅ Kekuatan: ${escHtml(ai.strengths)}\n` +
        `⚠️ Kelemahan: ${escHtml(ai.weaknesses)}\n` +
        `📈 Peluang: ${escHtml(ai.opportunities)}\n` +
        `🔧 Tindakan: ${escHtml(ai.actions)}\n` +
        `🚨 Risiko: ${escHtml(ai.risk)}\n\n` +
        `<i>Read-only • Tidak ada iklan yang diubah.</i>`;
      return ctx.reply(body, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: `ads:repacc:meta:${accountId}` }],
            [{ text: '⚡ Bikin Aturan dari Ini', callback_data: 'rule:add:start' }],
            [{ text: '🤖 Minta Saran AI', callback_data: 'menu:optimize' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      });
    } catch (err) {
      log.error('account report failed', { userId: ctx.userId, accountId, error: err?.message });
      if (isExpiredToken(err)) {
        return ctx.reply('🔑 Sesi Meta kamu kedaluwarsa. Hubungkan ulang via /settings.');
      }
      return ctx.reply('⚠️ Gagal menyusun laporan akun ini. Coba lagi nanti.');
    }
  };
}

// ── Aliases ─────────────────────────────────────────────────
export function handleFbAds(deps) { return handleAds(deps); }
