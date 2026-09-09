/**
 * Create Campaign WizardScene — full flow:
 * BM -> account -> objective -> name -> budget -> audience ->
 * creative source (post picker / custom creative / manual ID / skip) -> confirm -> create
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';
import { MetaAdsAPI } from '../../services/meta/index.js';

const log = createLogger('bot:create');

const OBJECTIVES = [
  { id: 'OUTCOME_TRAFFIC', label: '\u{1F6A6} Traffic' },
  { id: 'OUTCOME_SALES', label: '\u{1F6D2} Sales' },
  { id: 'OUTCOME_LEADS', label: '\u{1F4CB} Leads' },
  { id: 'OUTCOME_ENGAGEMENT', label: '\u{1F4AC} Engagement' },
  { id: 'OUTCOME_AWARENESS', label: '\u{1F441} Brand Awareness' },
  { id: 'OUTCOME_APP_PROMOTION', label: '\u{1F4F1} App Install' },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtRp = n => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const CANCEL_ROW = [{ text: '\u274C Batal', callback_data: 'create:cancel' }];

function getAllMetaTokens(ctx) {
  const repo = ctx.deps?.repos?.platformAccountsRepo;
  if (!repo) return [];
  const rows = repo.findByUserId?.(ctx.userId) || [];
  return rows
    .filter(r => r.platform === 'meta' && r.is_active === 1 && r.access_token)
    .map(r => ({ account: r, access_token: r.access_token, api: MetaAdsAPI.withToken(r.access_token) }));
}

async function fetchBusinessesForToken(api) {
  if (!api) return [];
  try { const data = await api.getBusinesses(); return (data || []).map(b => ({ id: b.id, name: b.name || b.id })); }
  catch { return []; }
}

async function fetchAccountsForToken(api) {
  if (!api) return [];
  try { const accounts = await api.getAdAccounts(); return (accounts || []).map(a => ({ id: a.id, name: a.name || a.id, status: a.status === 'active' ? 'active' : 'unknown' })); }
  catch { return []; }
}

async function fetchBmAccountsForToken(api, businessId) {
  if (!api) return [];
  try {
    const data = await api._get(`/${businessId}/owned_ad_accounts`, { fields: 'id,name,account_status,currency,balance,amount_spent', limit: '50' });
    const owned = (data.data || []).map(a => ({ id: a.id, name: a.name || a.id, status: a.account_status === 1 ? 'active' : 'unknown' }));
    if (owned.length > 0) return owned;
    return fetchAccountsForToken(api);
  } catch { return fetchAccountsForToken(api); }
}

/** Show the confirmation/summary screen — reusable from step 7 and action callbacks */
async function showConfirmScreen(ctx) {
  if (ctx.wizard.state.confirmShown) return;
  const d = ctx.wizard.state.data;
  const targeting = d.targeting || {};
  const source = ctx.wizard.state.creativeSource;
  let mediaInfo = 'AI-generated';
  if (source === 'post') mediaInfo = `Post ${d.postId || '(pending)'}`;
  else if (source === 'manual') mediaInfo = `Post ${d.postId || '(pending)'}`;
  else if (source === 'skip') mediaInfo = 'AI-generated';
  else if (source === 'custom') { const cr = ctx.wizard.state.creative || {}; mediaInfo = `Custom ${ctx.wizard.state.creativeType} - ${cr.headline || '...'}`; }
  const summary = `CONFIRMATION\n\nAccount: ${esc((ctx.wizard.state.accounts || []).find(a => a.id === d.accountId)?.name || d.accountId)}\nObjective: ${esc(OBJECTIVES.find(o => o.id === d.objective)?.label || d.objective)}\nName: ${esc(d.name)}\nBudget: ${fmtRp(d.dailyBudget)}/day\nCountry: ${(targeting.countries || ['ID']).join(', ')}\nAge: ${targeting.ageMin || 18}-${targeting.ageMax || 55}\nGender: ${targeting.gender === 1 ? 'Male' : targeting.gender === 2 ? 'Female' : 'All'}\nInterests: ${(targeting.interests || []).join(', ') || 'None'}\nCreative: ${mediaInfo}\n\nStatus: PAUSED (safe to review)`;
  await ctx.reply(summary, { reply_markup: { inline_keyboard: [
    [{ text: 'Create Campaign', callback_data: 'create:go' }],
    [{ text: 'Back', callback_data: 'create:back' }],
    [{ text: 'Cancel', callback_data: 'create:cancel' }],
  ] } });
  ctx.wizard.state.confirmShown = true;
}

