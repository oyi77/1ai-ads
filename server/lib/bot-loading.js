/**
 * Bot loading UX — satu middleware global supaya user awam tidak mengira
 * tombolnya mati saat bot sedang kerja berat.
 *
 * Dua sinyal, dipasang sekali, berlaku ke SEMUA handler:
 *
 * 1. Tap balasan. `answerCbQuery()` tanpa teks menghapus spinner di tombol
 *    SEKETIKA, padahal handler masih jalan → tombol kelihatan "gak jalan".
 *    Wrapper mengubah bare call jadi toast "⏳ Memproses…" supaya user tahu
 *    tap-nya kebaca.
 * 2. Indikator mengetik. Dikirim hanya kalau handler lewat 800 ms — jadi
 *    balasan instan (menu, noop) tidak berkedip "typing". Diulang tiap 4 dtk
 *    karena indikator Telegram kedaluwarsa ~5 dtk.
 *
 * Semua best-effort: gagal kirim sinyal TIDAK boleh menggagalkan handler.
 */

/** Sekali kirim "sedang mengetik…". Tidak pernah throw. */
export async function showTyping(ctx) {
  try {
    await ctx.sendChatAction('typing');
  } catch { /* chat action best-effort */ }
}

const SLOW_MS = 800;      // di bawah ini = handler instan, jangan berkedip
const REPEAT_MS = 4000;   // indikator Telegram TTL ~5 dtk

/**
 * Middleware Telegraf. Pasang setelah `ctx.deps` di-set, sebelum handler.
 */
export function loadingIndicator() {
  return async (ctx, next) => {
    // (1) bare answerCbQuery → toast loading, bukan dismiss sunyi
    if (ctx.callbackQuery) {
      const orig = ctx.answerCbQuery.bind(ctx);
      ctx.answerCbQuery = async (text, extra) => {
        try {
          return text === undefined ? await orig('⏳ Memproses…') : await orig(text, extra);
        } catch {
          return undefined;
        }
      };
    }

    // (2) typing hanya kalau kerja berjalan lama
    let slow = false;
    const first = setTimeout(() => { slow = true; showTyping(ctx); }, SLOW_MS);
    const repeat = setInterval(() => { if (slow) showTyping(ctx); }, REPEAT_MS);
    first.unref?.();
    repeat.unref?.();
    try {
      return await next();
    } finally {
      clearTimeout(first);
      clearInterval(repeat);
    }
  };
}
