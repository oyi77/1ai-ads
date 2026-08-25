/**
 * /menu command — Main menu with inline buttons
 * Ported from asisten-jualan/bot/handlers/quick_start.py
 */
import { handleAds, handleAdsReport, getUserMetaAccount, makeApi, isExpiredToken } from './ads.js';
import { handleSettings } from './settings.js';
import { PLATFORM_NAMES } from '../scenes/connect-account.js';
import { resolveScaleDefault } from '../../lib/scale-defaults.js';

export function handleMenu() {
  return async (ctx) => {
    await ctx.reply(
      '📋 *AdForge Menu*\n\nChoose an option:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Campaign Status', callback_data: 'menu:status' }, { text: '📈 Reports', callback_data: 'menu:reports' }],
            [{ text: '🎯 Create Campaign', callback_data: 'menu:create' }, { text: '🤖 AI Optimize', callback_data: 'menu:optimize' }],
            [{ text: '⚡ Monitor Rules', callback_data: 'menu:monitor' }, { text: '🔧 Settings', callback_data: 'menu:settings' }],
            [{ text: '📣 My Meta Ads', callback_data: 'menu:ads' }, { text: '🔗 Connect Account', callback_data: 'menu:connect' }],
          ],
        },
      }
    );
  };
}

export function handleMenuButton(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    const [base, scope] = action.split(':');
    await ctx.answerCbQuery();

    switch (base) {
      case 'status':
        return handleStatusAction(ctx, deps);
      case 'reports':
        return scope ? handleAdsReport(deps)(ctx, scope) : handleReportsAction(ctx, deps);
      case 'create':
        return handleCreateAction(ctx);
      case 'connect':
        return sendPlatformChoice(ctx);
      case 'optimize':
        return handleOptimizeAction(ctx, deps, scope);
      case 'monitor':   return ctx.reply('⚡ Monitor rules: /settings to configure spend guards and alerts.');
      case 'settings':  return handleSettings(deps)(ctx);
      case 'ads':
        return handleAds(deps)(ctx);
      case 'fbads':
        return handleAds(deps)(ctx);
      case 'pricing':
        return ctx.reply('💰 See /pricing for plan details.');
      case 'help':
        return ctx.reply('❓ Use /help for guidance on all features.');
      default:
        return ctx.reply('Unknown option. Use /menu to see available options.');
    }
  };
}

async function sendPlatformChoice(ctx) {
  const entries = Object.entries(PLATFORM_NAMES);
  const inline_keyboard = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = entries.slice(i, i + 2).map(([key, label]) => ({
      text: label,
      callback_data: `connect:${key}`,
    }));
    inline_keyboard.push(row);
  }
  await ctx.reply(
    '🔗 *Connect an Ad Account*\n\nChoose a platform to connect:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard },
    }
  );
}
async function handleStatusAction(ctx, deps) {
  try {
    const result = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [], total: 0 };
    const campaigns = result.data || [];
    const active = campaigns.filter(c => c.status === 'ACTIVE').length;
    const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

    ctx.reply(
      `📊 *Quick Status*\n\n` +
      `Campaigns: ${active} active / ${campaigns.length} total\n` +
      `Spend: Rp ${totalSpend.toLocaleString('id-ID')}\n` +
      `Revenue: Rp ${totalRevenue.toLocaleString('id-ID')}\n` +
      `ROAS: ${roas}x`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    ctx.reply('⚠️ Failed to load status. Try again later.');
  }
}

async function handleReportsAction(ctx, deps) {
  if (deps) return handleAdsReport(deps)(ctx);
  return ctx.reply('📈 Reports feature — use the dashboard at /app for detailed analytics.');
}

async function handleCreateAction(ctx) {
  ctx.reply(
    '🎯 *Create Campaign*\n\n' +
    'Use the web dashboard for full campaign creation:\n' +
    '👉 /app → Campaigns → New Campaign\n\n' +
    'Or connect your Meta account first via /settings.',
    { parse_mode: 'Markdown' }
  );
}

