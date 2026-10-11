/**
 * /pricing — Paket AdForge: Rp 99.000 LIFETIME (sekali bayar).
 *
 * Bos jual MANUAL (belum ada gateway). Jadi tombol bayar TIDAK bikin order
 * duitku — dia kirim lead ke chat admin + nawarin transfer manual.
 * Upgrade pun di-grant manual sama admin (plan=enterprise, expires NULL).
 *
 * Kenapa lifetime: plan_expires_at NULL TIDAK PERNAH di-downgrade — cek
 * findExpiredPaidPlans() di repositories/users.js: query-nya minta
 * `plan_expires_at IS NOT NULL`. Jadi enterprise + NULL = aktif selamanya.
 */
import { escapeHtml as esc } from '../../lib/escape.js';

const PRICE = 99000;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://adforge.aitradepulse.com';

export function pricingText(plan) {
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free';
  return (
    `💰 <b>Paket AdForge — Rp 99.000 SEKALI BAYAR</b>\n\n` +
    `Paketmu sekarang: <b>${planLabel}</b>\n\n` +
    '✅ <b>Base — Rp 99rb LIFETIME (sekali bayar, selamanya)</b>\n' +
    '• Kelola iklan Meta/Google/TikTok tanpa batas\n' +
    '• Akun iklan & campaign unlimited\n' +
    '• Aturan otomatis (jaga budget, pause boncos, scale)\n' +
    '• Saran AI + Creative Library\n' +
    '• Laporan harian & dashboard\n' +
    '• Mini App di dalam Telegram\n\n' +
    '➕ <b>Add-on (opsional, bisa beli kapan aja)</b>\n' +
    '• Landing Page — Rp 49rb\n' +
    '• Content + Social Bridge — Rp 49rb\n\n' +
    '<i>Bayar sekali, fitur selamanya. Nggak ada tagihan bulanan, nggak ada auto-debit.</i>'
  );
}

export function pricingKeyboard(plan) {
  const rows = [];
  if (plan === 'enterprise') {
    rows.push([{ text: '✅ Bos sudah di paket Lifetime', callback_data: 'pricing:active' }]);
  } else {
    rows.push([{ text: '💳 Beli Rp 99rb — Sekali Bayar', callback_data: 'pricing:order' }]);
  }
  rows.push([{ text: '📱 Buka Mini App', web_app: { url: WEB_APP_URL } }]);
  rows.push([{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }]);
  return { inline_keyboard: rows };
}

export function handlePricing() {
  return async (ctx) => {
    await ctx.reply(pricingText(ctx.user?.plan), {
      parse_mode: 'HTML',
      reply_markup: pricingKeyboard(ctx.user?.plan),
    });
  };
}

/** Tombol "Beli" → kirim lead ke admin + minta bukti transfer. */
export function handlePricingCallback() {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === 'active') {
      return ctx.reply(
        '✅ <b>Mantap bos, paket Lifetime aktif selamanya 🙏</b>\n\n' +
        'Nggak ada tagihan lanjutan, nggak ada tanggal expired. Bos tinggal pakai semua fiturnya ya bos.',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }]] } }
      );
    }

    if (action === 'proof') {
      return ctx.reply(
        '📸 <b>Siap bos, tinggal kirim fotonya ke chat ini 🙏</b>\n\n' +
        'Saya teruskan otomatis ke admin ya. Kalau belum punya nomor rekeningnya, bilang aja di sini bos.',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }]] } }
      );
    }

    if (action !== 'order') {
      return ctx.reply('⚠️ Maaf bos, pilihan nggak saya kenal 🙏 Buka /pricing lagi ya bos.');
    }
    if (!ctx.userId) {
      return ctx.reply('⚠️ Maaf bos, sesi bos habis 🙏 Kirim /start dulu ya bos.');
    }

    // Lead ke admin: bos proses manual (transfer + grant enterprise).
    const uname = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'tanpa nama');
    let adminNotified = false;
    try {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (chatId && ctx.telegram) {
        await ctx.telegram.sendMessage(
          chatId,
          `🔔 <b>LEAD BARU — Paket Lifetime Rp 99rb</b>\n\n` +
          `User: ${esc(uname)}\n` +
          `User ID: <code>${esc(String(ctx.userId))}</code>\n` +
          `Telegram ID: <code>${esc(String(ctx.from?.id || '-'))}</code>\n` +
          `Plan sekarang: ${esc(ctx.user?.plan || 'free')}\n\n` +
          `Langkah: konfirmasi transfer → jalankan\n` +
          `<code>docker exec 1ai-ads node -e "const D=require('better-sqlite3');const db=new D('/app/data/1ai-ads.db');db.prepare(\\\"UPDATE users SET plan='enterprise', plan_expires_at=NULL WHERE id=?\\\").run('${esc(String(ctx.userId))}')"</code>\n` +
          `lalu restart container (WAL).`,
          { parse_mode: 'HTML' }
        );
        adminNotified = true;
      }
    } catch {
      // jangan bocorin error ke user; tetap lanjut
    }

    return ctx.reply(
      '💳 <b>Siap bos, ini cara beli Lifetime-nya 🙏</b>\n\n' +
      `💰 <b>Rp ${PRICE.toLocaleString('id-ID')}</b> — <b>sekali bayar, selamanya</b>\n\n` +
      '<b>Langkahnya gampang bos:</b>\n' +
      '1️⃣ Transfer Rp 99.000 ke rekening/e-wallet admin\n' +
      '2️⃣ Kirim <b>bukti transfer</b> ke chat ini (foto/SS aja)\n' +
      '3️⃣ Admin aktifin paketnya, bos saya kabarin di sini\n\n' +
      `<i>${adminNotified ? 'Lead bos sudah saya kabarin ke admin, tunggu balasan ya 🙏' : 'Chat admin buat minta nomor transfer ya bos 🙏'}</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📷 Kirim Bukti Transfer', callback_data: 'pricing:proof' }],
            [{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