export const createCampaignScene = new Scenes.WizardScene(
  'create-campaign',
  // Step 0: BM picker
  async (ctx) => {
    ctx.wizard.state.data = {};
    ctx.wizard.state.confirmShown = false;
    ctx.wizard.state.postPickerShown = false;
    ctx.wizard.state.creative = {};
    ctx.wizard.state.creativeSource = null;
    ctx.wizard.state.creativeType = null;
    ctx.wizard.state.creativeStep = null;
    const tokens = getAllMetaTokens(ctx);
    if (tokens.length === 0) { await ctx.reply('No Meta accounts connected. Connect first via /settings.'); return ctx.scene.leave(); }
    const businessesByToken = []; const accountsByToken = [];
    for (const t of tokens) { const bs = await fetchBusinessesForToken(t.api); bs.forEach(b => businessesByToken.push({ token: t, business: b })); const acs = await fetchAccountsForToken(t.api); acs.forEach(a => accountsByToken.push({ token: t, account: a })); }
    ctx.wizard.state.tokens = tokens; ctx.wizard.state.businessesByToken = businessesByToken; ctx.wizard.state.accountsByToken = accountsByToken;
    const multiToken = tokens.length > 1;
    if (businessesByToken.length > 0) {
      const keyboard = businessesByToken.map(({ token, business }) => [{ text: `${multiToken ? '['+token.account.account_name+'] ' : ''}${business.name}`, callback_data: `create:bm:${business.id}` }]);
      keyboard.push(CANCEL_ROW);
      await ctx.reply('Select Business Manager:', { reply_markup: { inline_keyboard: keyboard } });
      return ctx.wizard.next();
    }
    if (accountsByToken.length === 0) { await ctx.reply('No ad accounts found. Connect first via /settings.'); return ctx.scene.leave(); }
    ctx.wizard.state.accounts = accountsByToken.map(a => a.account);
    const kb = accountsByToken.map(({ token, account }) => [{ text: `${multiToken ? '['+token.account.account_name+'] ' : ''}${account.name}`, callback_data: `create:acct:${account.id}` }]);
    kb.push(CANCEL_ROW);
    await ctx.reply('Select an ad account:', { reply_markup: { inline_keyboard: kb } });
    ctx.wizard.state.data.businessId = 'none';
    return ctx.wizard.selectStep(2);
  },
  // Step 1: BM guard
  async (ctx) => { if (!ctx.wizard.state.data.businessId) await ctx.reply('Please select a Business Manager using the buttons above.'); },
  // Step 2: Account guard
  async (ctx) => { if (!ctx.wizard.state.data.accountId) await ctx.reply('Please select an ad account using the buttons above.'); },
  // Step 3: Objective guard
  async (ctx) => { if (!ctx.wizard.state.data.objective) await ctx.reply('Select an objective using the buttons above.'); },
  // Step 4: Name -> budget
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (!text || text.length > 80 || text === '/skip') { await ctx.reply('Name must be 1-80 characters. Try again:'); return; }
    ctx.wizard.state.data.name = text;
    await ctx.reply('Enter daily budget in Rupiah (min Rp 10,000):', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 5: Budget -> audience
  async (ctx) => {
    const budget = parseInt((ctx.message?.text || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(budget) || budget < 10000) { await ctx.reply('Minimum budget is Rp 10,000. Try again:'); return; }
    ctx.wizard.state.data.dailyBudget = budget;
    await ctx.reply('Send audience targeting (Country: ID\\nAge: 18-45\\nGender: all\\nInterests: fashion, beauty) or /skip:', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 6: Audience -> creative source picker
  async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    if (text !== '/skip') {
      const lines = text.split('\n').reduce((acc, line) => { const [k,...v] = line.split(':'); if (k && v.length) acc[k.trim().toLowerCase()] = v.join(':').trim(); return acc; }, {});
      ctx.wizard.state.data.targeting = { countries: lines.country ? [lines.country.toUpperCase()] : ['ID'], ageMin: parseInt(lines.age?.split('-')[0]) || 18, ageMax: parseInt(lines.age?.split('-')[1]) || 55, gender: lines.gender === 'male' ? 1 : lines.gender === 'female' ? 2 : 0, interests: lines.interests ? lines.interests.split(',').map(s => s.trim()) : [] };
    } else {
      ctx.wizard.state.data.targeting = { countries: ['ID'], ageMin: 18, ageMax: 55, gender: 0, interests: [] };
    }
    await ctx.reply('Choose creative source:', { reply_markup: { inline_keyboard: [
      [{ text: 'Pick Post from Page', callback_data: 'create:src:post' }],
      [{ text: 'Custom Image Creative', callback_data: 'create:src:custom:image' }],
      [{ text: 'Custom Video Creative', callback_data: 'create:src:custom:video' }],
      [{ text: 'Text-only Creative', callback_data: 'create:src:custom:text' }],
      [{ text: 'Enter Post ID Manual', callback_data: 'create:src:manual' }],
      [{ text: 'Skip (AI-generate)', callback_data: 'create:src:skip' }],
      CANCEL_ROW,
    ] } });
    return ctx.wizard.next();
  },
  // Step 7: Creative handler
  async (ctx) => {
    const source = ctx.wizard.state.creativeSource;
    if (source === 'manual' && !ctx.wizard.state.data.postId) {
      const text = (ctx.message?.text || '').trim();
      if (text !== '/skip') {
        const postId = text.replace(/[^0-9]/g, '');
        if (!postId || postId.length < 5) { await ctx.reply('Invalid Post ID. Try again.'); return; }
        ctx.wizard.state.data.postId = postId;
        return showConfirmScreen(ctx);
      }
    }
    if (source === 'custom') {
      const cr = ctx.wizard.state.creative || {};
      const step = ctx.wizard.state.creativeStep;
      const ctype = ctx.wizard.state.creativeType;
      if (step === 'media' && (ctype === 'image' || ctype === 'video')) {
        const msgText = (ctx.message?.text || '').trim();
        const photo = ctx.message?.photo;
        const video = ctx.message?.video;
        if (ctype === 'image') {
          if (photo) { try { const file = await ctx.telegram.getFile(photo[photo.length - 1].file_id); const link = await ctx.telegram.getFileLink(file.file_id || file); cr.mediaUrl = link.href || link.toString(); } catch { cr.mediaUrl = ''; } }
          else if (msgText && /^https?:\/\//i.test(msgText)) { cr.mediaUrl = msgText; }
          else if (msgText === '/skip') { /* no media */ }
          else { await ctx.reply('Send image or image URL (http/https).'); return; }
        } else {
          if (video) { try { const file = await ctx.telegram.getFile(video.file_id); const link = await ctx.telegram.getFileLink(file.file_id || file); cr.mediaUrl = link.href || link.toString(); } catch { cr.mediaUrl = ''; } }
          else if (msgText && /^https?:\/\//i.test(msgText)) { cr.mediaUrl = msgText; }
          else if (msgText === '/skip') { /* no media */ }
          else { await ctx.reply('Send video or video URL (http/https).'); return; }
        }
        ctx.wizard.state.creativeStep = 'headline';
        await ctx.reply('Headline (max 40 chars):');
        return;
      }
      if (step === 'headline') {
        const msgText = (ctx.message?.text || '').trim();
        if (!msgText || msgText.length > 40) { await ctx.reply('Headline 1-40 chars. Try again:'); return; }
        cr.headline = msgText;
        ctx.wizard.state.creativeStep = 'description';
        await ctx.reply('Description (max 125 chars):');
        return;
      }
      if (step === 'description') {
        const msgText = (ctx.message?.text || '').trim();
        if (!msgText || msgText.length > 125) { await ctx.reply('Description 1-125 chars. Try again:'); return; }
        cr.description = msgText;
        ctx.wizard.state.creativeStep = 'link';
        await ctx.reply('Destination URL:');
        return;
      }
      if (step === 'link') {
        const msgText = (ctx.message?.text || '').trim();
        if (!msgText || !/^https?:\/\//i.test(msgText)) { await ctx.reply('Send a valid URL (http/https).'); return; }
        cr.linkUrl = msgText;
        ctx.wizard.state.creative = cr;
        ctx.wizard.state.creativeStep = 'preview';
        const mediaStatus = ctype === 'text' ? 'Placeholder' : (cr.mediaUrl ? 'Ready' : 'AI-generate');
        await ctx.reply(`Preview:\nType: ${ctype}\nHeadline: ${esc(cr.headline)}\nDescription: ${esc(cr.description)}\nLink: ${esc(cr.linkUrl)}\nMedia: ${mediaStatus}\n\nProceed?`, { reply_markup: { inline_keyboard: [
          [{ text: 'Confirm', callback_data: 'create:creative:confirm' }],
          [{ text: 'Redo', callback_data: 'create:creative:restart' }],
          CANCEL_ROW,
        ] } });
        return;
      }
      if (step === 'preview' || step === 'done') { await ctx.reply('Tap Confirm to proceed.', { reply_markup: { inline_keyboard: [[{ text: 'Confirm', callback_data: 'create:creative:confirm' }], CANCEL_ROW] } }); return; }
    }
    // If postId already set (from post picker callback or manual entry), show confirm
    if (ctx.wizard.state.data.postId && !ctx.wizard.state.confirmShown) {
      return showConfirmScreen(ctx);
    }

    // Skip flow: source='skip' with no postId/headline → show confirm
    if (source === 'skip' && !ctx.wizard.state.confirmShown) {
      return showConfirmScreen(ctx);
    }

    // Creative confirm: creativeStep='done' → show confirm
    if (ctx.wizard.state.creativeStep === 'done' && !ctx.wizard.state.confirmShown) {
      return showConfirmScreen(ctx);
    }

    if (!ctx.wizard.state.data.postId && !ctx.wizard.state.creative?.headline && source !== 'skip') {
      await ctx.reply('Select an option using the buttons above.', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    }
  },
  // Step 8: Confirm (fallback — step 7 shows confirm directly via showConfirmScreen)
  async (ctx) => {
    return showConfirmScreen(ctx);
  },
);

// Action: Post from Page
createCampaignScene.action(/^create:src:post$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.creativeSource = 'post';
  const api = (ctx.wizard.state.data.selectedToken || ctx.wizard.state.tokens?.[0])?.api;
  let pageId = ''; let pageAccessToken = '';
  try { const pages = await api?.getPages?.() || []; pageId = pages[0]?.id || ''; pageAccessToken = pages[0]?.accessToken || ''; } catch {}
  if (pageId && api) {
    try {
      const posts = await api.getPagePosts(pageId, { limit: 8, pageToken: pageAccessToken });
      if (posts.length > 0) {
        const rows = posts.map(p => [{ text: `${(p.message || '(no text)').slice(0, 40)}`, callback_data: `create:post:${p.id}` }]);
        rows.push([{ text: 'Enter custom Post ID', callback_data: 'create:src:manual' }]);
        rows.push(CANCEL_ROW);
        await ctx.reply('Pick a post from your Page:', { reply_markup: { inline_keyboard: rows } });
        ctx.wizard.state.postPickerShown = true;
        return;
      }
    } catch {}
  }
  await ctx.reply('No posts found. Enter Post ID manually:', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
});

// Action: User selected a specific post — set state; step 7 detects and shows confirm
createCampaignScene.action(/^create:post:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const postId = ctx.match[1];
  ctx.wizard.state.data.postId = postId;
  ctx.wizard.state.creativeSource = 'post';
  ctx.wizard.state.confirmShown = false;
  await ctx.reply(`Post selected: ${postId}`);
});

// Action: Manual Post ID
createCampaignScene.action(/^create:src:manual$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.creativeSource = 'manual';
  ctx.wizard.state.confirmShown = false;
  await ctx.reply('Enter Post ID (e.g. 1234567890123456):', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
});

// Action: Custom creative type
createCampaignScene.action(/^create:src:custom:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const ctype = ctx.match[1];
  ctx.wizard.state.creativeSource = 'custom';
  ctx.wizard.state.creativeType = ctype;
  ctx.wizard.state.creative = {};
  ctx.wizard.state.confirmShown = false;
  ctx.wizard.state.creativeStep = ctype === 'text' ? 'headline' : 'media';
  if (ctype === 'text') {
    ctx.wizard.state.creativeStep = 'headline';
    await ctx.reply('Text-only creative. Starting with headline.');
    await ctx.reply('Headline (max 40 chars):');
    return;
  }
  ctx.wizard.state.creativeStep = 'media';
  const label = ctype === 'image' ? 'Send image (photo or URL) for the ad:' : 'Send video (file or URL) for the ad:';
  await ctx.reply(label);
});

// Action: Skip — show confirm directly (no text follows this callback)
createCampaignScene.action(/^create:src:skip$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.creativeSource = 'skip';
  ctx.wizard.state.data.postId = undefined;
  ctx.wizard.state.confirmShown = false;
  return showConfirmScreen(ctx);
});

// Action: Creative confirm — show confirm screen directly
createCampaignScene.action(/^create:creative:confirm$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.creativeStep = 'done';
  ctx.wizard.state.confirmShown = false;
  return showConfirmScreen(ctx);
});

// Action: Creative restart
createCampaignScene.action(/^create:creative:restart$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.creative = {};
  ctx.wizard.state.creativeStep = null;
  ctx.wizard.state.creativeType = null;
  ctx.wizard.state.confirmShown = false;
  return ctx.wizard.selectStep(6);
});

// Action: Back
createCampaignScene.action(/^create:back$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.confirmShown = false;
  ctx.wizard.state.postPickerShown = false;
  return ctx.wizard.selectStep(6);
});

// Action: BM picker
createCampaignScene.action(/^create:bm:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const businessId = ctx.match[1];
  ctx.wizard.state.data.businessId = businessId;
  const entry = (ctx.wizard.state.businessesByToken || []).find(b => b.business.id === businessId);
  if (entry) ctx.wizard.state.data.selectedToken = entry.token;
  const bmName = entry?.business?.name || businessId;
  await ctx.reply(`Business Manager: ${bmName}`);
  const token = entry?.token || ctx.wizard.state.tokens?.[0];
  const accounts = await fetchBmAccountsForToken(token?.api, businessId);
  if (accounts.length === 0) { await ctx.reply('No ad accounts for this BM. Connect via /settings.'); return ctx.scene.leave(); }
  ctx.wizard.state.accounts = accounts;
  const multiToken = (ctx.wizard.state.tokens?.length || 0) > 1;
  const kb = accounts.map(a => [{ text: `${multiToken && token ? '['+token.account.account_name+'] ' : ''}${a.name}`, callback_data: `create:acct:${a.id}` }]);
  kb.push(CANCEL_ROW);
  await ctx.reply('Select an ad account:', { reply_markup: { inline_keyboard: kb } });
  ctx.wizard.selectStep(2);
});

