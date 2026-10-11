/**
 * /pricing — Paket AdForge: Rp 99.000 LIFETIME (sekali bayar).
 *
 * Tombol Beli bikin order duitku ASLI via paymentService.createPayment,
 * user bayar lewat tombol Bayar, callback /api/payments/notify naikkan
 * plan otomatis. findExpiredPaidPlans() hanya downgrade plan_expires_at
 * NOT NULL — enterprise + NULL = aktif selamanya (lihat _handleOrderPaid;
 * plan jualan manual digrant via /admin_grant dengan expires NULL).
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
    if (ctx.user?.plan === 'enterprise') {
      return ctx.reply(
        '✅ <b>Mantap bos, paket Lifetime sudah aktif 🙏</b>\n\nNggak ada yang perlu dibayar lagi.',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }]] } }
      );
    }
    const svc = ctx.deps?.services?.paymentService;
    if (!svc?.createPayment) {
      return ctx.reply('⚠️ Maaf bos, layanan pembayarannya lagi istirahat 🙏 Coba lagi nanti ya bos.');
    }
    let order;
    try {
      await ctx.reply('🔄 Bos, saya siapin link bayarnya ya…');
      // plan_pro = Rp 99rb (lihat settings payment_plan_pro). Beli sekali,
      // callback naikkan plan, aktivasi lifetime digrant via /admin_grant.
      order = await svc.createPayment(ctx.userId, 'plan_pro');
    } catch (err) {
      const msg = String(err?.message || '');
      if (/already on/i.test(msg)) {
        return ctx.reply('✅ Bos, bos sudah di paket itu. Nikmati fiturnya ya bos!');
      }
      return ctx.reply(`⚠️ Maaf bos, gagal saya buat link bayar 🙏 Coba lagi nanti ya bos.`);
    }
    if (!order?.checkoutUrl) {
      return ctx.reply('⚠️ Maaf bos, link bayarnya nggak balik 🙏 Coba lagi nanti ya bos.');
    }
    return ctx.reply(
      `💳 <b>Bos, bayar Rp ${Number(order.amount || PRICE).toLocaleString('id-ID')} — sekali bayar 🙏</b>\n\n` +
      `Bos pencet tombol di bawah ya (QRIS/VA/e-wallet via duitku). Setelah bayar, paket aktif otomatis max 5 menit bos 🙏\n\n` +
      `<i>Order: <code>${esc(order.orderId || '')}</code></i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Bayar Sekarang', url: order.checkoutUrl }],
            [{ text: '⬅️ Kembali ke Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
