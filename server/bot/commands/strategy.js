/**
 * /strategy — Panduan cara pakai AdForge buat pemilik usaha yang belum
 * pernah ngiklan. Bahasa awam, tanpa istilah teknis, tanpa angka hasil yang
 * belum terbukti. Tujuannya: user tahu LANGKAH BERIKUTNYA, bukan ngerti ads.
 *
 * Setiap tombol di sini langsung menjalankan aksi nyata (bukan cuma bacaan),
 * jadi user nggak pernah mentok di layar teori.
 */
import { mainMenuKeyboard } from './menu.js';

const RULES = [
  {
    key: 'budget',
    label: '💰 Jaga budget',
    title: 'Stop budget kebakar',
    plain: 'Kalau iklan belanjanya udah lewat batas yang bos tentuin, saya pause sendiri.',
    when: 'Pakai ini kalau bos takut iklan jalan terus padahal duitnya udah keluar banyak.',
    make: 'Budget aman',
  },
  {
    key: 'boncos',
    label: '📉 Pause yang boncos',
    title: 'Pause iklan rugi',
    plain: 'Kalau iklan jualannya lebih kecil dari belanjanya, saya matiin biar nggak makin rugi.',
    when: 'Pakai ini buat semua campaign baru. Ini pengaman paling dasar.',
    make: 'Pause boncos',
  },
  {
    key: 'scale',
    label: '🚀 Naikin yang laris',
    title: 'Tambah budget iklan laris',
    plain: 'Kalau iklan jualannya bagus, saya naikin budget-nya pelan-pelan biar cuan-nya nambah.',
    when: 'Pakai setelah bos punya iklan yang jelas laris.',
    make: 'Naikin yang laris',
  },
];

const STEPS = [
  ['1️⃣ Hubungkan akun iklan', 'Saya butuh izin ke akun iklan bos biar bisa baca data & atur iklan. Sekali doang.', 'menu:connect', '🔗 Hubungkan Akun'],
  ['2️⃣ Pasang pengaman', 'Pilih minimal 1 aturan di bawah. Ini yang jaga duit bos pas bos nggak lagi mantengin HP.', 'rule:add:start', '⚡ Bikin Aturan'],
  ['3️⃣ Bikin iklan pertama', 'Saya pandu langkah per langkah — bos nggak perlu ngerti istilah iklan.', 'menu:create', '🎯 Buat Campaign'],
  ['4️⃣ Cek hasil tiap hari', 'Saya kirim laporan tiap pagi. Kalau ada yang perlu bos putusin, saya tanya dulu lewat chat.', 'menu:status', '📊 Lihat Dashboard'],
];

export function strategyText() {
  return (
    '🎓 <b>Bos, ini cara pakai AdForge — 4 langkah, bahasa manusia 🙏</b>\n\n' +
    '<b>Cara kerjanya simpel:</b> bos hubungkan akun iklan → saya jaga 24 jam → kalau ada yang perlu diubah, saya tanya bos dulu. <b>Saya nggak akan pernah utak-atik iklan bos tanpa bos setujui.</b>\n\n' +
    STEPS.map(([t, d]) => `<b>${t}</b>\n${d}`).join('\n\n')
  );
}

export function strategyKeyboard() {
  const rows = STEPS.map(([, , cb, label]) => [{ text: label, callback_data: cb }]);
  rows.push([{ text: '⚡ Aturan siap pakai', callback_data: 'strategy:templates' }]);
  rows.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }]);
  return { inline_keyboard: rows };
}

/** Template siap pakai: user tinggal pilih, saya yang rakit aturannya. */
export function strategyTemplatesText() {
  return (
    '⚡ <b>Bos, ini 3 pengaman yang paling sering dipakai 🙏</b>\n\n' +
    RULES.map(r => `<b>${r.label} — ${r.title}</b>\n${r.plain}\n<i>Kapan pakai: ${r.when}</i>`).join('\n\n') +
    '\n\nBos tinggal pencet yang bos mau, sisanya saya urus.'
  );
}

export function strategyTemplatesKeyboard() {
  const rows = RULES.map(r => [{ text: r.label, callback_data: `strategy:pick:${r.key}` }]);
  rows.push([{ text: '⬅️ Kembali ke Panduan', callback_data: 'strategy:home' }]);
  rows.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return { inline_keyboard: rows };
}

export function handleStrategy() {
  return async (ctx) => {
    await ctx.reply(strategyText(), { parse_mode: 'HTML', reply_markup: strategyKeyboard() });
  };
}

/**
 * Aksi tombol Strategi.
 * `templates` = daftar pengaman; `pick:<key>` = user sudah pilih, arahkan ke
 * wizard aturan yang sudah ada (satu sumber logika, nggak ada rule engine kedua).
 */
export function handleStrategyCallback() {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === 'home') {
      return ctx.reply(strategyText(), { parse_mode: 'HTML', reply_markup: strategyKeyboard() });
    }
    if (action === 'templates') {
      return ctx.reply(strategyTemplatesText(), { parse_mode: 'HTML', reply_markup: strategyTemplatesKeyboard() });
    }
    if (action.startsWith('pick:')) {
      const rule = RULES.find(r => r.key === action.slice(5));
      return ctx.reply(
        `✅ <b>Oke bos, saya siapin pengaman "${rule?.title || ''}" 🙏</b>\n\n` +
        'Bos pilih dulu <b>akun iklan</b> mana yang mau dijaga, habis itu saya pandu 3 pertanyaan singkat (nggak pakai istilah rumit).\n\n' +
        '<i>Kalau bos belum hubungkan akun iklan, pencet 🔗 Hubungkan Akun dulu ya.</i>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Mulai pilih akun', callback_data: 'rule:add:start' }],
              [{ text: '🔗 Hubungkan Akun', callback_data: 'menu:connect' }],
              [{ text: '⬅️ Kembali ke Panduan', callback_data: 'strategy:home' }],
            ],
          },
        }
      );
    }
    return ctx.reply('⚠️ Maaf bos, pilihan itu nggak saya kenal 🙏', {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
    });
  };
}