// Action: Account picker
createCampaignScene.action(/^create:acct:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.match[1];
  ctx.wizard.state.data.accountId = accountId;
  const entry = (ctx.wizard.state.accountsByToken || []).find(a => a.account.id === accountId);
  if (entry) ctx.wizard.state.data.selectedToken = entry.token;
  const name = (ctx.wizard.state.accounts || []).find(a => a.id === accountId)?.name || accountId;
  await ctx.reply(`Account: ${name}`);
  await ctx.reply('Campaign Objective:', { reply_markup: { inline_keyboard: [...OBJECTIVES.map(o => [{ text: o.label, callback_data: `create:obj:${o.id}` }]), CANCEL_ROW] } });
  ctx.wizard.selectStep(3);
});

// Action: Objective picker
createCampaignScene.action(/^create:obj:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const obj = ctx.match[1];
  ctx.wizard.state.data.objective = obj;
  const label = OBJECTIVES.find(o => o.id === obj)?.label || obj;
  await ctx.reply(`Objective: ${label}`);
  await ctx.reply('Campaign Name (e.g. "Promo Lebaran 2025"):', { reply_markup: { inline_keyboard: [CANCEL_ROW] } });
  ctx.wizard.selectStep(4);
});

// Action: Create
createCampaignScene.action(/^create:go$/, async (ctx) => handleCreateGo(ctx));