async function handleOptimizeAction(ctx, deps, scope) {
  if (!scope) {
    const acct = getUserMetaAccount(ctx, deps);
    if (!acct) return ctx.reply('🔌 Connect a Meta account first via /start.');

    const { api } = makeApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');

    let accounts;
    try {
      await ctx.reply('🔄 Loading your Meta ad accounts…');
      accounts = await api.getAdAccounts();
    } catch (e) {
      return ctx.reply(isExpiredToken(e)
        ? '🔑 Sesi Meta kamu sudah kedaluwarsa. Hubungkan ulang via /start.'
        : '⚠️ Gagal memuat daftar akun.');
    }

    if (!accounts || accounts.length === 0) {
      return ctx.reply('✅ Terhubung, tapi tidak ada akun iklan ditemukan untuk token ini.');
    }

    return ctx.reply(
      '🤖 *AI Optimization*\n\nPilih akun iklan yang mau dioptimalkan:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...accounts.map((a) => [{ text: `⚙️ ${a.name} (${a.id})`, callback_data: `menu:optimize:${a.id}` }]),
            [
              { text: '🌐 Global', callback_data: 'menu:optimize:global' },
              { text: '⬅️ Back', callback_data: 'menu:optimize' },
            ],
          ],
        },
      }
    );
  }

  try {
    let campaigns;
    if (scope === 'global') {
      const result = deps?.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [], total: 0 };
      campaigns = (result.data || []).filter(c => c.platform === 'meta' && c.status === 'ACTIVE');
    } else {
      const acct = getUserMetaAccount(ctx, deps);
      if (!acct) return ctx.reply('🔌 Connect a Meta account first via /start.');
      const { api } = makeApi(ctx, deps);
      if (!api) return ctx.reply('🔌 Connect a Meta account first via /start.');

      let live;
      try {
        live = await api.getCampaigns(scope);
      } catch (e) {
        return ctx.reply(isExpiredToken(e)
          ? '🔑 Sesi Meta kamu sudah kedaluwarsa. Hubungkan ulang via /start.'
          : '⚠️ Gagal memuat kampanye akun ini.');
      }
      const active = (live || []).filter(c => c.status === 'active');
      if (active.length === 0) {
        return ctx.reply(
          '🤖 *AI Optimization*\n\nTidak ada kampanye Meta aktif untuk dioptimalkan.',
          { parse_mode: 'Markdown' }
        );
      }
      const insights = await api.getMultiCampaignInsights(active.map(c => c.id), { datePreset: 'last_30d', accountId: scope });
      campaigns = active.map(c => {
        const ins = insights[c.id] || {};
        const spend = ins.spend || 0;
        const revenue = ins.revenue || 0;
        return {
          id: c.id,
          name: c.name || c.id,
          status: c.status,
          budget: c.dailyBudget || 0,
          spend,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
        };
      });
    }

    if (campaigns.length === 0) {
      return ctx.reply(
        '🤖 *AI Optimization*\n\nTidak ada kampanye Meta aktif untuk dioptimalkan.',
        { parse_mode: 'Markdown' }
      );
    }

    return await runOptimize(ctx, deps, campaigns);
  } catch {
    return ctx.reply('⚠️ Gagal memproses optimasi. Coba lagi nanti.');
  }
}

async function runOptimize(ctx, deps, campaigns) {
  const llmClient = deps?.services?.llmClient;
  if (llmClient) {
    const llmSuggestion = await tryLlmSuggestion(llmClient, campaigns);
    if (llmSuggestion) return await proposeOptimization(ctx, deps, llmSuggestion);
  }

  // Deterministic fallback: pause the worst performer (lowest ROAS).
  const campaign = campaigns.reduce((worst, c) => {
    const roas = typeof c.roas === 'number' ? c.roas : (c.spend > 0 ? (c.revenue || 0) / c.spend : 0);
    const worstRoas = typeof worst.roas === 'number' ? worst.roas : (worst.spend > 0 ? (worst.revenue || 0) / worst.spend : 0);
    return roas < worstRoas ? c : worst;
  });

  return await proposeOptimization(ctx, deps, {
    campaign,
    type: 'pause',
    amount: null,
    rationale: 'ROAS rendah',
  });
}

