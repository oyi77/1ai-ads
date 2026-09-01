/**
 * Create Campaign WizardScene — full flow per user feedback:
 * select account → objective → name → budget → adset/audience/interest → post ID → confirm → create
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';
import { MetaAdsAPI } from '../../services/meta/index.js';

const log = createLogger('bot:create');

const OBJECTIVES = [
  { id: 'OUTCOME_TRAFFIC', label: '🚦 Traffic' },
  { id: 'OUTCOME_SALES', label: '🛒 Sales' },
  { id: 'OUTCOME_LEADS', label: '📋 Leads' },
  { id: 'OUTCOME_ENGAGEMENT', label: '💬 Engagement' },
  { id: 'OUTCOME_AWARENESS', label: '👁 Brand Awareness' },
  { id: 'OUTCOME_APP_PROMOTION', label: '📱 App Install' },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtRp = n => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'create:cancel' }];

export const createCampaignScene = new Scenes.WizardScene(
  'create-campaign',
  // Step 0: Select ad account
  async (ctx) => {
    ctx.wizard.state.data = {};
    const repo = ctx.deps?.repos?.platformAccountsRepo;
    const accounts = repo?.findByUserId?.(ctx.userId)?.filter(a => a.is_active) || [];
    if (accounts.length === 0) {
      await ctx.reply('🔌 No ad accounts connected. Connect one first via /settings.');
      return ctx.scene.leave();
    }
    ctx.wizard.state.accounts = accounts;
    const keyboard = accounts.map(a => [{
      text: `📘 ${a.account_name || a.platform}`,
      callback_data: `create:acct:${a.id}`,
    }]);
    keyboard.push(CANCEL_ROW);
    await ctx.reply('📋 *Create Campaign*\n\nSelect an ad account:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    return ctx.wizard.next();
  },
  // Step 1: Wait for account selection, then show objective
  async (ctx) => {
    if (!ctx.wizard.state.data.accountId) {
      await ctx.reply('⚠️ Please select an account using the buttons above.');
      return;
    }
    await ctx.reply('🎯 *Campaign Objective*\n\nWhat is the goal of this campaign?', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [...OBJECTIVES.map(o => [{ text: o.label, callback_data: `create:obj:${o.id}` }]), CANCEL_ROW],
      },
    });
    return ctx.wizard.next();
  },
  // Step 2: Wait for objective, ask campaign name
  async (ctx) => {
    if (!ctx.wizard.state.data.objective) {
      await ctx.reply('⚠️ Select an objective using the buttons above.');
      return;
    }
    await ctx.reply('📝 *Campaign Name*\n\nGive your campaign a name (e.g. "Promo Lebaran 2025"):', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [CANCEL_ROW] },
    });
    return ctx.wizard.next();
  },
  // Step 3: Name → budget
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (!text || text.length > 80) {
      await ctx.reply('⚠️ Name must be 1-80 characters. Try again:');
      return;
    }
    ctx.wizard.state.data.name = text;
    await ctx.reply('💰 *Daily Budget*\n\nEnter daily budget in Rupiah (min Rp 10,000):\nExample: 50000', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [CANCEL_ROW] },
    });
    return ctx.wizard.next();
  },
  // Step 4: Budget → adset/audience
  async (ctx) => {
    const budget = parseInt((ctx.message?.text || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(budget) || budget < 10000) {
      await ctx.reply('⚠️ Minimum budget is Rp 10,000. Try again:');
      return;
    }
    ctx.wizard.state.data.dailyBudget = budget;
    await ctx.reply(
      '🎯 *Audience Settings*\n\nSend your audience targeting in this format:\n\n' +
      '`Country: ID\nAge: 18-45\nGender: all\nInterests: fashion, beauty, skincare`\n\n' +
      'Or send /skip for default targeting (Indonesia, 18-55, all).',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 5: Audience → post ID
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (text !== '/skip') {
      const lines = text.split('\n').reduce((acc, line) => {
        const [k, ...v] = line.split(':');
        if (k && v.length) acc[k.trim().toLowerCase()] = v.join(':').trim();
        return acc;
      }, {});
      ctx.wizard.state.data.targeting = {
        countries: lines.country ? [lines.country.toUpperCase()] : ['ID'],
        ageMin: parseInt(lines.age?.split('-')[0]) || 18,
        ageMax: parseInt(lines.age?.split('-')[1]) || 55,
        gender: lines.gender === 'male' ? 1 : lines.gender === 'female' ? 2 : 0,
        interests: lines.interests ? lines.interests.split(',').map(s => s.trim()) : [],
      };
    } else {
      ctx.wizard.state.data.targeting = { countries: ['ID'], ageMin: 18, ageMax: 55, gender: 0, interests: [] };
    }
    await ctx.reply(
      '📱 *Post ID*\n\nEnter the Facebook/Instagram Post ID you want to use as the ad creative:\n\n' +
      'Example: `1234567890123456`\n\n' +
      'Or send /skip to let AI generate the creative.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 6: Post ID → confirm
  async (ctx) => {
    // After the confirmation screen is shown, stray text must not re-enter
    // Post-ID parsing — require the user to use the create/cancel buttons.
    if (ctx.wizard.state.confirmShown) return;
    const text = (ctx.message?.text || '').trim();
    if (text !== '/skip') {
      const postId = text.replace(/[^0-9]/g, '');
      if (!postId || postId.length < 5) {
        await ctx.reply('⚠️ Invalid Post ID. Enter a valid Facebook Post ID or /skip.');
        return;
      }
      ctx.wizard.state.data.postId = postId;
    }
    const d = ctx.wizard.state.data;
    const targeting = d.targeting || {};
    const summary =
      `📋 *CONFIRMATION*\n\n` +
      `📘 Account: ${esc((ctx.wizard.state.accounts || []).find(a => a.id === d.accountId)?.account_name || d.accountId)}\n` +
      `🎯 Objective: ${esc(OBJECTIVES.find(o => o.id === d.objective)?.label || d.objective)}\n` +
      `📝 Name: ${esc(d.name)}\n` +
      `💰 Budget: ${fmtRp(d.dailyBudget)}/day\n` +
      `🌍 Country: ${(targeting.countries || ['ID']).join(', ')}\n` +
      `👤 Age: ${targeting.ageMin || 18}-${targeting.ageMax || 55}\n` +
      `🚻 Gender: ${targeting.gender === 1 ? 'Male' : targeting.gender === 2 ? 'Female' : 'All'}\n` +
      `🏷 Interests: ${(targeting.interests || []).join(', ') || 'None'}\n` +
      `📱 Post ID: ${d.postId || 'AI-generated'}\n\n` +
      `Status: ⏸ PAUSED (safe to review)`;
    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Create Campaign', callback_data: 'create:go' }],
          [{ text: '❌ Cancel', callback_data: 'create:cancel' }],
        ],
      },
    });
    ctx.wizard.state.confirmShown = true;
  }
);

// Wire scene callbacks: account picker → objective picker → name prompt
createCampaignScene.action(/^create:acct:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.match[1];
  ctx.wizard.state.data.accountId = accountId;
  const name = (ctx.wizard.state.accounts || []).find(a => a.id === accountId)?.account_name || accountId;
  await ctx.reply(`✅ Account selected: *${esc(name)}*`, { parse_mode: 'Markdown' });
  await ctx.reply('🎯 *Campaign Objective*\n\nWhat is the goal of this campaign?', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [...OBJECTIVES.map(o => [{ text: o.label, callback_data: `create:obj:${o.id}` }]), CANCEL_ROW],
    },
  });
  ctx.wizard.selectStep(2); // objective guard step
});

createCampaignScene.action(/^create:obj:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const obj = ctx.match[1];
  ctx.wizard.state.data.objective = obj;
  const label = OBJECTIVES.find(o => o.id === obj)?.label || obj;
  await ctx.reply(`✅ Objective: *${esc(label)}*`, { parse_mode: 'Markdown' });
  await ctx.reply('📝 *Campaign Name*\n\nGive your campaign a name (e.g. "Promo Lebaran 2025"):', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [CANCEL_ROW] },
  });
  ctx.wizard.selectStep(3); // consume name on next text
});

createCampaignScene.action(/^create:go$/, async (ctx) => handleCreateGo(ctx));
createCampaignScene.action(/^create:cancel$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.data = {};
  await ctx.reply('❌ Campaign creation cancelled.');
  try { await ctx.scene.leave(); } catch { /* ok */ }
});

