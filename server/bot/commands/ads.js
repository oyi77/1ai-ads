import { createLogger } from '../../lib/logger.js';
import { MetaAdsAPI } from '../../services/meta/index.js';

const log = createLogger('bot:ads');

const BACKEND = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';

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
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;

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
      `📣 *Ads Manager*\n\n` +
      `Multiple ad platforms — ${connectedCount} connected\n` +
      `Campaigns: ${activeCampaigns} active / ${campaigns.length} total\n\n` +
      `Tap ✅ to manage a connected platform, 🔗 to connect one:`;

    return ctx.reply(summary, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: rows },
    });
  };
}

async function showPlatformAccounts(ctx, deps, platform) {
  const { api } = await makeApi(ctx, deps, platform);
  if (!api) {
    return ctx.reply(
      `⚠️ *${platform.toUpperCase()} API not yet available in the bot.*\n\nUse the dashboard for now:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🌐 Open Dashboard', url: BACKEND }]],
        },
      }
    );
  }

  await ctx.reply(`🔄 Loading your ${platform.toUpperCase()} ad accounts…`);
  try {
    const accounts = await api.getAdAccounts();
    if (!accounts.length) {
      return ctx.reply(`✅ Connected, but no ad accounts were found for this token. Add an ad account in ${platform.toUpperCase()} and retry.`);
    }
    await replyAccountList(ctx, accounts, 1, platform);
  } catch (err) {
    log.error('ads list failed', { userId: ctx.userId, platform, error: err?.message });
    if (isExpiredToken(err)) {
      return ctx.reply('🔑 Your Meta token has expired. Reconnect via /settings.');
    }
    return ctx.reply('⚠️ Could not load your ad accounts. The token may lack permission or network failed.');
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
    .map((a, i) => `${start + i + 1}. ${escHtml(a.name)} (${a.id}) — ${a.status === 'active' ? '✅ active' : '⏸ disabled'}`)
    .join('\n');
  return ctx.reply(
    `📣 *${platform.toUpperCase()} Ad Accounts* (${accounts.length})\n\n${lines}\n\nTap an account to manage it.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((a) => [{ text: `⚙️ ${a.name}`, callback_data: `ads:select:${platform}:${a.id}` }]),
          pagerRow(`ads:accts:${platform}`, p, pages),
          [{ text: '📈 All Accounts Report', callback_data: `ads:report:${platform}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    }
  );
}

export function handleAdsAccountsPage(deps) {
  return async (ctx, pageStr, platform = 'meta') => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Connect a ${platform.toUpperCase()} account first.`);
    try {
      const accounts = await api.getAdAccounts();
      await replyAccountList(ctx, accounts, parseInt(pageStr, 10) || 1, platform);
    } catch (err) {
      log.error('ads accounts pager failed', { userId: ctx.userId, platform, error: err?.message });
      return ctx.reply('⚠️ Could not load your ad accounts.');
    }
  };
}

// ── Account detail: list campaigns ──────────────────────────
export function handleAdsSelect(deps) {
  return async (ctx, platform, accountId) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Connect a ${platform.toUpperCase()} account first.`);
    await ctx.reply(`🔄 Loading campaigns for ${accountId}…`);
    try {
      const campaigns = await api.getCampaigns(accountId);
      if (!campaigns.length) {
        return ctx.reply(`📭 No campaigns in this account yet.`, {
          reply_markup: { inline_keyboard: [[{ text: '🎯 Create Campaign', callback_data: 'menu:create' }], [{ text: '◀️ Back to accounts', callback_data: `ads:platform:${platform}` }]] },
        });
      }
      await replyCampaignList(ctx, accountId, campaigns, 1, platform);
    } catch (err) {
      log.error('ads select failed', { userId: ctx.userId, platform, accountId, error: err?.message });
      return ctx.reply('⚠️ Could not load campaigns for this account.');
    }
  };
}

async function replyCampaignList(ctx, accountId, campaigns, page, platform = 'meta') {
  const { slice, pages, p } = pageSlice(campaigns, page, CAMPAIGNS_PER_PAGE);
  const lines = slice.map((c) => `• ${escHtml(c.name)} — ${c.status === 'active' ? '✅ ON' : '⏸ OFF'}`).join('\n');
  return ctx.reply(
    `⚙️ <b>Campaigns (${campaigns.length}) — ${accountId}</b>\n\n${lines}\n\nTap to toggle on/off:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((c) => [{
            text: (c.status === 'active' ? '⏸ Pause ' : '▶️ Resume ') + c.name,
            callback_data: `ads:toggle:${platform}:${accountId}:${c.id}:${c.status === 'active' ? 'pause' : 'resume'}`,
          }]),
          pagerRow(`ads:camps:${platform}:${accountId}`, p, pages),
          [{ text: '📊 Report', callback_data: `ads:repacc:${platform}:${accountId}` }],
          [{ text: '➕20%', callback_data: `ads:budget:${platform}:${accountId}:pct:1.2` }, { text: '➖20%', callback_data: `ads:budget:${platform}:${accountId}:pct:0.8333` }, { text: '🎯 Create', callback_data: 'menu:create' }],
          [{ text: '◀️ Back to accounts', callback_data: `ads:platform:${platform}` }],
        ],
      },
    }
  );
}