// Action: Cancel
createCampaignScene.action(/^create:cancel$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.data = {};
  await ctx.reply('Campaign creation cancelled.');
  try { await ctx.scene.leave(); } catch { /* ok */ }
});

async function handleCreateGo(ctx) {
  await ctx.answerCbQuery();
  const d = ctx.wizard.state.data;
  if (!d.accountId || !d.objective || !d.name || !d.dailyBudget) { return ctx.reply('Incomplete data. Start again with /create.'); }
  const selectedToken = d.selectedToken || ctx.wizard.state.tokens?.[0];
  const api = selectedToken?.api;
  if (!api) return ctx.reply('Connect a Meta account first via /settings.');
  await ctx.reply('Creating campaign...');
  try {
    const realAccountId = d.accountId;
    const campaign = await api.createCampaign(realAccountId, { name: d.name, objective: d.objective, status: 'PAUSED' });
    if (!campaign?.id) throw new Error('No campaign ID returned');
    let pageId = '';
    try { const pages = await api.getPages ? await api.getPages() : []; pageId = pages[0]?.id || ''; } catch {}
    const targeting = d.targeting || {};
    let pixelId = '';
    try { const pixels = await api.getPixels ? await api.getPixels(realAccountId) : []; pixelId = pixels[0]?.id || ''; } catch {}
    const optimizationByObjective = { OUTCOME_TRAFFIC: 'LINK_CLICKS', OUTCOME_SALES: 'OFFSITE_CONVERSIONS', OUTCOME_LEADS: 'LEAD_GENERATION', OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT', OUTCOME_AWARENESS: 'REACH', OUTCOME_APP_PROMOTION: 'APP_INSTALLS' };
    const needsPixel = d.objective === 'OUTCOME_SALES' || d.objective === 'OUTCOME_LEADS';
    let optimizationGoal = optimizationByObjective[d.objective] || 'LINK_CLICKS';
    let promotedObject = null;
    let pixelFallbackNote = '';
    if (needsPixel) {
      if (pixelId) { promotedObject = { pixel_id: pixelId, custom_event_type: d.objective === 'OUTCOME_SALES' ? 'PURCHASE' : 'LEAD' }; }
      else { optimizationGoal = 'LINK_CLICKS'; pixelFallbackNote = '\nNo Meta Pixel found - ad set optimizes for traffic, not sales.'; }
    }
    const genderVal = targeting.gender || 0;
    const ageMin = Number(targeting.ageMin) || 18;
    const ageMax = Number(targeting.ageMax) || 55;
    const adSet = await api.createAdSet(realAccountId, campaign.id, { name: `${d.name} - Ad Set`, dailyBudget: d.dailyBudget, targeting: { geo_locations: { countries: targeting.countries || ['ID'] }, age_min: ageMin, age_max: ageMax, ...(genderVal === 1 ? { genders: [1] } : genderVal === 2 ? { genders: [2] } : {}) }, billingEvent: 'IMPRESSIONS', optimizationGoal, promotedObject });
    let adCreated = false;
    try {
      const source = ctx.wizard.state.creativeSource;
      if (source === 'post' || source === 'manual') {
        if (d.postId) {
          // Meta requires object_story_id in format {page_id}_{post_id}.
          // Resolve raw numeric IDs against the user's pages (page tokens can
          // fetch a raw post id and return the canonical compound form);
          // fall back to the first page when resolution fails.
          let storyId = await api.resolvePostId?.(d.postId);
          if (!storyId) storyId = pageId ? `${pageId}_${d.postId}` : d.postId;
          const data = await api._post(`/${realAccountId}/adcreatives`, { name: `${d.name} - Creative`, object_story_id: storyId });
          await api.createAd(realAccountId, { adsetId: adSet.id, creativeId: data.id, name: `${d.name} - Ad`, status: 'PAUSED' });
          adCreated = true;
        }
      } else if (source === 'custom') {
        const cr = ctx.wizard.state.creative || {};
        const ctype = ctx.wizard.state.creativeType;
        if (ctype === 'image' && cr.mediaUrl) {
          try {
            const imgData = await api._post(`/${realAccountId}/adimages`, { url: cr.mediaUrl });
            const imgs = imgData.images || {}; const firstKey = Object.keys(imgs)[0]; const imageHash = firstKey ? imgs[firstKey].hash : null;
            if (imageHash && pageId) { const creative = await api.createAdCreative(realAccountId, { name: `${d.name} - Creative`, pageId, message: cr.description || d.name, headline: cr.headline || d.name, description: cr.description || d.name, linkUrl: cr.linkUrl || `https://www.facebook.com/${pageId}`, imageHash, ctaType: 'LEARN_MORE' }); await api.createAd(realAccountId, { adsetId: adSet.id, creativeId: creative.id, name: `${d.name} - Ad`, status: 'PAUSED' }); adCreated = true; }
          } catch (e) { log.warn('Image upload failed, falling back to AI', { error: e.message }); }
        } else if (ctype === 'video' && cr.mediaUrl) {
          try {
            const vidData = await api.uploadAdVideo ? await api.uploadAdVideo(realAccountId, cr.mediaUrl) : null;
            const videoId = vidData?.id;
            if (videoId && pageId) { const creative = await api.createAdCreative(realAccountId, { name: `${d.name} - Creative`, pageId, message: cr.description || d.name, headline: cr.headline || d.name, description: cr.description || d.name, linkUrl: cr.linkUrl || `https://www.facebook.com/${pageId}`, videoId, ctaType: 'LEARN_MORE' }); await api.createAd(realAccountId, { adsetId: adSet.id, creativeId: creative.id, name: `${d.name} - Ad`, status: 'PAUSED' }); adCreated = true; }
          } catch (e) { log.warn('Video upload failed, falling back to AI', { error: e.message }); }
        } else if (ctype === 'text' && pageId) {
          const creative = await api.createAdCreative(realAccountId, { name: `${d.name} - Creative`, pageId, message: cr.description || d.name, headline: cr.headline || d.name, description: cr.description || d.name, linkUrl: cr.linkUrl || `https://www.facebook.com/${pageId}`, ctaType: 'LEARN_MORE' });
          await api.createAd(realAccountId, { adsetId: adSet.id, creativeId: creative.id, name: `${d.name} - Ad`, status: 'PAUSED' });
          adCreated = true;
        }
      }
      if (!adCreated && pageId) {
        const creative = await api.createAdCreative(realAccountId, { name: `${d.name} - Creative`, pageId, message: d.name, headline: d.name, description: 'Created via AdForge Bot', linkUrl: `https://www.facebook.com/${pageId}`, ctaType: 'LEARN_MORE' });
        await api.createAd(realAccountId, { adsetId: adSet.id, creativeId: creative.id, name: `${d.name} - Ad`, status: 'PAUSED' });
        adCreated = true;
      }
    } catch (creativeErr) {
      log.warn('Creative creation failed - campaign/adset still created', { error: creativeErr.message });
      await ctx.reply(`Campaign & Ad Set created, but creative failed: ${esc(creativeErr.message).slice(0, 200)}\n\nAdd a creative later from the Creative Library.`);
    }
    await ctx.reply((adCreated ? 'Campaign Created!\n\n' : 'Campaign & Ad Set created - ad NOT created.\n\n') + `${esc(d.name)}\nOptimasi: ${esc(optimizationGoal)}${promotedObject ? ' (pixel)' : ''}\n${fmtRp(d.dailyBudget)}/day - Status: PAUSED\n` + (pixelFallbackNote ? `${pixelFallbackNote}\n` : '') + (adCreated ? '\nActivate via /ads -> select account -> Resume.' : '\nAdd the ad from Creative Library, then activate via /ads.'));
  } catch (err) {
    log.error('create campaign failed', { userId: ctx.userId, error: err.message });
    const metaErr = err.data?.error || {};
    const raw = `${err.message || ''} ${metaErr.error_user_msg || ''}`.toLowerCase();
    if (raw.includes('mode') && (raw.includes('perkembangan') || raw.includes('pengembangan') || raw.includes('development'))) {
      await ctx.reply('Creative failed. Meta App is still in development mode. Set it to Live in Meta App Dashboard first.');
    } else {
      const detail = err.userMessage || err.data?.error?.error_user_msg || err.data?.error?.message || err.message;
      await ctx.reply(`Failed: ${esc(detail).slice(0, 300)}`);
    }
  }
  try { await ctx.scene.leave(); } catch { /* ok */ }
}

export default createCampaignScene;
