import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { PaymentService } from '../../../../server/services/payments.js';

const ENV_KEYS = ['1AI_PAYMENT_URL', '1AI_PAYMENT_API_KEY', '1AI_PAYMENT_WEBHOOK_SECRET', 'PAYMENT_GATEWAY', 'PUBLIC_BASE_URL'];
const OLD = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));

function makeRepo() {
  return {
    create: vi.fn(({ orderId }) => ({ id: 'p1', order_id: orderId, status: 'pending', amount: 99000, metadata: JSON.stringify({ planId: 'plan_pro', planName: 'Pro' }) })),
    findByOrderId: vi.fn(() => ({
      id: 'p1', order_id: 'order_x', user_id: 'u1', provider_ref: null,
      status: 'processing', metadata: JSON.stringify({ planId: 'plan_pro', planName: 'Pro', providerOrderId: 'pay_1' }),
    })),
    findPlanById: vi.fn(id => (id === 'plan_pro' ? { id, name: 'Pro' } : null)),
    getPaymentConfig: vi.fn(() => ({ amount: 99000, planName: 'Pro', gateway: 'midtrans' })),
    getAllPlans: vi.fn(() => [{ id: 'plan_free', name: 'Free', tier: 1, max_ads: 5, max_campaigns: 2, max_platform_accounts: 1, features: '[]' }]),
    updateStatus: vi.fn(() => ({ id: 'p1', status: 'updated' })),
    updateMetadata: vi.fn(),
    findByUserId: vi.fn(() => []),
    findById: vi.fn(() => null),
  };
}

function makeUsers() {
  return {
    findById: vi.fn(() => ({ id: 'u1', username: 'alice', email: 'a@b.c', plan: 'free' })),
    update: vi.fn(u => ({ id: u, plan: 'pro' })),
  };
}

describe('PaymentService — 1ai-payment contract', () => {
  beforeEach(() => {
    process.env['1AI_PAYMENT_URL'] = 'http://172.17.0.1:3100/api/payments';
    process.env['1AI_PAYMENT_API_KEY'] = '1pay_test';
    process.env['1AI_PAYMENT_WEBHOOK_SECRET'] = 'whsec_test';
    process.env.PAYMENT_GATEWAY = 'midtrans';
    process.env.PUBLIC_BASE_URL = 'https://adforge.example.com';
    return () => {
      for (const [k, v] of Object.entries(OLD)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
  });

  function svc() { return new PaymentService(makeRepo(), makeUsers()); }

  it('createPayment POSTs to /api/payments with gateway+callback_url+idempotency_key and extracts payment_url', async () => {
    const calls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ success: true, data: { id: 'pay_1', status: 'pending', payment_url: 'https://sandbox.midtrans.com/pay/abc' } }), { status: 201 });
    });
    try {
      const s = svc();
      const result = await s.createPayment('u1', 'plan_pro');
      expect(calls[0].url).toBe('http://172.17.0.1:3100/api/payments'); // NOT /create
      const body = JSON.parse(calls[0].init.body);
      expect(body.gateway).toBe('midtrans');
      expect(body.amount).toBe(99000);
      expect(body.callback_url).toBe('https://adforge.example.com/api/payments/notify');
      expect(body.idempotency_key).toBe(body.project_order_id);
      expect(result.checkoutUrl).toBe('https://sandbox.midtrans.com/pay/abc');
      expect(result.providerOrderId).toBe('pay_1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws ConfigurationError when API key missing', async () => {
    delete process.env['1AI_PAYMENT_API_KEY'];
    await expect(svc().createPayment('u1', 'plan_pro')).rejects.toThrow(/API_KEY not configured/);
  });

  it('processPaymentCallback verifies X-Payment-Signature HMAC over the raw body and upgrades plan on success', async () => {
    const crypto = await import('crypto');
    const payload = JSON.stringify({ event: 'payment.success', gateway: 'midtrans', project_order_id: 'order_x', status: 'success', metadata: {} });
    const sig = crypto.createHmac('sha256', 'whsec_test').update(payload).digest('hex');

    const repo = makeRepo();
    const users = makeUsers();
    const s = new PaymentService(repo, users);

    // wrong signature rejected
    const bad = await s.processPaymentCallback(Buffer.from(payload), 'deadbeef');
    expect(bad.success).toBe(false);

    // valid signature upgrades the plan
    const ok = await s.processPaymentCallback(Buffer.from(payload), sig);
    expect(ok.success).toBe(true);
    expect(users.update).toHaveBeenCalledWith('u1', expect.objectContaining({ plan: 'pro' }));
  });

  it('checkPaymentStatusWithProvider queries GET /api/payments/:providerOrderId and maps success->paid', async () => {
    const calls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ success: true, data: { id: 'pay_1', status: 'success' } }), { status: 200 });
    });
    try {
      const s = svc();
      await s.checkPaymentStatusWithProvider('order_x');
      expect(calls[0]).toBe('http://172.17.0.1:3100/api/payments/pay_1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('listPlans exposes amounts from payment config', () => {
    const plans = svc().listPlans();
    expect(plans[0].id).toBe('plan_free');
  });
});
