/**
 * Connect Account Wizard — per-customer platform connection.
 * Entered with state { platform } from the /start connect buttons.
 * Stores the account scoped to the current user (ctx.userId from identify middleware).
 */
import { Scenes } from 'telegraf';
import { createLogger } from '../../lib/logger.js';

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

const platformLabel = (p) => PLATFORM_NAMES[p] || p || 'Ad Platform';

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
      `🔌 *Connecting ${platformLabel(platform)}*\n\n` +
        'What would you like to name this connection? (e.g. "Main Google Ads")',
      { parse_mode: 'Markdown' }
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
    await ctx.reply(
      `Got it — *${text}*.\n\n` +
        'Now paste the access token / API key for this account. ' +
        'It is encrypted at rest and scoped to your Telegram user only.',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  // Step 2 — capture token, persist, confirm
  async (ctx) => {
    const token = ctx.message?.text?.trim();
    if (!token) {
      await ctx.reply('Please paste your access token (just text).');
      return;
    }
    const { platform, accountName } = ctx.wizard.state;
    const repo = ctx.repos?.platformAccountsRepo;
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
      log.info('Platform account connected via bot', {
        userId: ctx.userId,
        platform,
        accountId: created?.id,
      });
      await ctx.reply(
        `✅ *${accountName}* connected for ${platformLabel(platform)}!\n\n` +
          'You can manage this account from the web dashboard or /status.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      log.error('Failed to store platform account', { userId: ctx.userId, platform, error: err.message });
      await ctx.reply('⚠️ Could not save the connection. Please try again or use the web dashboard.');
    }
    return ctx.scene.leave();
  }
);

export default connectScene;
