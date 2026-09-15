/**
 * /help command — full, accurate guide kept in sync with the handlers
 * actually registered in index.js and the buttons in mainMenuKeyboard().
 */

export function handleHelp() {
  return async (ctx) => {
    await ctx.reply(
      '❓ <b>Bantuan AdForge</b>\n\n' +
      '<b>Perintah utama:</b>\n' +
      '/start — Menu utama & perkenalan\n' +
      '/menu — Buka semua fitur\n' +
      '/status — Dashboard: akun terhubung, campaign aktif/nonaktif/dihapus, draft\n' +
      '/ads — Kelola akun iklan + campaign per akun\n' +
      '/create — Bikin campaign baru (dipandu langkah per langkah)\n' +
      '/monitor — Aturan otomatis (jaga spend, alert)\n' +
      '/metaapp — Kredensial Meta App milikmu\n' +
      '/settings — Token & koneksi akun\n' +
      '/pricing — Lihat paket\n' +
      '/cancel — Batalkan langkah yang lagi jalan\n' +
      '/help — Pesan ini\n\n' +
      '<b>Aksi cepat:</b>',
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
