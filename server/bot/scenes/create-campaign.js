/**
 * Create Campaign WizardScene — guided ad creation entirely from Telegram.
 *
 * Flow: objective (buttons) → name → daily budget → landing URL →
 *       page (auto-first) → AI copy generation → confirmation → execute.
 * Uses orchestrator.createFullCampaign via deps.services.orchestrator with the
 * caller's OWN token (makeApi), so it operates on their ad account only.
 *
 * Callback data: create:obj:<OBJECTIVE>
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:create');

const OBJECTIVES = [
  { id: 'OUTCOME_TRAFFIC', label: '🚦 Traffic' },
  { id: 'OUTCOME_SALES', label: '🛒 Sales' },
  { id: 'OUTCOME_LEADS', label: '📋 Leads' },
  { id: 'OUTCOME_ENGAGEMENT', label: '💬 Engagement' },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtRp = n => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'create:cancel' }];

export const createCampaignScene = new Scenes.WizardScene(
  'create-campaign',
  // step 0 — objective via inline buttons
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply(
      '🚀 <b>Buat Campaign Baru</b>\n\nPilih tujuan campaign:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [...OBJECTIVES.map(o => [{ text: o.label, callback_data: `create:obj:${o.id}` }]), CANCEL_ROW],
        },
      }
    );
    return ctx.wizard.next();
  },
  // step 1 — wait for objective callback handled externally; ask campaign name
  async (ctx) => {
    // objective was set by callback handler before entering this step state machine
    if (!ctx.wizard.state.data.objective) {
      await ctx.reply('⚠️ Pilih tujuan dulu lewat tombol di atas.');
      return;
    }
    await ctx.reply('📝 Nama campaign? (contoh: Promo Lebaran Hijab)', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // step 2 — name → budget
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (!text || text.length > 80) {
      await ctx.reply('⚠️ Nama 1–80 karakter. Coba lagi:');
      return;
    }
    ctx.wizard.state.data.name = text;
    await ctx.reply('💰 Budget harian? (dalam Rupiah, contoh: 50000)\n<i>Minimal Rp 10.000</i>', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // step 3 — budget → landing URL
  async (ctx) => {
    const budget = parseInt((ctx.message?.text || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(budget) || budget < 10000) {
      await ctx.reply('⚠️ Budget minimal Rp 10.000. Coba lagi:');
      return;
    }
    ctx.wizard.state.data.dailyBudget = budget;
    await ctx.reply('🔗 URL landing page?\n(contoh: https://toko.com/produk)', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // step 4 — URL → target audience → confirm summary
  async (ctx) => {
    const url = (ctx.message?.text || '').trim();
    if (!/^https?:\/\//.test(url)) {
      await ctx.reply('⚠️ Harus dimulai http:// atau https://. Coba lagi:');
      return;
    }
    ctx.wizard.state.data.landingUrl = url;
    await ctx.reply('🎯 Target audiens dalam satu kalimat?\n(contoh: wanita 20-35, suka skincare). Ketik /skip jika lewati.', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  async (ctx) => {
    const cmd = ctx.message?.text || '';
    // Stay on this step until the user taps Buat/Batal — leaving here would
    // destroy wizard state before the confirm callbacks can run.
    if (ctx.wizard.state.confirmShown) return;
    ctx.wizard.state.confirmShown = true;
    ctx.wizard.state.data.target = cmd === '/skip' ? '' : cmd.trim();
    const d = ctx.wizard.state.data;
    const summary =
      `📋 <b>KONFIRMASI</b>\n\n` +
      `🎯 Tujuan: ${esc(OBJECTIVES.find(o => o.id === d.objective)?.label || d.objective)}\n` +
      `📝 Nama: ${esc(d.name)}\n` +
      `💰 Budget harian: ${fmtRp(d.dailyBudget)}\n` +
      `🔗 Landing: ${esc(d.landingUrl)}\n` +
      `🎯 Target: ${esc(d.target || 'lebar')}\n\n` +
      `Status awal: ⏸ JEDA (aman)\n✨ AI akan menulis copy iklan.`;
    await ctx.reply(summary, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 Buat Sekarang', callback_data: 'create:go' },
          { text: '❌ Batal', callback_data: 'create:cancel' },
        ]],
      },
    });
  }
);

// Wire the wizard's own callback buttons (previously exported but never
// registered — objective taps were silently dropped and /create was dead).
const sceneDeps = (ctx) => ({ repos: ctx.repos, services: ctx.services });
createCampaignScene.action(/^create:obj:(.+)$/, handleCreateObjective());
createCampaignScene.action(/^create:go$/, (ctx) => handleCreateGo(sceneDeps(ctx))(ctx));
createCampaignScene.action(/^create:cancel$/, handleCreateCancel());

export function handleCreateObjective() {
  return async (ctx) => {
    const obj = ctx.match[1];
    await ctx.answerCbQuery();
    ctx.wizard.state.data = { ...(ctx.wizard.state.data || {}), objective: obj };
    const label = OBJECTIVES.find(o => o.id === obj)?.label || obj;
    await ctx.reply(`✅ Tujuan: <b>${esc(label)}</b>`);
    await ctx.reply('📝 Nama campaign? (contoh: Promo Lebaran Hijab)', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    // Park on the name-consuming step without re-running step 0 (which wipes
    // state) — scene.enter would reset the cursor to 0.
    ctx.wizard.selectStep(2);
  };
}

export function handleCreateGo(deps) {
  return async (ctx) => {
    await ctx.answerCbQuery();
    const d = ctx.wizard.state.data || {};
    if (!d.objective || !d.name || !d.dailyBudget || !d.landingUrl) {
      return ctx.reply('⚠️ Data wizard tidak lengkap. Mulai ulang dengan /create');
    }
    const { api, acct } = makeBotApi(ctx, deps);
    if (!api) return ctx.reply('🔌 Hubungkan akun Meta dulu via /start.');

    // resolve first page owned by the token (creatives require a page)
    let pageId = '';
    try {
      const pages = await api.getPages ? await api.getPages() : [];
      pageId = pages[0]?.id || '';
    } catch { /* handled below */ }
    if (!pageId) {
      return ctx.reply('⚠️ Token belum punya Facebook Page. Kreatif butuh Page — hubungkan dulu di Business Manager.');
    }

    await ctx.reply('✨ AI sedang menulis copy & membuat struktur campaign… (±30 detik)');
    try {
      const orchestrator = deps.services?.orchestrator;
      if (!orchestrator) throw new Error('orchestrator unavailable');

      const result = await orchestrator.createFullCampaign({
        accountId: acct?.account_id || acct?.id,
        pageId,
        product: d.name,
        target: d.target,
        keunggulan: d.target,
        objective: d.objective,
        dailyBudget: d.dailyBudget,
        landingUrl: d.landingUrl,
        meta: api,
      });

      const lines = [
        '🎉 <b>Campaign berhasil dibuat!</b>',
        '',
        `📝 ${esc(d.name)}`,
        `💰 ${fmtRp(d.dailyBudget)}/hari · Status: ⏸ JEDA`,
        '',
        'Aktifkan lewat /ads → pilih akun → ▶️ Resume.',
      ];
      if (result.campaignId) lines.push(`🆔 <code>${esc(result.campaignId)}</code>`);
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      log.error('bot create campaign failed', { userId: ctx.userId, error: err.message });
      await ctx.reply(`⚠️ Gagal membuat campaign: ${esc(err.message).slice(0, 150)}`);
    }
  };
}

export function handleCreateCancel() {
  return async (ctx) => {
    await ctx.answerCbQuery();
    ctx.wizard.state.data = {};
    await ctx.reply('❌ Dibatalkan. Mulai lagi kapan saja dengan /create');
    try { await ctx.scene.leave(); } catch { /* already left */ }
  };
}

// local import shim to avoid circular import at module load
import { MetaAdsAPI } from '../../services/meta/index.js';
function makeBotApi(ctx, deps) {
  const repo = deps?.repos?.platformAccountsRepo;
  if (!repo) return { api: null, acct: null };
  const acct = repo.getByPlatform(ctx.userId, 'meta') || null;
  if (!acct?.access_token) return { api: null, acct };
  return { api: MetaAdsAPI.withToken(acct.access_token), acct };
}
