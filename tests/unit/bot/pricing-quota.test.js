import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn(() => ({ getAdAccounts: vi.fn(async () => []) })) },
}));

const { handlePricing, handlePricingCallback } =
  await import('../../../server/bot/commands/pricing.js');
const { handleMonitorCallback } =
  await import('../../../server/bot/commands/monitor.js');

function ctxWith({ user = {}, userId = 'u1', action = 'x', session = {} } = {}) {
  const replies = [];
  return {
    user, userId,
    match: ['pricing:' + action, action],
    answerCbQuery: vi.fn(async () => {}),
    reply: async (msg, opts) => { replies.push({ msg, opts }); return {}; },
    session,
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');

describe('pricing funnel — tombol bayar 1ai-payment', () => {
  it('/pricing tampilkan harga + tombol Bayar', async () => {
    const ctx = ctxWith({ user: { plan: 'free' } });
    await handlePricing({})(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Rp 99.000');
    expect(t).toContain('Rp 499.000');
    const flat = ctx._replies[0].opts.reply_markup.inline_keyboard.flat();
    expect(flat.map((b) => b.callback_data)).toContain('pricing:pay:plan_pro');
  });

  it('klik Bayar Pro → checkoutUrl duitku', async () => {
    const createPayment = vi.fn(async () => ({
      checkoutUrl: 'https://pay.example/checkout', providerOrderId: 'p1',
      planName: 'Pro', amount: 99000,
    }));
    const deps = { services: { paymentService: { createPayment } } };
    const ctx = ctxWith({ user: { plan: 'free' }, action: 'pay:plan_pro' });
    await handlePricingCallback(deps)(ctx);
    expect(createPayment).toHaveBeenCalledWith('u1', 'plan_pro');
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Bayar');
    const btns = ctx._replies[ctx._replies.length - 1].opts.reply_markup.inline_keyboard.flat();
    expect(btns[0].url).toBe('https://pay.example/checkout');
  });

  it('sudah Pro → tidak buat order ganda', async () => {
    const createPayment = vi.fn(async () => { throw new Error('User is already on the Pro plan'); });
    const deps = { services: { paymentService: { createPayment } } };
    const ctx = ctxWith({ user: { plan: 'free' }, action: 'pay:plan_pro' });
    await handlePricingCallback(deps)(ctx);
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('sudah di paket');
  });
});

describe('wizard quota — free max 3 aturan aktif', () => {
  function monitorDeps(rules) {
    return {
      repos: {
        platformAccountsRepo: { findByUserId: () => [{ id: 'c1', platform: 'meta', is_active: 1, credentials: { access_token: 'T' } }] },
        rulesRepo: { getAll: () => rules },
      },
    };
  }
  const R = (en) => ({ id: 'r' + Math.random(), enabled: en });

  it('free 3 aktif → ditolak + tombol upgrade', async () => {
    const ctx = ctxWith({ user: { plan: 'free', role: 'user' }, action: 'add:start', session: {} });
    ctx.match = ['rule:add:start', 'add:start'];
    await handleMonitorCallback(monitorDeps([R(true), R(true), R(true)]))(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('max 3');
    expect(t).toContain('Upgrade');
  });

  it('free 2 aktif → lolos ke pilih akun', async () => {
    const ctx = ctxWith({ user: { plan: 'free', role: 'user' }, action: 'add:start', session: {} });
    ctx.match = ['rule:add:start', 'add:start'];
    await handleMonitorCallback(monitorDeps([R(true), R(true), R(false)]))(ctx);
    expect(txt(ctx._replies[0])).toContain('Langkah 1/5');
  });

  it('pro unlimited → lolos walau 10 aktif', async () => {
    const ctx = ctxWith({ user: { plan: 'pro', role: 'user' }, action: 'add:start', session: {} });
    ctx.match = ['rule:add:start', 'add:start'];
    const rules = Array.from({ length: 10 }, () => R(true));
    await handleMonitorCallback(monitorDeps(rules))(ctx);
    expect(txt(ctx._replies[0])).toContain('Langkah 1/5');
  });
});
