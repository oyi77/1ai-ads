/**
 * Create Campaign WizardScene — full flow per user feedback:
 * select Business Manager → select ad account → objective → name → budget →
 * audience targeting → post ID → confirm → create
 *
 * Multi-tenant: reads ALL active Meta tokens for the user, aggregates
 * Business Managers and ad accounts across every token, and tracks which
 * token the user's selection belongs to.
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

/**
 * Get all active Meta tokens for the user.
 * Returns array of { account, access_token, api }.
 */
function getAllMetaTokens(ctx) {
  const repo = ctx.deps?.repos?.platformAccountsRepo;
  if (!repo) return [];
  const rows = repo.findByUserId?.(ctx.userId) || [];
  return rows
    .filter(r => r.platform === 'meta' && r.is_active === 1 && r.access_token)
    .map(r => ({ account: r, access_token: r.access_token, api: MetaAdsAPI.withToken(r.access_token) }));
}

/** Fetch /me/businesses for a single token. */
async function fetchBusinessesForToken(api) {
  if (!api) return [];
  try {
    const data = await api.getBusinesses();
    return (data || []).map(b => ({ id: b.id, name: b.name || b.id, verificationStatus: b.verificationStatus }));
  } catch {
    return [];
  }
}

/** Fetch /me/adaccounts for a single token. */
async function fetchAccountsForToken(api) {
  if (!api) return [];
  try {
    const accounts = await api.getAdAccounts();
    return (accounts || []).map(a => ({ id: a.id, name: a.name || a.id, status: a.status === 'active' ? 'active' : 'unknown' }));
  } catch {
    return [];
  }
}

/** Fetch ad accounts owned by a BM from a specific token, with personal fallback. */
async function fetchBmAccountsForToken(api, businessId) {
  if (!api) return [];
  try {
    const data = await api._get(`/${businessId}/owned_ad_accounts`, {
      fields: 'id,name,account_status,currency,balance,amount_spent',
      limit: '50',
    });
    const owned = (data.data || []).map(a => ({
      id: a.id,
      name: a.name || a.id,
      status: a.account_status === 1 ? 'active' : 'unknown',
    }));
    if (owned.length > 0) return owned;
    // Fallback: BM owns no accounts, use token's personal accounts
    return fetchAccountsForToken(api);
  } catch {
    return fetchAccountsForToken(api);
  }
}

