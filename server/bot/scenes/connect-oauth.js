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
      await ctx.reply('⚠️ Maaf bos, platformnya nggak saya kenal 🙏 Mulai lagi dari /start ya bos.');
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
      `🔌 <b>Bos, saya hubungkan ${PLATFORM_LABELS[platform]} via OAuth ya</b>\n\n` +
      `Bos pencet tombol di bawah ya biar saya bisa akses akun ${PLATFORM_LABELS[platform]} bos.\n` +
      `Bos bakal dibuka ke ${PLATFORM_LABELS[platform]} buat login dan kasih izin ya bos.\n\n` +
      `Abis itu bos balik lagi ya, saya konfirmasi koneksinya bos.`,
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
      `Bos pencet tombol di atas ya buat hubungkan ${PLATFORM_LABELS[platform]}. ` +
      `Kalau bos udah selesai di browser, koneksinya muncul di /status bentar lagi bos. ` +
      `Bos ketik /done ya kalau udah selesai biar saya keluar dari sini bos.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [CANCEL_ROW] } }
    );
    // Stay in this step, but never trap the user: any /command (handled by
    // the scene-clear middleware) already exits; /done explicitly leaves.
    return;
  }
);

connectOAuthScene.command('done', async (ctx) => {
  await ctx.reply('✅ Siap bos, selesai! Bos cek /status ya buat akun yang baru terhubung 🙏');
  return ctx.scene.leave();
});

connectOAuthScene.action(/^connect:cancel$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ Siap bos, koneksinya saya batalkan 🙏');
  return ctx.scene.leave();
});

export default connectOAuthScene;