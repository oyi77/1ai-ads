/**
 * /help command — full, accurate guide kept in sync with the handlers
 * actually registered in index.js and the buttons in mainMenuKeyboard().
 */

export function handleHelp() {
  return async (ctx) => {
    await ctx.reply(
      '❓ <b>AdForge Help</b>\n\n' +
      '<b>Perintah utama:</b>\n' +
      '/start — Menu utama &amp; onboarding\n' +
      '/menu — Buka semua fitur\n' +
      '/status — Ringkasan kampanye &amp; ROAS\n' +
      '/ads — Kelola akun iklan multi-platform\n' +
      '/create — Wizard buat kampanye baru\n' +
      '/monitor — Aturan otomatis (spend guard, alert)\n' +
      '/metaapp — Kredensial Meta App milik kamu\n' +
      '/settings — Token &amp; koneksi akun\n' +
      '/pricing — Lihat paket\n' +
      '/cancel — Batalkan wizard/flow aktif\n' +
      '/help — Pesan ini\n\n' +
      '<b>Quick actions:</b>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Dashboard', callback_data: 'menu:status' }, { text: '📣 Ads Manager', callback_data: 'menu:ads' }],
            [{ text: '⚡ Rules', callback_data: 'menu:monitor' }, { text: '🌐 Platforms', callback_data: 'menu:platforms' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