async function handleCreateGo(ctx) {
  await ctx.answerCbQuery();
  const d = ctx.wizard.state.data;
  if (!d.accountId || !d.objective || !d.name || !d.dailyBudget) {
    return ctx.reply('⚠️ Incomplete data. Start again with /create.');
  }

  // Get the user's Meta API
  const repo = ctx.deps?.repos?.platformAccountsRepo;
  const acct = repo?.getByPlatform(ctx.userId, 'meta');
  if (!acct?.access_token) return ctx.reply('🔌 Connect a Meta account first via /settings.');
  const api = MetaAdsAPI.withToken(acct.access_token);

  await ctx.reply('🔄 Resolving ad account & creating campaign...');
  try {
    // Resolve the REAL Meta ad account ID (d.accountId is internal UUID, not Meta's)
    let realAccountId = acct.credentials?.ad_account_id;
    if (!realAccountId) {
      const adAccounts = await api.getAdAccounts();
      if (!adAccounts.length) throw new Error('No ad accounts found for this token');
      realAccountId = adAccounts[0].id;
    }
    const campaign = await api.createCampaign(realAccountId, {
      name: d.name,
      objective: d.objective,
      status: 'PAUSED',
      dailyBudget: d.dailyBudget,
    });

    if (!campaign?.id) throw new Error('No campaign ID returned');

    // Resolve a page owned by the token for creatives
    let pageId = '';
    try {
      const pages = await api.getPages ? await api.getPages() : [];
      pageId = pages[0]?.id || '';
    } catch { /* handled below */ }

    const targeting = d.targeting || {};
    // Campaign already has a budget — ad set must NOT carry its own budget
    // (Meta rejects combo with error_subcode 4834002).
    const adSet = await api.createAdSet(realAccountId, campaign.id, {
      name: `${d.name} - Ad Set`,
      dailyBudget: 0,
      targeting: {
        geo_locations: { countries: targeting.countries || ['ID'] },
        age_min: targeting.ageMin || 18,
        age_max: targeting.ageMax || 55,
        gender: targeting.gender || 0,
      },
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'LINK_CLICKS',
    });

    if (d.postId) {
      const data = await api._post(`/${realAccountId}/adcreatives`, {
        name: `${d.name} - Creative`,
        object_story_id: d.postId,
      });
      await api.createAd(realAccountId, {
        adsetId: adSet.id,
        creativeId: data.id,
        name: `${d.name} - Ad`,
        status: 'PAUSED',
      });
    } else {
      const creative = await api.createAdCreative(realAccountId, {
        name: `${d.name} - Creative`,
        pageId,
        message: d.name,
        headline: d.name,
        description: 'Created via AdForge Bot',
        linkUrl: 'https://example.com',
        ctaType: 'LEARN_MORE',
      });
      await api.createAd(realAccountId, {
        adsetId: adSet.id,
        creativeId: creative.id,
        name: `${d.name} - Ad`,
        status: 'PAUSED',
      });
    }

    await ctx.reply(
      `🎉 *Campaign Created!*\n\n` +
      `📝 ${esc(d.name)}\n` +
      `💰 ${fmtRp(d.dailyBudget)}/day · Status: ⏸ PAUSED\n\n` +
      `Activate via /ads → select account → Resume.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    log.error('create campaign failed', { userId: ctx.userId, error: err.message });
    // err.data = {error: {message, error_user_msg, ...}} — safeFetch wraps
    // the JSON body at err.data, and Meta bodies carry {error: {...}}.
    const metaErr = err.data?.error || {};
    const raw = `${err.message || ''} ${metaErr.error_user_msg || ''}`.toLowerCase();
    if (raw.includes('mode') && (raw.includes('perkembangan') || raw.includes('development'))) {
      await ctx.reply(
        '⚠️ *Creative gagal dibuat.*\n\n' +
        'Meta App kamu masih dalam *mode pengembangan* (development mode).\n' +
        'Creative (post/iklan) hanya bisa dibuat jika App sudah *publik* —\n' +
        'buka Meta App Dashboard → Settings → App Mode → *Live*.\n\n' +
        'Campaign + Ad Set sudah terbuat (PAUSED). Setelah App live, buat ulang iklannya.'
      );
    } else {
      await ctx.reply(`⚠️ Failed: ${esc(err.message).slice(0, 200)}`);
    }
  }
  try { await ctx.scene.leave(); } catch { /* ok */ }
}

export default createCampaignScene;
