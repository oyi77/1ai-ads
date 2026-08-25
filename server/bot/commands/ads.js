/**
 * /ads command + inline actions — REAL per-user Meta ad management.
 *
 * Uses the Meta access token the user connected via the /start connect wizard
 * (stored per-user in platform_accounts, scoped to ctx.userId by the identify
 * middleware). Every action is built on MetaAdsAPI.withToken(token), so it
 * operates on the caller's OWN ad accounts — never the global system token.
 */
import { createLogger } from '../../lib/logger.js';
import { MetaAdsAPI } from '../../services/meta/index.js';


const log = createLogger('bot:ads');

const BACKEND = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';

/** Resolve the current user's stored Meta token, or null. */
export function getUserMetaAccount(ctx, deps) {
  const repo = deps?.repos?.platformAccountsRepo;
  if (!repo) return null;
  return repo.getByPlatform(ctx.userId, 'meta') || null;
}

export function makeApi(ctx, deps) {
  const acct = getUserMetaAccount(ctx, deps);
  if (!acct?.access_token) return { api: null, acct };
  return { api: MetaAdsAPI.withToken(acct.access_token), acct };
}

export function isExpiredToken(err) {
  // Meta returns a 190/110/463 code with "Session has expired" or "user token"
  const code = err?.code || err?.error?.code;
  const msg = `${err?.message || ''} ${err?.error?.message || ''}`.toLowerCase();
  return (
    code === 190 ||
    code === 110 ||
    code === 463 ||
    msg.includes('session has expired') ||
    msg.includes('user token is expired') ||
    msg.includes('invalid oauth')
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

// ── /ads entry ──────────────────────────────────────────────
export function handleAds(deps) {
  return async (ctx) => {
    const acct = getUserMetaAccount(ctx, deps);
    if (!acct?.access_token) {
      return ctx.reply(
        '🔌 *No Meta account connected*\n\n' +
          'Connect your Meta (Facebook/Instagram) ad account first:\n' +
          '• Tap /start → 📘 Meta, or\n' +
          '• /settings → Connect Meta Account\n\n' +
          'Your token is encrypted and scoped to you only.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📘 Connect Meta', callback_data: 'connect:meta' }]],
          },
        }
      );
    }

    const { api } = makeApi(ctx, deps);
    await ctx.reply('🔄 Loading your Meta ad accounts…');
    try {
      const accounts = await api.getAdAccounts();
      if (!accounts.length) {
        return ctx.reply('✅ Connected, but no ad accounts were found for this token. Add an ad account in Meta Business Manager and retry.');
      }
      await replyAccountList(ctx, accounts, 1);
    } catch (err) {
      log.error('ads list failed', { userId: ctx.userId, error: err?.message });
      if (isExpiredToken(err)) {
        return ctx.reply('🔑 Your Meta token has expired. Reconnect via /settings → Connect Meta Account.');
      }
      return ctx.reply('⚠️ Could not load your ad accounts. The token may lack ads_read permission or network failed.');
    }
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

/** Render the paginated account list (page = 1-based). */
async function replyAccountList(ctx, accounts, page) {
  const { slice, pages, p } = pageSlice(accounts, page, ACCOUNTS_PER_PAGE);
  const start = (p - 1) * ACCOUNTS_PER_PAGE;
  const lines = slice
    .map(
      (a, i) =>
        `${start + i + 1}. ${escHtml(a.name)} (` + (a.id.startsWith('act_') ? a.id : `act_${a.id}`) +
        `) — ${a.status === 'active' ? '✅ active' : a.status === 'disabled' ? '⏸ disabled' : a.status}`
    )
    .join('\n');
  return ctx.reply(
    `📣 *Your Meta Ad Accounts* (${accounts.length})\n\n${lines}\n\n` +
      'Tap an account to manage it.',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((a) => [
            { text: `⚙️ ${a.name}`, callback_data: `ads:select:${a.id}` },
          ]),
          pagerRow('ads:accts', p, pages),
          [
            ...(p === pages || pages > 1 ? [{ text: '📈 All Accounts Report', callback_data: 'ads:report' }] : []),
            ...(p === pages ? [{ text: '🔌 Disconnect', callback_data: 'ads:disconnect' }] : []),
          ],
          ...(p === pages
            ? [
                [{ text: '⚙️ Manage Connections', callback_data: 'ads:manage' }],
                [{ text: '📱 Buka AdForge Mini App', web_app: { url: `${BACKEND}/reports` } }],
              ]
            : []),
        ],
      },
    }
  );
}

/** Pager callback: re-render the account list at a given page (no refetch). */
export function handleAdsAccountsPage(deps) {
  return async (ctx, pageStr) => {
    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    try {
      const accounts = await api.getAdAccounts();
      await replyAccountList(ctx, accounts, parseInt(pageStr, 10) || 1);
    } catch (err) {
      log.error('ads accounts pager failed', { userId: ctx.userId, error: err?.message });
      return ctx.reply('⚠️ Could not load your ad accounts.');
    }
  };
}

