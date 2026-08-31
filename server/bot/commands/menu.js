/**
 * Main Menu & Handlers
 * Multi-platform ads management
 */
import config from '../../config/index.js';
import { buildPlatformKeyboard, buildPlatformAccountKeyboard } from '../nav.js';
import { getUserMetaAccount, makeApi, isExpiredToken } from './ads.js';
import { resolveScaleDefault } from '../../lib/scale-defaults.js';
import { handleMonitor } from './monitor.js';
import { handleAds } from './ads.js';
import { handleHelp } from './help.js';
import { handlePricing } from './pricing.js';
import { handleSettings } from './settings.js';
import { handleStatus } from './status.js';
const WEB_APP_URL = config.webAppUrl;
// Platform name map (from platforms/index.js PLATFORM_REGISTRY)
const PLATFORM_LABELS = {
  meta: 'Meta (FB/IG)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  twitter: 'Twitter/X Ads',
  snapchat: 'Snapchat Ads',
  pinterest: 'Pinterest Ads',
  microsoft: 'Microsoft/Bing',
  reddit: 'Reddit Ads',
  yandex: 'Yandex Ads',
  baidu: 'Baidu Ads',
  apple: 'Apple Search Ads',
  thetradedesk: 'The Trade Desk',
  criteo: 'Criteo',
  taboola: 'Taboola',
  amazon: 'Amazon Ads',
};

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 Dashboard', callback_data: 'menu:status' }, { text: '🎯 Create Campaign', callback_data: 'menu:create' }],
      [{ text: '⚡ Rules', callback_data: 'menu:monitor' }, { text: '🤖 AI Optimize', callback_data: 'menu:optimize' }],
      [{ text: '📣 Ads Manager', callback_data: 'menu:ads' }, { text: '🌐 Platforms', callback_data: 'menu:platforms' }],
      [{ text: '⚙️ Settings', callback_data: 'menu:settings' }, { text: '💰 Pricing', callback_data: 'menu:pricing' }],
      [{ text: '❓ Help', callback_data: 'menu:help' }],
      [{ text: '📱 AdForge Mini App', web_app: { url: WEB_APP_URL } }],
      [{ text: '🌐 Open in Browser', url: WEB_APP_URL }],
    ],
  };
}

export function handleMenu() {
  return async (ctx) => {
    await ctx.reply(
      '📋 *AdForge Menu*\n\nPilih fitur:',
      {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(),
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
        return handleStatus(deps)(ctx);
      case 'reports':
        return scope ? handleAdsReport(deps)(ctx, scope) : handleReportsAction(ctx, deps);
      case 'create':
        return ctx.scene.enter('create-campaign');
      case 'connect':
        return sendPlatformChoice(ctx);
      case 'optimize':
        return handleOptimizeAction(ctx, deps, scope);
      case 'monitor':   return handleMonitor(deps)(ctx);
      case 'settings':  return handleSettings(deps)(ctx);
      case 'ads':
        return handleAds(deps)(ctx);
      case 'fbads':
        return handleAds(deps)(ctx);
      case 'platforms':
        return handlePlatforms(ctx, deps);
      case 'platform':
        return handlePlatformAction(ctx, deps, scope);
      case 'pricing':
        return handlePricing()(ctx);
      case 'help':
        return handleHelp()(ctx);
      default:
        return ctx.reply('Unknown option. Use /menu to see available options.');
    }
  };
}

async function sendPlatformChoice(ctx) {
  const entries = Object.entries(PLATFORM_LABELS);
  const inline_keyboard = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = entries.slice(i, i + 2).map(([key, label]) => ({
      text: label,
      callback_data: `connect:${key}`,
    }));
    inline_keyboard.push(row);
  }
  inline_keyboard.push([{ text: '⬅️ Menu', callback_data: 'quick:menu' }]);
  await ctx.reply(
    '🔗 *Connect an Ad Account*\n\nChoose a platform to connect:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard },
    }
  );
}


async function handleReportsAction(ctx, deps) {
  if (deps) return handleAdsReport(deps)(ctx);
  return ctx.reply('📈 Reports feature — use the dashboard at /app for detailed analytics.');
}

async function handleOptimizeAction(ctx, deps, scope) {
  if (!scope) {
    const acct = getUserMetaAccount(ctx, deps);
    if (!acct) return ctx.reply('🔌 Connect a Meta account first via /start.');

    const { api } = await makeApi(ctx, deps);
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
      const { api } = await makeApi(ctx, deps);
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

// ── Platforms Management ──────────────────────────────────────────────
async function handlePlatforms(ctx, deps) {
  try {
    // Note: ctx.answerCbQuery() already called by handleMenuButton
    const keyboard = await buildPlatformKeyboard(deps, ctx.userId);
    await ctx.reply(
      '🌐 *Platforms*\n\nConnect or manage your ad platforms:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...keyboard,
            [{ text: '⬅️ Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  } catch (err) {
    console.error('handlePlatforms failed:', err.message);
    await ctx.reply('⚠️ Failed to load platforms. Try /menu again.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
}

async function handlePlatformAction(ctx, deps, scope) {
  try {
    // Note: ctx.answerCbQuery() already called by handleMenuButton
    const [platform, action, ...rest] = scope.split(':');

    if (action === 'connect') {
      return ctx.scene.enter('connect-account', { platform });
    }

    if (action === 'manage') {
      const accounts = await buildPlatformAccountKeyboard(deps, ctx.userId, platform);
      await ctx.reply(
        `🌐 *${platform.toUpperCase()} Accounts*\n\nSelect an account to manage:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              ...accounts,
              [{ text: '⬅️ Back to Platforms', callback_data: 'menu:platforms' }],
            ],
          },
        }
      );
      return;
    }

    if (action === 'account') {
      return ctx.reply(
        `🔧 *Manage ${scope.toUpperCase()} Account*\n\nFeature coming soon...`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: `platform:${platform}:manage` }],
            ],
          },
        }
      );
    }

    return ctx.reply('Unknown platform action.', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Menu', callback_data: 'quick:menu' }]] },
    });
  } catch (err) {
    console.error('handlePlatformAction failed:', err.message);
    await ctx.reply('⚠️ Platform action failed. Try /menu again.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
}
