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
function getUserMetaAccount(ctx, deps) {
  const repo = deps?.repos?.platformAccountsRepo;
  if (!repo) return null;
  return repo.getByPlatform(ctx.userId, 'meta') || null;
}

function makeApi(ctx, deps) {
  const acct = getUserMetaAccount(ctx, deps);
  if (!acct?.access_token) return { api: null, acct };
  return { api: MetaAdsAPI.withToken(acct.access_token), acct };
}

function isExpiredToken(err) {
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
          parse_mode: 'Markdown',
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
      const lines = accounts
        .map(
          (a) =>
            `• ${a.name} (` + (a.id.startsWith('act_') ? a.id : `act_${a.id}`) +
            `) — ${a.status === 'active' ? '✅ active' : a.status === 'disabled' ? '⏸ disabled' : a.status}`
        )
        .join('\n');
      return ctx.reply(
        `📣 *Your Meta Ad Accounts*\n\n${lines}\n\n` +
          'Pick an action below. Tap an account to manage it.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              ...accounts.map((a) => [
                { text: `⚙️ ${a.name}`, callback_data: `ads:select:${a.id}` },
              ]),
              [
                { text: '📈 All Accounts Report', callback_data: 'ads:report' },
                { text: '🔌 Disconnect', callback_data: 'ads:disconnect' },
              ],
              [
                { text: '⚙️ Manage Connections', callback_data: 'ads:manage' },
              ],
            ],
          },
        }
      );
    } catch (err) {
      log.error('ads list failed', { userId: ctx.userId, error: err?.message });
      if (isExpiredToken(err)) {
        return ctx.reply('🔑 Your Meta token has expired. Reconnect via /settings → Connect Meta Account.');
      }
      return ctx.reply('⚠️ Could not load your ad accounts. The token may lack ads_read permission or network failed.');
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
      const lines = campaigns
        .map((c) => `• ${c.name} (${c.id}) — ${c.status === 'active' ? '✅ ON' : c.status === 'paused' ? '⏸ OFF' : c.status}`)
        .join('\n');
      return ctx.reply(
        `⚙️ *Campaigns in ${accountId}*\n\n${lines}\n\nTap to toggle on/off:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: campaigns.map((c) => [
              {
                text:
                  (c.status === 'active' ? '⏸ Pause ' : '▶️ Resume ') + c.name,
                callback_data: `ads:toggle:${accountId}:${c.id}:${c.status === 'active' ? 'pause' : 'resume'}`,
              },
            ]),
          },
        }
      );
    } catch (err) {
      log.error('ads select failed', { userId: ctx.userId, accountId, error: err?.message });
      return ctx.reply('⚠️ Could not load campaigns for this account.');
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
          parse_mode: 'Markdown',
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
  return async (ctx) => {
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
          `• ${acct.name}: ${fmtCurrency(ins.spend)} spend · ${money(ins.revenue)} rev · ${ins.clicks || 0} clicks`
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
      parse_mode: 'Markdown',
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
        parse_mode: 'Markdown',
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
      { parse_mode: 'Markdown' }
    );
  };
}

// ── Drop-in replacement for old global fbads (kept as alias) ─
export function handleFbAds(deps) {
  return handleAds(deps);
}
