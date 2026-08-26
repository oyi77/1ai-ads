/**
 * /help command — full, accurate guide kept in sync with the handlers
 * actually registered in index.js and the buttons in mainMenuKeyboard().
 */

export function handleHelp() {
  return async (ctx) => {
    await ctx.reply(
      '❓ *AdForge Help*\n\n' +
      '*Perintah utama:*\n' +
      '/start — Menu utama & onboarding\n' +
      '/menu — Buka semua fitur\n' +
      '/status — Ringkasan kampanye & ROAS\n' +
      '/ads — Kelola akun Meta Ads (pausa/resume/laporan)\n' +
      '/create — Wizard buat kampanye baru\n' +
      '/monitor — Aturan otomatis (spend guard, alert)\n' +
      '/metaapp — Kredensial Meta App milik kamu\n' +
      '/settings — Token & koneksi akun\n' +
      '/pricing — Lihat paket\n' +
      '/cancel — Batalkan wizard/flow yang sedang jalan\n' +
      '/help — Pesan ini\n\n' +
      '*Fitur:*\n' +
      '📊 Monitoring & analitik kampanye\n' +
      '🎯 Buat kampanye lewat wizard\n' +
      '⚡ Automation rules & spend guards\n' +
      '🤖 AI Optimize — saran optimasi dari data kampanye\n' +
      '📱 Mini App — dashboard penuh di dalam Telegram',
      { parse_mode: 'Markdown' }
    );
  };
}
