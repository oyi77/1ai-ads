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
      await ctx.reply('⚠️ Platform nggak dikenal. Mulai lagi dari /start ya.');
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
      `🔌 <b>Hubungkan ${PLATFORM_LABELS[platform]} via OAuth</b>\n\n` +
      `Pencet tombol di bawah biar AdForge bisa akses akun ${PLATFORM_LABELS[platform]}-mu.\n` +
      `Kamu bakal dibuka ke ${PLATFORM_LABELS[platform]} buat login dan kasih izin.\n\n` +
      `Abis itu kamu balik lagi dan bot konfirmasi koneksinya.`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );

    return ctx.wizard.next();
  },
  // Step 1 — wait for user to complete OAuth (or timeout/cancel)
  async (ctx) => {
    // This step just waits. The OAuth callback handles the actual connection.
    // If user sends anything here, remind them to use the button.
    const platform = ctx.wizard.state.platform;
    await ctx.reply(
      `Pencet tombol di atas buat hubungkan ${PLATFORM_LABELS[platform]}. ` +
      `Kalau udah selesai di browser, koneksinya muncul di /status bentar lagi. ` +
      `Ketik /done kalau udah selesai biar keluar dari sini.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    // Stay in this step, but never trap the user: any /command (handled by
    // the scene-clear middleware) already exits; /done explicitly leaves.
    return;
  }
);

connectOAuthScene.command('done', async (ctx) => {
  await ctx.reply('✅ Selesai. Cek /status untuk akun yang baru terhubung.');
  return ctx.scene.leave();
});

connectOAuthScene.action(/^connect:cancel$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ Koneksi dibatalkan.');
  return ctx.scene.leave();
});

export default connectOAuthScene;