// ── Account detail: list campaigns with pause/resume ────────
export function handleAdsSelect(deps) {
  return async (ctx, accountId) => {
    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    await ctx.reply(`🔄 Loading campaigns for ${accountId}…`);
    try {
      const campaigns = await api.getCampaigns(accountId);
      if (!campaigns.length) {
        return ctx.reply(`📭 No campaigns in ${accountId} yet. Create one in the dashboard: ${BACKEND}/campaigns`);
      }
      await replyCampaignList(ctx, accountId, campaigns, 1);
    } catch (err) {
      log.error('ads select failed', { userId: ctx.userId, accountId, error: err?.message });
      return ctx.reply('⚠️ Could not load campaigns for this account.');
    }
  };
}

/** Render the paginated campaign list for an account (page = 1-based). */
async function replyCampaignList(ctx, accountId, campaigns, page) {
  const { slice, pages, p } = pageSlice(campaigns, page, CAMPAIGNS_PER_PAGE);
  const lines = slice
    .map((c) => `• ${escHtml(c.name)} — ${c.status === 'active' ? '✅ ON' : c.status === 'paused' ? '⏸ OFF' : c.status}`)
    .join('\n');
  return ctx.reply(
    `⚙️ <b>Campaigns (${campaigns.length}) — ${escHtml(accountId)}</b>\n\n${lines}\n\n` +
      'Tap to toggle on/off:',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          ...slice.map((c) => [
            {
              text:
                (c.status === 'active' ? '⏸ Pause ' : '▶️ Resume ') + c.name,
              callback_data: `ads:toggle:${accountId}:${c.id}:${c.status === 'active' ? 'pause' : 'resume'}`,
            },
          ]),
          pagerRow(`ads:camps:${accountId}`, p, pages),
          [{ text: '📊 Laporan Akun + Analisis AI', callback_data: `ads:repacc:${accountId}` }],
          [{ text: '◀️ Kembali ke daftar akun', callback_data: 'ads' }],
        ],
      },
    }
  );
}

/** Pager callback: re-render the campaign list at a given page (no refetch). */
export function handleAdsCampaignsPage(deps) {
  return async (ctx, accountId, pageStr) => {
    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    try {
      const campaigns = await api.getCampaigns(accountId);
      if (!campaigns.length) return ctx.reply(`📭 No campaigns in ${accountId}.`);
      await replyCampaignList(ctx, accountId, campaigns, parseInt(pageStr, 10) || 1);
    } catch (err) {
      log.error('campaigns pager failed', { userId: ctx.userId, accountId, error: err?.message });
      return ctx.reply('⚠️ Could not load campaigns.');
    }
  };
}

// ── Pause / Resume a campaign ───────────────────────────────
export function handleAdsToggle(deps) {
  return async (ctx, accountId, campaignId, mode) => {
    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    await ctx.reply(`🔄 ${mode === 'pause' ? 'Pausing' : 'Resuming'} campaign ${campaignId}…`);
    try {
      await api.updateCampaign(campaignId, { status: mode === 'pause' ? 'PAUSED' : 'ACTIVE' });
      return ctx.reply(
        `✅ Campaign *${mode === 'pause' ? 'paused' : 'resumed'}*.\n\n` +
          `Open it in the dashboard: ${BACKEND}/campaigns`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '⚙️ Back to campaigns', callback_data: `ads:select:${accountId}` }]],
          },
        }
      );
    } catch (err) {
      log.error('ads toggle failed', { userId: ctx.userId, campaignId, mode, error: err?.message });
      if (isExpiredToken(err)) {
        return ctx.reply('🔑 Your Meta token has expired. Reconnect via /settings → Connect Meta Account.');
      }
      return ctx.reply('⚠️ Could not update the campaign. Check that the token has ads_management permission.');
    }
  };
}

