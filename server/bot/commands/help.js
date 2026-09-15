/**
 * /help — satu pintu dengan /menu (kontrak 2026-09-15): tidak ada lagi
 * dua layar mirip yang bikin pemula bingung. Render menu utama + penjelasan
 * tiap tombol. Single source of truth keyboard tetap mainMenuKeyboard().
 */
import { mainMenuKeyboard } from './menu.js';

export function handleHelp() {
  return async (ctx) => {
    await ctx.reply(
      '❓ <b>Bantuan AdForge — semua lewat tombol di bawah:</b>\n\n' +
      '📊 <b>Dashboard</b> — ringkasan akun iklan + campaign (aktif/nonaktif/dihapus) + laporan per akun\n' +
      '🎯 <b>Buat Campaign</b> — bikin iklan baru, dipandu langkah per langkah\n' +
      '🛠️ <b>Kelola Iklan</b> — Aturan otomatis, Saran AI, Ads Manager, Platform, Pengaturan, Harga\n' +
      '📱 <b>Mini App</b> — versi aplikasi di dalam Telegram\n\n' +
      '<b>Perintah cepat:</b> /status /create /monitor /ads /settings /cancel',
      {
        parse_mode: 'HTML',
        reply_markup: mainMenuKeyboard(),
      }
    );
  };
}