export const createCampaignScene = new Scenes.WizardScene(
  'create-campaign',
  // Step 0: Aggregate tokens → show BM picker (or account fallback)
  async (ctx) => {
    ctx.wizard.state.data = {};
    ctx.wizard.state.confirmShown = false;

    const tokens = getAllMetaTokens(ctx);
    if (tokens.length === 0) {
      await ctx.reply('🔌 No Meta accounts connected. Connect one first via /settings.');
      return ctx.scene.leave();
    }

    // Aggregate businesses and accounts across ALL tokens
    const businessesByToken = []; // [{ token, business }]
    const accountsByToken = [];   // [{ token, account }]
    for (const t of tokens) {
      const businesses = await fetchBusinessesForToken(t.api);
      businesses.forEach(b => businessesByToken.push({ token: t, business: b }));
      const accounts = await fetchAccountsForToken(t.api);
      accounts.forEach(a => accountsByToken.push({ token: t, account: a }));
    }

    // Store for later steps
    ctx.wizard.state.tokens = tokens;
    ctx.wizard.state.businessesByToken = businessesByToken;
    ctx.wizard.state.accountsByToken = accountsByToken;

    const multiToken = tokens.length > 1;

    if (businessesByToken.length > 0) {
      // Show BM picker (with token prefix if user has multiple tokens)
      const keyboard = businessesByToken.map(({ token, business }) => {
        const prefix = multiToken ? `[${token.account.account_name}] ` : '';
        return [{
          text: `🏢 ${prefix}${business.name}`,
          callback_data: `create:bm:${business.id}`,
        }];
      });
      keyboard.push(CANCEL_ROW);
      await ctx.reply('📋 *Select Business Manager*\n\nWhich Business Manager owns the ad account you want to use?', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
      return ctx.wizard.next();
    }

    // No BMs across any token → fall back to personal accounts
    if (accountsByToken.length === 0) {
      await ctx.reply('🔌 No ad accounts found. Connect a Meta account first via /settings.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.accounts = accountsByToken.map(a => a.account);
    const keyboard = accountsByToken.map(({ token, account }) => {
      const prefix = multiToken ? `[${token.account.account_name}] ` : '';
      return [{
        text: `📘 ${prefix}${account.name}`,
        callback_data: `create:acct:${account.id}`,
      }];
    });
    keyboard.push(CANCEL_ROW);
    await ctx.reply('📋 *Select an ad account* to run the campaign in:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    // No BM selected — mark and jump to step 2 (account guard)
    ctx.wizard.state.data.businessId = 'none';
    return ctx.wizard.selectStep(2);
  },
  // Step 1: Stray-text guard — BM button press is required
  async (ctx) => {
    if (!ctx.wizard.state.data.businessId) {
      await ctx.reply('⚠️ Please select a Business Manager using the buttons above.');
      return;
    }
    await ctx.reply('⚠️ Please select a Business Manager using the buttons above.');
  },
  // Step 2: Stray-text guard — account button press is required
  async (ctx) => {
    if (!ctx.wizard.state.data.accountId) {
      await ctx.reply('⚠️ Please select an ad account using the buttons above.');
      return;
    }
  },
  // Step 3: Stray-text guard — objective button press is required
  async (ctx) => {
    if (!ctx.wizard.state.data.objective) {
      await ctx.reply('⚠️ Select an objective using the buttons above.');
      return;
    }
  },
  // Step 4: Name → budget
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (!text || text.length > 80 || text === '/skip') {
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
  // Step 5: Budget → adset/audience
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
  // Step 6: Audience → post ID
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
  // Step 7: Post ID → confirm
  async (ctx) => {
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
      `📘 Account: ${esc((ctx.wizard.state.accounts || []).find(a => a.id === d.accountId)?.name || d.accountId)}\n` +
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

// Wire scene callbacks: BM picker → account picker → objective picker → name prompt
createCampaignScene.action(/^create:bm:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const businessId = ctx.match[1];
  ctx.wizard.state.data.businessId = businessId;

  // Find which token owns this BM
  const entry = (ctx.wizard.state.businessesByToken || []).find(b => b.business.id === businessId);
  if (entry) {
    ctx.wizard.state.data.selectedToken = entry.token;
  }

  const bmName = entry?.business?.name || businessId;
  await ctx.reply(`✅ Business Manager selected: *${esc(bmName)}*`, { parse_mode: 'Markdown' });

  // Fetch + render account picker for this BM from the owning token
  const token = entry?.token || ctx.wizard.state.tokens?.[0];
  const accounts = await fetchBmAccountsForToken(token?.api, businessId);
  if (accounts.length === 0) {
    await ctx.reply('🔌 No ad accounts found for this Business Manager. Connect one first via /settings.');
    return ctx.scene.leave();
  }
  ctx.wizard.state.accounts = accounts;
  const multiToken = (ctx.wizard.state.tokens?.length || 0) > 1;
  const keyboard = accounts.map(a => {
    const prefix = multiToken && token ? `[${token.account.account_name}] ` : '';
    return [{
      text: `📘 ${prefix}${a.name}`,
      callback_data: `create:acct:${a.id}`,
    }];
  });
  keyboard.push(CANCEL_ROW);
  await ctx.reply('📋 *Select an ad account* to run the campaign in:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
  ctx.wizard.selectStep(2);
});

createCampaignScene.action(/^create:acct:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.match[1];
  ctx.wizard.state.data.accountId = accountId;

  // Find which token owns this account (for multi-token tracking)
  const entry = (ctx.wizard.state.accountsByToken || []).find(a => a.account.id === accountId);
  if (entry) {
    ctx.wizard.state.data.selectedToken = entry.token;
  }

  const name = (ctx.wizard.state.accounts || []).find(a => a.id === accountId)?.name || accountId;
  await ctx.reply(`✅ Account selected: *${esc(name)}*`, { parse_mode: 'Markdown' });
  await ctx.reply('🎯 *Campaign Objective*\n\nWhat is the goal of this campaign?', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [...OBJECTIVES.map(o => [{ text: o.label, callback_data: `create:obj:${o.id}` }]), CANCEL_ROW],
    },
  });
  ctx.wizard.selectStep(3);
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
  ctx.wizard.selectStep(4);
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

  // Use the token that owns the selected account/BM
  const selectedToken = d.selectedToken || ctx.wizard.state.tokens?.[0];
  const api = selectedToken?.api;
  if (!api) return ctx.reply('🔌 Connect a Meta account first via /settings.');

  await ctx.reply('🔄 Creating campaign...');
  try {
    const realAccountId = d.accountId;
    const campaign = await api.createCampaign(realAccountId, {
      name: d.name,
      objective: d.objective,
      status: 'PAUSED',
    });

    if (!campaign?.id) throw new Error('No campaign ID returned');

    let pageId = '';
    try {
      const pages = await api.getPages ? await api.getPages() : [];
      pageId = pages[0]?.id || '';
    } catch { /* handled below */ }

    const targeting = d.targeting || {};
    const adSet = await api.createAdSet(realAccountId, campaign.id, {
      name: `${d.name} - Ad Set`,
      dailyBudget: d.dailyBudget,
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