// ── Report: spend + insights across accounts ────────────────
export function handleAdsReport(deps) {
  return async (ctx, accountId) => {
    if (accountId) {
      const { api } = makeApi(ctx, deps);
      if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
      let accounts;
      try {
        accounts = await api.getAdAccounts();
      } catch (err) {
        log.error('ads report scoped list failed', { userId: ctx.userId, error: err?.message });
        return ctx.reply('⚠️ Could not load your accounts for the report.');
      }
      const acct = accounts.find((a) => String(a.id) === String(accountId));
      if (!acct) return ctx.reply('⚠️ Akun tidak ditemukan.');

      let ins;
      try {
        ins = await api.getAccountInsights(accountId, { datePreset: 'last_30d' });
      } catch (err) {
        if (isExpiredToken(err)) {
          return ctx.reply('🔑 Sesi Meta kamu sudah kedaluwarsa. Hubungkan ulang via /start.');
        }
        log.warn('ads report scoped failed', { accountId, error: err?.message });
        return ctx.reply('⚠️ Gagal mengambil report akun ini.');
      }
      if (!ins) return ctx.reply('📭 Tidak ada data insight untuk akun ini.');

      const roas = ins.spend > 0 ? (ins.revenue / ins.spend).toFixed(2) : '0.00';
      const body =
        `📊 *Report: ${acct.name} (30d)*\n\n` +
        `Total Spend: ${fmtCurrency(ins.spend)}\n` +
        `Total Revenue: ${fmtCurrency(ins.revenue)}\n` +
        `ROAS: ${roas}x\n` +
        `Clicks: ${(ins.clicks || 0).toLocaleString('id-ID')}\n` +
        `Impressions: ${(ins.impressions || 0).toLocaleString('id-ID')}`;

      return ctx.reply(body, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔄 Refresh', callback_data: `menu:reports:${accountId}` }]],
        },
      });
    }

    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    await ctx.reply('📈 Gathering your ad report…');
    let accounts;
    try {
      accounts = await api.getAdAccounts();
    } catch (err) {
      log.error('ads report list failed', { userId: ctx.userId, error: err?.message });
      return ctx.reply('⚠️ Could not load your accounts for the report.');
    }
    if (!accounts.length) return ctx.reply('📭 No ad accounts found to report on.');

    let totalSpend = 0;
    let totalRev = 0;
    let totalClicks = 0;
    let totalImpr = 0;
    const perAcct = [];

    for (const acct of accounts) {
      try {
        const ins = await api.getAccountInsights(acct.id, { datePreset: 'last_30d' });
        if (!ins) continue;
        totalSpend += ins.spend || 0;
        totalRev += ins.revenue || 0;
        totalClicks += ins.clicks || 0;
        totalImpr += ins.impressions || 0;
        perAcct.push(
          `• ${escHtml(acct.name)}: ${fmtCurrency(ins.spend)} spend · ${money(ins.revenue)} rev · ${ins.clicks || 0} clicks`
        );
      } catch (err) {
        log.warn('ads report acct failed', { accountId: acct.id, error: err?.message });
      }
    }

    const roas = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : '0.00';
    const body =
      `📊 *Your Meta Ads Report (30d)*\n\n` +
      `Total Spend: ${fmtCurrency(totalSpend)}\n` +
      `Total Revenue: ${fmtCurrency(totalRev)}\n` +
      `ROAS: ${roas}x\n` +
      `Clicks: ${totalClicks.toLocaleString('id-ID')}\n` +
      `Impressions: ${totalImpr.toLocaleString('id-ID')}\n\n` +
      (perAcct.length ? `*Per account:*\n${perAcct.join('\n')}` : 'No insight data returned.');

    return ctx.reply(body, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'ads:report' }]],
      },
    });
  };
}

// ── Disconnect: deactivate stored account ───────────────────
export function handleAdsDisconnect(deps) {
  // Bare /ads:disconnect (no id) → show the per-connection manage list
  // so the user explicitly picks which connection to drop (id-scoped).
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
    const lines = rows.map((r, i) => `${i + 1}. ${r.is_active ? '✅' : '⛔️'} *${r.account_name}*`).join('\n');
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
    // Deactivate ONLY this connection (scoped to the current user by id + user_id check).
    repo.update(id, { is_active: 0 });
    const remaining = (repo.findByUserId(ctx.userId) || []).filter(
      (r) => r.platform === 'meta' && r.is_active
    );
    if (!remaining.length) {
      return ctx.reply(`🗑 Disconnected *${row.account_name}*. You now have no active Meta connection.`);
    }
    const names = remaining.map((r) => `• ${r.account_name}`).join('\n');
    await ctx.reply(
      `🗑 Disconnected *${row.account_name}*.\n\nRemaining active Meta connections:\n${names}`,
      { parse_mode: 'HTML' }
    );
  };
}

// ── Drop-in replacement for old global fbads (kept as alias) ─
export function handleFbAds(deps) {
  return handleAds(deps);
}


// ── Per-account detailed report + AI recommendation ─────────
/**
 * HTML parse-mode helpers. Telegram's legacy Markdown breaks on any _ * `
 * appearing in platform-controlled strings (campaign names, LLM output) —
 * HTML only needs < > & escaped and gives us real <b>/<i> tags.
 */
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtRoas(v) { return v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}x`; }
function fmtCpr(v) { return v === null || v === undefined ? '—' : fmtCurrency(v); }

export function handleAdsAccountReport(deps) {
  return async (ctx, accountId) => {
    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');
    const reportService = deps?.services?.accountReportService;
    if (!reportService) return ctx.reply('⚠️ Report service belum tersedia.');
    await ctx.reply('🔄 Menyusun laporan + analisis AI…');
    try {
      // Resolve the friendly display name from the token's own account list
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
        `📊 <b>LAPORAN AKUN — ${escHtml(report.accountName)}</b>
` +
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
            [{ text: '🔄 Refresh', callback_data: `ads:repacc:${accountId}` }],
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
