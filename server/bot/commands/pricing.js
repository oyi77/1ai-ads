/**
 * /pricing command — plan overview + upgrade via 1ai-payment.
 * Tombol Bayar panggil paymentService.createPayment lalu kirim checkout URL
 * duitku. Tanpa ini funneling putus (user baca harga tapi tidak bisa bayar).
 */
export function handlePricing(_deps) {
  return async (ctx) => {
    const plan = ctx.user?.plan || 'free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    await ctx.reply(
      `💰 <b>Bos, ini pilihan paketnya buat bos</b>\n\n` +
      `Paketmu: <b>${planLabel}</b>\n\n` +
      '🆓 <b>Free</b> — 2 campaign, 1 akun iklan, analitik dasar\n' +
      '💎 <b>Pro — Rp 99.000/bln</b> — 10 campaign, 3 akun, optimasi AI\n' +
      '🏢 <b>Enterprise — Rp 499.000/bln</b> — unlimited + white-label\n\n' +
      '<i>Bayar via QRIS/VA/e-wallet (duitku). Paket aktif 30 hari, auto-ingatkan sebelum habis.</i>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💎 Bayar Pro — Rp 99rb', callback_data: 'pricing:pay:plan_pro' }],
            [{ text: '🏢 Bayar Enterprise — Rp 499rb', callback_data: 'pricing:pay:plan_enterprise' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}

/** Callback pricing:pay:<planId> — buat order + kirim link checkout. */
export function handlePricingCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();
    if (!action.startsWith('pay:')) return ctx.reply('⚠️ Maaf bos, pilihan nggak saya kenal 🙏');
    const planId = action.split(':')[1];
    const svc = deps?.services?.paymentService || ctx.deps?.services?.paymentService;
    if (!svc) return ctx.reply('⚠️ Maaf bos, layanan pembayarannya belum siap 🙏 Coba lagi nanti ya bos.');
    if (!ctx.userId) return ctx.reply('⚠️ Maaf bos, sesi bos habis 🙏 Kirim /start dulu ya bos.');
    try {
      await ctx.reply('🔄 Bos, saya nyiapin link bayar ya…');
      const order = await svc.createPayment(ctx.userId, planId);
      if (!order?.checkoutUrl) return ctx.reply('⚠️ Maaf bos, link bayarnya nggak balik 🙏 Coba lagi nanti ya bos.');
      return ctx.reply(
        `💳 <b>Bos, bayar ${order.planName || ''} — Rp ${Number(order.amount || 0).toLocaleString('id-ID')}</b>\n\nBos pencet tombol di bawah ya (QRIS/VA/e-wallet). Setelah bayar, paket aktif otomatis max 5 menit bos 🙏`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Bayar Sekarang', url: order.checkoutUrl }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    } catch (err) {
      const msg = String(err?.message || '');
      if (/already on/i.test(msg)) return ctx.reply('✅ Bos, bos sudah di paket itu. Nikmati fiturnya ya bos!');
      return ctx.reply(`⚠️ Maaf bos, gagal saya buat pembayaran: ${msg.slice(0, 120)} 🙏 Coba lagi nanti ya bos.`);
    }
  };
}
