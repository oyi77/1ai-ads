/**
 * /help — satu pintu dengan /menu (kontrak 2026-09-15): tidak ada lagi
 * dua layar mirip yang bikin pemula bingung. Render menu utama + penjelasan
 * tiap tombol. Single source of truth keyboard tetap mainMenuKeyboard().
 */
import { mainMenuKeyboard } from './menu.js';

export function handleHelp() {
  return async (ctx) => {
    await ctx.reply(
      '❓ <b>Bos, ini panduan saya buat bos 🙏 — semua lewat tombol di bawah ya bos:</b>\n\n' +
      '📊 <b>Dashboard</b> — saya laporin ringkasan akun iklan + campaign bos (aktif/nonaktif/dihapus) + laporan per akun\n' +
      '🎯 <b>Buat Campaign</b> — saya bantu bikinin iklan baru bos, dipandu langkah per langkah\n' +
      '🛠️ <b>Kelola Iklan</b> — Aturan otomatis, Saran AI, Ads Manager, Platform, Pengaturan, Harga — tinggal bos tunjuk, saya yang kerjain\n' +
      '📱 <b>Mini App</b> — versi aplikasi di dalam Telegram, saya siapin juga buat bos\n\n' +
      '<b>Perintah cepat bos:</b> /status /create /monitor /ads /settings /cancel',
      {
        parse_mode: 'HTML',
        reply_markup: mainMenuKeyboard(),
      }
    );
  };
}
