/**
 * OAuth Connect Scene — for platforms using OAuth (Google, TikTok, LinkedIn).
 * Shows a button to start OAuth flow, then waits for callback completion.
*/
import { Scenes } from 'telegraf';


const PLATFORM_LABELS = {
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
};

const CANCEL_ROW = [{ text: '❌ Batal', callback_data: 'connect:cancel' }];

export const connectOAuthScene = new Scenes.WizardScene(
  'connect-oauth',
  // Step 0 — show connect button
  async (ctx) => {
    const platform = ctx.scene.state?.platform || ctx.wizard.state.platform;
    if (!platform || !PLATFORM_LABELS[platform]) {
      await ctx.reply('⚠️ Invalid platform. Please start over from /start.');
      return ctx.scene.leave();
    }
    ctx.wizard.state.platform = platform;

    const webAppUrl = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';
    const oauthUrl = `${webAppUrl}/api/oauth/${platform}/url`;

    const keyboard = {
      inline_keyboard: [
        [{ text: `🔗 Connect ${PLATFORM_LABELS[platform]}`, url: oauthUrl }],
        CANCEL_ROW,
      ],
    };

    await ctx.reply(
      `🔌 *Connect ${PLATFORM_LABELS[platform]} via OAuth*\n\n` +
      `Click the button below to authorize AdForge to access your ${PLATFORM_LABELS[platform]} account.\n` +
      `You'll be redirected to ${PLATFORM_LABELS[platform]} to sign in and grant permission.\n\n` +
      `After authorization, you'll be redirected back and this bot will confirm the connection.`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );

    return ctx.wizard.next();
  },
  // Step 1 — wait for user to complete OAuth (or timeout/cancel)
  async (ctx) => {
    // This step just waits. The OAuth callback handles the actual connection.
    // If user sends anything here, remind them to use the button.
    const platform = ctx.wizard.state.platform;
    await ctx.reply(
      `Please click the button above to connect ${PLATFORM_LABELS[platform]}. ` +
      `If you already completed the flow, the connection should appear in /status shortly.`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    // Stay in this step
    return;
  }
);

connectOAuthScene.action(/^connect:cancel$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ Koneksi dibatalkan.');
  return ctx.scene.leave();
});

export default connectOAuthScene;