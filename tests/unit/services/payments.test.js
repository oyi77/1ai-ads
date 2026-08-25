import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentService } from '../../../server/services/payments.js';

describe('PaymentService', () => {
  let mockPaymentsRepo;
  let mockUsersRepo;
  let service;

  beforeEach(() => {
    mockPaymentsRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByOrderId: vi.fn(),
      updateStatus: vi.fn(),
      updateMetadata: vi.fn(),
      findPlanById: vi.fn(),
      getPaymentConfig: vi.fn(),
      getAllPlans: vi.fn(() => []),
    };

    mockUsersRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    vi.stubGlobal('fetch', vi.fn());

    service = new PaymentService(mockPaymentsRepo, mockUsersRepo);
    // Use test URL + key
    service.paymentApiUrl = 'http://test-payment/api/payments';
    service.paymentApiKey = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createPayment', () => {
    const defaultPlan = { id: 'plan_pro', name: 'Pro' };
    const defaultUser = { id: 'user1', username: 'tester', email: 't@test.com', plan: 'free' };
    const defaultPaymentConfig = { amount: 499000, planName: 'Pro' };
    const defaultPaymentRecord = { id: 'pay1', order_id: 'order_abc', status: 'pending', metadata: JSON.stringify({ planId: 'plan_pro', planName: 'Pro', userId: 'user1' }) };
    // 1ai-payment contract: { success, data: { id, status, payment_url } }
    const defaultApiResponse = { success: true, data: { id: 'pay_ext1', status: 'pending', payment_url: 'https://checkout.test/order_abc' } };

    it('creates payment and returns checkout URL', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(defaultPlan);
      mockUsersRepo.findById.mockReturnValue(defaultUser);
      mockPaymentsRepo.getPaymentConfig.mockReturnValue(defaultPaymentConfig);
      mockPaymentsRepo.create.mockReturnValue(defaultPaymentRecord);
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => defaultApiResponse });

      const result = await service.createPayment('user1', 'plan_pro');

      expect(mockPaymentsRepo.findPlanById).toHaveBeenCalledWith('plan_pro');
      expect(mockPaymentsRepo.getPaymentConfig).toHaveBeenCalledWith('pro');
      expect(mockPaymentsRepo.create).toHaveBeenCalledWith({
        userId: 'user1',
        orderId: expect.stringMatching(/^order_/),
        amount: 499000,
        currency: 'IDR',
        provider: '1ai-payment',
        metadata: { planId: 'plan_pro', planName: 'Pro', userId: 'user1' },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      // POSTs to the collection root — NOT a legacy /create subpath
      expect(fetch.mock.calls[0][0]).toBe('http://test-payment/api/payments');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.gateway).toBeTruthy();
      expect(body.callback_url).toContain('/api/payments/notify');
      expect(body.idempotency_key).toBe(body.project_order_id);
      expect(result).toMatchObject({
        paymentId: 'pay1',
        checkoutUrl: 'https://checkout.test/order_abc',
        providerOrderId: 'pay_ext1',
        planName: 'Pro',
        amount: 499000,
      });
      expect(result.orderId).toMatch(/^order_/);
    });

    it('throws for invalid planId', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(null);

      await expect(service.createPayment('user1', 'bogus')).rejects.toThrow('Invalid plan ID');
    });

    it('throws when user not found', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(defaultPlan);
      mockUsersRepo.findById.mockReturnValue(null);

      await expect(service.createPayment('unknown', 'plan_pro')).rejects.toThrow('User not found');
    });

    it('throws when user already on the requested plan', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(defaultPlan);
      mockUsersRepo.findById.mockReturnValue({ ...defaultUser, plan: 'pro' });

      await expect(service.createPayment('user1', 'plan_pro')).rejects.toThrow('already on the Pro plan');
    });

    it('throws when payment config missing', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(defaultPlan);
      mockUsersRepo.findById.mockReturnValue(defaultUser);
      mockPaymentsRepo.getPaymentConfig.mockReturnValue(null);

      await expect(service.createPayment('user1', 'plan_pro')).rejects.toThrow('Payment configuration not found');
    });

    it('throws when payment API returns error', async () => {
      mockPaymentsRepo.findPlanById.mockReturnValue(defaultPlan);
      mockUsersRepo.findById.mockReturnValue(defaultUser);
      mockPaymentsRepo.getPaymentConfig.mockReturnValue(defaultPaymentConfig);
      mockPaymentsRepo.create.mockReturnValue(defaultPaymentRecord);
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid amount' } }),
      });

      await expect(service.createPayment('user1', 'plan_pro')).rejects.toThrow(/Payment API error/);
    });
  });

  describe('checkPaymentStatusWithProvider', () => {
    it('returns payment when status is not pending/processing', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay1', order_id: 'ord1', status: 'paid',
        metadata: JSON.stringify({ providerOrderId: 'pay_ext1' }),
      });

      const result = await service.checkPaymentStatusWithProvider('ord1');

      expect(fetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'paid' });
    });

    it('checks provider and updates when status changed to success (maps to paid)', async () => {
      const pending = {
        id: 'pay1', order_id: 'ord1', status: 'pending', user_id: 'user1',
        metadata: JSON.stringify({ planId: 'plan_pro', planName: 'Pro', userId: 'user1', providerOrderId: 'pay_ext1' }),
      };
      const updated = { id: 'pay1', order_id: 'ord1', status: 'paid' };
      // 1st call: initial lookup; 2nd call: refetch after plan upgrade
      mockPaymentsRepo.findByOrderId
        .mockReturnValueOnce(pending)
        .mockReturnValueOnce(updated);
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: 'pay_ext1', status: 'success' } }),
      });
      mockPaymentsRepo.updateStatus
        .mockReturnValueOnce(updated)   // paid
        .mockReturnValueOnce(updated);  // completed

      const result = await service.checkPaymentStatusWithProvider('ord1');

      // GET /api/payments/:providerOrderId (from metadata)
      expect(fetch.mock.calls[0][0]).toBe('http://test-payment/api/payments/pay_ext1');
      expect(fetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-key');
      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay1', 'paid');
      expect(result).toMatchObject(updated);
    });

    it('returns existing payment on network error', async () => {
      const pending = {
        id: 'pay1', order_id: 'ord1', status: 'pending',
        metadata: JSON.stringify({ providerOrderId: 'pay_ext1' }),
      };
      mockPaymentsRepo.findByOrderId.mockReturnValue(pending);
      vi.mocked(fetch).mockRejectedValue(new Error('network'));

      const result = await service.checkPaymentStatusWithProvider('ord1');

      expect(result).toMatchObject(pending);
    });

    it('throws when payment not found', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue(null);

      await expect(service.checkPaymentStatusWithProvider('nope')).rejects.toThrow('Payment not found');
    });
  });
});