const OPTIMIZE_SYSTEM_PROMPT = `You are an AI advertising optimization assistant.
Analyze the given Meta ad campaigns and recommend ONE optimization as a JSON object:
{ "campaign_id": string, "type": "pause"|"scale_up"|"scale_down", "amount": number (optional, MULTIPLIER: scale_up → budget × amount, e.g. 1.5 = +50% (amount > 1 raises budget, amount < 1 lowers it); scale_down → budget ÷ amount, e.g. 1.25 = −20% (amount > 1 lowers budget, amount < 1 raises it); omit or use 1 for pause; 0 < amount ≤ 5), "rationale": string }
Only reference campaigns present in the data. Return ONLY the JSON object, no other text.`;

async function tryLlmSuggestion(llmClient, campaigns) {
  try {
    const context = campaigns.map(c => ({
      id: c.id,
      name: c.name || c.id,
      status: c.status,
      budget: c.budget || 0,
      spend: c.spend || 0,
      revenue: c.revenue || 0,
      roas: typeof c.roas === 'number' ? c.roas : (c.spend > 0 ? (c.revenue || 0) / c.spend : 0),
    }));
    const response = await llmClient.call(
      OPTIMIZE_SYSTEM_PROMPT,
      `Recommend the best optimization for these Meta campaigns:\n${JSON.stringify(context)}`
    );
    if (typeof response !== 'string' || !response.trim()) return null;
    const clean = String(response).replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.campaign_id) return null;
    const campaign = campaigns.find(c => c.id === parsed.campaign_id);
    if (!campaign) return null;
    const type = ['pause', 'scale_up', 'scale_down'].includes(parsed.type) ? parsed.type : 'pause';
    const raw = parsed.amount;
    const coerced = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    const amount = coerced !== null && Number.isFinite(coerced) ? coerced : null;
    return {
      campaign,
      type,
      amount: type === 'pause' ? null : amount,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 200) : '',
    };
  } catch {
    return null;
  }
}

async function proposeOptimization(ctx, deps, suggestion) {
  const { campaign, type, amount, rationale } = suggestion;
  const action = type === 'pause' ? { type: 'pause' } : { type, amount: amount || resolveScaleDefault(type, deps?.repos?.settingsRepo) };
  const summary = type === 'pause'
    ? `AI menyarankan pause untuk ${campaign.name || campaign.id}${rationale ? ` — ${rationale}` : ''}`
    : `AI menyarankan ${type === 'scale_up' ? 'naikkan' : 'turunkan'} budget ${campaign.name || campaign.id}${rationale ? ` — ${rationale}` : ''}`;
  const label = type === 'pause' ? 'pause' : (type === 'scale_up' ? 'naikkan budget' : 'turunkan budget');

  const draft = await deps?.services?.draftService?.guardAutonomousChange?.({
    type: 'ai_optimize',
    summary,
    details: { action, campaign },
    proposedBy: 'ai',
    userId: ctx.userId,
    campaignId: campaign.id,
  });

  if (!draft) {
    return ctx.reply(
      '🤖 *AI Optimization*\n\n' +
      'AI auto-apply sedang nonaktif. Nyalakan persetujuan di /app → Settings, ' +
      'atau gunakan dashboard: /app',
      { parse_mode: 'Markdown' }
    );
  }

  return ctx.reply(
    `🤖 *Saran AI*: ${label} *${campaign.name || campaign.id}*\n\nSetujui atau tolak:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Apply', callback_data: `approval:approve:${draft.id}` },
          { text: '❌ Dismiss', callback_data: `approval:reject:${draft.id}` },
        ]],
      },
    }
  );
}
