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
      `💰 <b>AdForge Pricing</b>\n\n` +
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
    if (!action.startsWith('pay:')) return ctx.reply('⚠️ Pilihan tidak dikenal.');
    const planId = action.split(':')[1];
    const svc = deps?.services?.paymentService || ctx.deps?.services?.paymentService;
    if (!svc) return ctx.reply('⚠️ Layanan pembayaran belum tersedia. Coba lagi nanti.');
    if (!ctx.userId) return ctx.reply('⚠️ Sesi habis. Kirim /start dulu ya.');
    try {
      await ctx.reply('🔄 Lagi nyiapin link bayar…');
      const order = await svc.createPayment(ctx.userId, planId);
      if (!order?.checkoutUrl) return ctx.reply('⚠️ Link bayar tidak kembali. Coba lagi nanti.');
      return ctx.reply(
        `💳 <b>Bayar ${order.planName || ''} — Rp ${Number(order.amount || 0).toLocaleString('id-ID')}</b>\n\nPencet tombol di bawah buat bayar (QRIS/VA/e-wallet). Setelah bayar, paket aktif otomatis max 5 menit.`,
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
      if (/already on/i.test(msg)) return ctx.reply('✅ Kamu sudah di paket itu. Nikmati fiturnya!');
      return ctx.reply(`⚠️ Gagal buat pembayaran: ${msg.slice(0, 120)}. Coba lagi nanti.`);
    }
  };
}