export function handleAdsCampaignsPage(deps) {
  return async (ctx, platform, accountId, pageStr) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Connect a ${platform.toUpperCase()} account first.`);
    try {
      const campaigns = await api.getCampaigns(accountId);
      await replyCampaignList(ctx, accountId, campaigns, parseInt(pageStr, 10) || 1, platform);
    } catch (err) {
      log.error('campaigns pager failed', { userId: ctx.userId, platform, accountId, error: err?.message });
      return ctx.reply('⚠️ Could not load campaigns.');
    }
  };
}

// ── Pause / Resume ──────────────────────────────────────────
export function handleAdsToggle(deps) {
  return async (ctx, platform, accountId, campaignId, mode) => {
    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Connect a ${platform.toUpperCase()} account first.`);
    await ctx.reply(`🔄 ${mode === 'pause' ? 'Pausing' : 'Resuming'} campaign ${campaignId}…`);
    try {
      await api.updateCampaign(campaignId, { status: mode === 'pause' ? 'PAUSED' : 'ACTIVE' });
      return ctx.reply(`✅ Campaign <b>${mode === 'pause' ? 'paused' : 'resumed'}</b>.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⚙️ Back to campaigns', callback_data: `ads:select:${platform}:${accountId}` }]] },
      });
    } catch (err) {
      log.error('ads toggle failed', { userId: ctx.userId, platform, campaignId, mode, error: err?.message });
      if (isExpiredToken(err)) return ctx.reply('🔑 Your token has expired. Reconnect via /settings.');
      return ctx.reply('⚠️ Could not update the campaign.');
    }
  };
}

// ── Reports ─────────────────────────────────────────────────
export function handleAdsReport(deps) {
  return async (ctx, platformOrAccountId, accountIdOrUndefined) => {
    const platform = accountIdOrUndefined ? platformOrAccountId : 'meta';
    // When no accountId, platform is the platform name, NOT an accountId
    const accountId = accountIdOrUndefined || null;

    const { api } = await makeApi(ctx, deps, platform);
    if (!api) return ctx.reply(`🔌 Connect a ${platform.toUpperCase()} account first.`);

    if (accountId) {
      try {
        const accounts = await api.getAdAccounts();
        const acct = accounts.find((a) => String(a.id) === String(accountId));
        if (!acct) return ctx.reply('⚠️ Account not found.');
        const ins = await api.getAccountInsights(accountId, { datePreset: 'last_30d' });
        if (!ins) return ctx.reply('📭 No insight data for this account.');
        const roas = ins.spend > 0 ? (ins.revenue / ins.spend).toFixed(2) : '0.00';
        const body =
          `📊 <b>Report: ${acct.name} (30d)</b>\n\n` +
          `Total Spend: ${fmtCurrency(ins.spend)}\n` +
          `Total Revenue: ${fmtCurrency(ins.revenue)}\n` +
          `ROAS: ${roas}x\n` +
          `Clicks: ${(ins.clicks || 0).toLocaleString('id-ID')}\n` +
          `Impressions: ${(ins.impressions || 0).toLocaleString('id-ID')}`;
        return ctx.reply(body, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `menu:reports:${platform}:${accountId}` }]] } });
      } catch (err) {
        log.error('ads report scoped failed', { userId: ctx.userId, platform, accountId, error: err?.message });
        if (isExpiredToken(err)) return ctx.reply('🔑 Your token has expired.');
        return ctx.reply('⚠️ Could not load report.');
      }
    }

    await ctx.reply('📈 Gathering your ad report…');
    try {
      const accounts = await api.getAdAccounts();
      if (!accounts.length) return ctx.reply('📭 No ad accounts found.');
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
          perAcct.push(`• ${escHtml(acct.name)}: ${fmtCurrency(ins.spend)} spend · ${money(ins.revenue)} rev · ${ins.clicks || 0} clicks`);
        } catch (err) {
          log.warn('ads report acct failed', { accountId: acct.id, error: err?.message });
        }
      }
      const roas = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : '0.00';
      const body =
        `📊 <b>Your ${platform.toUpperCase()} Ads Report (30d)</b>\n\n` +
        `Total Spend: ${fmtCurrency(totalSpend)}\n` +
        `Total Revenue: ${fmtCurrency(totalRev)}\n` +
        `ROAS: ${roas}x\n` +
        `Clicks: ${totalClicks.toLocaleString('id-ID')}\n` +
        `Impressions: ${totalImpr.toLocaleString('id-ID')}\n\n` +
        (perAcct.length ? `<b>Per account:</b>\n${perAcct.join('\n')}` : '');
      return ctx.reply(body, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `ads:report:${platform}` }]] } });
    } catch (err) {
      log.error('ads report list failed', { userId: ctx.userId, platform, error: err?.message });
      if (isExpiredToken(err)) return ctx.reply('🔑 Your token has expired.');
      return ctx.reply('⚠️ Could not load report.');
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
      return ctx.reply('⚠️ Multiplier tidak valid.');
    }
    await ctx.reply(`🔄 Menyesuaikan budget ${Math.round((mult - 1) * 100)}% untuk campaign AKTIF di akun ini…`);
    try {
      const campaigns = await api.getCampaigns(accountId, { limit: 50 });
      const active = campaigns.filter(c => c.status === 'active');
      let done = 0;
      for (const c of active) {
        try {
          const current = (c.dailyBudget || 0) / 100; // Meta minor → major IDR
          if (current <= 0) continue;
          const next = Math.max(10000, Math.round(current * mult * 100) / 100);
          await api.updateCampaign(c.id, { dailyBudget: next });
          done++;
        } catch (e) {
          log.warn('budget scale failed per campaign', { campaignId: c.id, error: e.message });
        }
      }
      return ctx.reply(
        `✅ Budget ${done} campaign aktif disesuaikan (${Math.round((mult - 1) * 100) > 0 ? '+' : ''}${Math.round((mult - 1) * 100)}%).\n\nLihat hasil: /ads`
      );
    } catch (err) {
      log.error('budget scale failed', { userId: ctx.userId, accountId, error: err.message });
      return ctx.reply('⚠️ Gagal menyesuaikan budget.');
    }
  };
}

export function handleAdsDisconnect(deps) {
  const manage = handleAdsManage(deps);
  return async (ctx) => manage(ctx);
}

// ── Manage Connections: list every stored Meta connection ────
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
      `⚙️ *Manage Meta Connections*\n\n${lines}\n\nTap a connection to disconnect it.`,
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
      const body =
        `📊 <b>LAPORAN AKUN — ${escHtml(report.accountName)}</b>\n` +
        `🗓 Hari ini sampai sekarang (WIB)\n\n` +
        `💰 <b>Belanja:</b> ${fmtCurrency(s.spend)}\n` +
        `👁 Tayangan: ${(s.impressions).toLocaleString('id-ID')}\n` +
        `🔗 Klik link: ${(s.linkClicks).toLocaleString('id-ID')} · CTR ${Number(s.ctr).toFixed(2)}%\n` +
        `🛒 Purchase: ${(s.purchases).toLocaleString('id-ID')}\n` +
        `💵 CPR: ${fmtCpr(s.cpr)} · CPC ${fmtCurrency(s.cpc)}\n` +
        `📈 <b>ROAS:</b> ${fmtRoas(s.roas)}\n\n` +
        `⚖️ <b>PERBANDINGAN</b>\n` +
        `• Hari ini: ${fmtCurrency(s.spend)} · ROAS ${fmtRoas(s.roas)}\n` +
        `• Kemarin: ${fmtCurrency(y.spend)} · ROAS ${fmtRoas(y.roas)}\n` +
        `• Rata-rata 7 hari: ${fmtCurrency(avg.spend)} · ROAS ${fmtRoas(avg.roas)}\n\n` +
        `🤖 <b>ANALISIS &amp; REKOMENDASI AI</b>\n` +
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
            [{ text: '📱 Lihat di AdForge Mini App', web_app: { url: `${BACKEND}/reports` } }],
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
