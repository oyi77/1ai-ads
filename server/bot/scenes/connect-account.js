/**
 * Connect Account Wizard — per-customer platform connection.
 * Entered with state { platform } from the /start connect buttons.
 * Stores the account scoped to the current user (ctx.userId from identify middleware).
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';
import { sanitizeAccessToken } from '../../lib/token-sanitize.js';

const log = createLogger('bot:scene:connect');

export const PLATFORM_NAMES = {
  meta: 'Meta (Facebook/Instagram)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  twitter: 'Twitter/X Ads',
  snapchat: 'Snapchat Ads',
  pinterest: 'Pinterest Ads',
  microsoft: 'Microsoft/Bing Ads',
};

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
export const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'connect:cancel' }];

export async function validateMetaAccessToken(accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(
    `https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name`,
    { signal: AbortSignal.timeout(15000) }
  );
  const me = await res.json();
  if (!me || me.error) {
    throw new Error(me?.error?.message || 'Invalid Meta token');
  }
  return me;
}

/** Shared scene-cancel callback — usable from any wizard via its own prefix. */
export function handleSceneCancel(msg = '❌ Dibatalkan.') {
  return async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(msg);
    return ctx.scene.leave();
  };
}

export const connectScene = new Scenes.WizardScene(
  'connect-account',
  // Step 0 — capture platform, ask for account name
  async (ctx) => {
    const platform = ctx.scene.state?.platform || ctx.wizard.state.platform;
    if (!platform) {
      await ctx.reply('⚠️ No platform selected. Please tap a platform button from /start.');
      return ctx.scene.leave();
    }
    ctx.wizard.state.platform = platform;
    await ctx.reply(
      `🔌 <b>Connecting ${escapeMarkdown(PLATFORM_NAMES[platform] || platform)}</b>\n\n` +
      'What would you like to name this connection? (e.g. "Main Google Ads")',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    return ctx.wizard.next();
  },
  // Step 1 — capture account name, ask for token
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Please send a name for this connection (just text).');
      return;
    }
    ctx.wizard.state.accountName = text;
    const platform = ctx.wizard.state.platform;
    const isMeta = platform === 'meta';
    
    let msg = `Got it — <b>${escapeMarkdown(text)}</b>.\n\n`;
    
    if (isMeta) {
      msg +=
        '🔑 <b>How to get your Meta token:</b>\n' +
        '1. Open https://developers.facebook.com/tools/explorer/\n' +
        '2. Select your app (or create one)\n' +
        '3. Click "Generate Access Token"\n' +
        '4. Select permissions: ads_management, ads_read, business_management, pages_show_list\n' +
        '5. Paste the token below\n\n' +
        'Token is encrypted at rest and scoped to your Telegram user only.';
    } else {
      msg += 'Now paste the access token / API key for this account. It is encrypted at rest and scoped to your Telegram user only.';
    }
    
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } });
    return ctx.wizard.next();
  },
  // Step 2 — validate token, persist, confirm
  async (ctx) => {
    const token = sanitizeAccessToken(ctx.message?.text);
    if (!token) {
      await ctx.reply('Please paste your access token (just text).');
      return;
    }
    const { platform, accountName } = ctx.wizard.state;
    if (platform === 'meta') {
      try {
        await validateMetaAccessToken(token);
      } catch (err) {
        log.warn('Meta token rejected before persistence', { userId: ctx.userId, error: err.message });
        await ctx.reply('That Meta token was rejected. Please paste a fresh token from Graph API Explorer.');
        return;
      }
    }
    const repo = ctx.deps?.repos?.platformAccountsRepo;
    if (!repo) {
      await ctx.reply('⚠️ Storage unavailable. Please try again later.');
      return ctx.scene.leave();
    }
    try {
      const created = repo.create({
        user_id: ctx.userId,
        platform,
        account_name: accountName,
        credentials: { access_token: token },
      });
      // Enforce single-active invariant: only the newly connected account stays active.
      repo.setActiveAccountForUser(platform, created.id, ctx.userId);
      // Record first_sync milestone via the payments repo (the method lives on
      // PaymentsRepository, not PlatformAccountsRepository).
      try {
        ctx.deps?.repos?.paymentsRepo?.recordMilestone?.(ctx.userId, 'first_sync', { platform, accountId: created.id });
      } catch { /* milestone recording is best-effort */ }
      log.info('Platform account connected via bot', {
        userId: ctx.userId,
        platform,
        accountId: created?.id,
      });
      await ctx.reply(
        `✅ <b>${escapeMarkdown(accountName)}</b> connected for ${escapeMarkdown(PLATFORM_NAMES[platform] || platform)}!\n\n` +
        'You can manage this account from the web dashboard or /status.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      log.error('Failed to store platform account', { userId: ctx.userId, platform, error: err.message });
      await ctx.reply('⚠️ Could not save the connection. Please try again or use the web dashboard.');
    }
    return ctx.scene.leave();
  }
);

connectScene.action(/^connect:cancel$/, handleSceneCancel('❌ Koneksi dibatalkan.'));

export default connectScene;