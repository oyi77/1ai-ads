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
      findPlanById: vi.fn(),
      getPaymentConfig: vi.fn(),
    };

    mockUsersRepo = {
      findById: vi.fn(),
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
    const defaultPaymentConfig = { storeUniqueId: 'store_pro', amount: 499000 };
    const defaultPaymentRecord = { id: 'pay1', order_id: 'order_abc', status: 'pending' };
    const defaultApiResponse = { checkout_url: 'https://checkout.test/order_abc' };

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
      expect(result).toMatchObject({
        paymentId: 'pay1',
        checkoutUrl: 'https://checkout.test/order_abc',
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
        json: async () => ({ message: 'Invalid amount' }),
      });

      await expect(service.createPayment('user1', 'plan_pro')).rejects.toThrow('Payment API error: Invalid amount');
    });
  });

  describe('checkPaymentStatusWithProvider', () => {
    it('returns payment when status is not pending/processing', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({ id: 'pay1', order_id: 'ord1', status: 'paid' });

      const result = await service.checkPaymentStatusWithProvider('ord1');

      expect(fetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'paid' });
    });

    it('checks provider and updates when status changed', async () => {
      const pending = { id: 'pay1', order_id: 'ord1', status: 'pending' };
      const updated = { id: 'pay1', order_id: 'ord1', status: 'paid' };
      mockPaymentsRepo.findByOrderId.mockReturnValue(pending);
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'paid' }),
      });
      mockPaymentsRepo.updateStatus.mockReturnValue(updated);

      const result = await service.checkPaymentStatusWithProvider('ord1');

      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay1', 'paid');
      expect(result).toMatchObject(updated);
    });

    it('returns existing payment on network error', async () => {
      const pending = { id: 'pay1', order_id: 'ord1', status: 'pending' };
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
