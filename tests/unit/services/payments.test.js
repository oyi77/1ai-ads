import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { PaymentService } from '../../../server/services/payments.js';

describe('PaymentService', () => {
  let service;
  let mockPaymentsRepo;
  let mockUsersRepo;
  let mockScalev;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPaymentsRepo = {
      create: vi.fn().mockImplementation((data) => ({ id: 'pay_1', ...data })),
      findByOrderId: vi.fn(),
      findByUserId: vi.fn().mockReturnValue([]),
      updateStatus: vi.fn().mockImplementation((id, status) => ({ id, status })),
      updateMetadata: vi.fn(),
      findPlanById: vi.fn(),
      getScalevConfig: vi.fn(),
    };

    mockUsersRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    mockScalev = {
      createOrder: vi.fn().mockResolvedValue({ checkout_url: 'http://pay.test/checkout', order_id: 'ord_1' }),
      getOrder: vi.fn(),
    };

    service = new PaymentService(mockPaymentsRepo, mockUsersRepo, mockScalev);
  });

  it('should create instance with dependencies', () => {
    expect(service.paymentsRepo).toBe(mockPaymentsRepo);
    expect(service.usersRepo).toBe(mockUsersRepo);
    expect(service.scalevService).toBe(mockScalev);
  });

  describe('getPaymentStatus', () => {
    it('should return payment by orderId', () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({ id: 'pay_1', status: 'paid' });
      const result = service.getPaymentStatus('order_123');
      expect(result.status).toBe('paid');
      expect(mockPaymentsRepo.findByOrderId).toHaveBeenCalledWith('order_123');
    });
  });

  describe('listPayments', () => {
    it('should list payments for a user', () => {
      mockPaymentsRepo.findByUserId.mockReturnValue([{ id: 'pay_1' }]);
      const result = service.listPayments('user_1', { limit: 10 });
      expect(result).toHaveLength(1);
      expect(mockPaymentsRepo.findByUserId).toHaveBeenCalledWith('user_1', { limit: 10 });
    });
  });

  describe('initiatePayment', () => {
    it('should create payment record and process via scalev', async () => {
      mockPaymentsRepo.updateStatus.mockReturnValue({ id: 'pay_1', status: 'processing' });

      const result = await service.initiatePayment({
        userId: 'user_1', amount: 50000, currency: 'IDR', provider: 'scalev',
        metadata: { storeUniqueId: 'store_1', customerName: 'Test' },
      });

      expect(mockPaymentsRepo.create).toHaveBeenCalled();
      expect(mockScalev.createOrder).toHaveBeenCalled();
      expect(result.providerOrder.checkout_url).toBe('http://pay.test/checkout');
    });

    it('should return payment directly for non-scalev provider', async () => {
      const result = await service.initiatePayment({
        userId: 'user_1', amount: 50000, provider: 'stripe',
      });
      expect(result.id).toBe('pay_1');
      expect(mockScalev.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('_mapScalevStatus', () => {
    it('should map known statuses', () => {
      expect(service._mapScalevStatus('paid')).toBe('paid');
      expect(service._mapScalevStatus('failed')).toBe('failed');
      expect(service._mapScalevStatus('cancelled')).toBe('cancelled');
    });

    it('should return null for unknown status', () => {
      expect(service._mapScalevStatus('pending')).toBeNull();
    });
  });

  describe('checkPaymentStatusWithProvider', () => {
    it('should throw if payment not found', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue(null);
      await expect(service.checkPaymentStatusWithProvider('order_x'))
        .rejects.toThrow('Payment not found');
    });

    it('should return payment directly if already paid', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({ id: 'pay_1', status: 'paid' });
      const result = await service.checkPaymentStatusWithProvider('order_1');
      expect(result.status).toBe('paid');
    });

    it('should update status when provider returns paid', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({ id: 'pay_1', status: 'pending', provider: 'scalev' });
      mockScalev.getOrder.mockResolvedValue({ status: 'paid' });
      mockPaymentsRepo.updateStatus.mockReturnValue({ id: 'pay_1', status: 'paid' });

      const result = await service.checkPaymentStatusWithProvider('order_1');
      expect(mockScalev.getOrder).toHaveBeenCalledWith('order_1');
      expect(result.status).toBe('paid');
    });
  });

  describe('processWebhookEvent', () => {
    it('should handle order.paid event', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', user_id: 'user_1', status: 'processing',
        metadata: JSON.stringify({ planName: 'pro' }),
      });
      mockUsersRepo.update.mockReturnValue({ id: 'user_1', plan: 'pro', role: 'user' });

      const result = await service.processWebhookEvent({
        eventType: 'order.paid',
        order_id: 'order_1',
      });

      expect(result.success).toBe(true);
      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay_1', 'paid');
      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay_1', 'completed');
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user_1', { plan: 'pro' });
    });

    it('should handle enterprise plan upgrade with admin role', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', user_id: 'user_1', status: 'processing',
        metadata: { planName: 'Enterprise' },
      });
      mockUsersRepo.update.mockReturnValue({ id: 'user_1', plan: 'enterprise', role: 'admin' });

      await service.processWebhookEvent({
        eventType: 'order.paid',
        order_id: 'order_1',
      });

      expect(mockUsersRepo.update).toHaveBeenCalledWith('user_1', { plan: 'enterprise', role: 'admin' });
    });

    it('should handle order.shipped event', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', status: 'paid', metadata: {},
      });

      const result = await service.processWebhookEvent({
        eventType: 'order.shipped',
        order_id: 'order_1',
      });

      expect(result.success).toBe(true);
      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay_1', 'shipped');
    });

    it('should handle order.failed event', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', status: 'processing', metadata: {},
      });
      mockPaymentsRepo.updateStatus.mockReturnValue({ id: 'pay_1', status: 'failed' });

      const result = await service.processWebhookEvent({
        eventType: 'order.failed',
        order_id: 'order_1',
        failure_reason: 'Insufficient funds',
      });

      expect(result.success).toBe(true);
      expect(mockPaymentsRepo.updateMetadata).toHaveBeenCalled();
    });

    it('should handle order.cancelled event', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', status: 'processing', metadata: {},
      });

      const result = await service.processWebhookEvent({
        eventType: 'order.cancelled',
        order_id: 'order_1',
      });

      expect(result.success).toBe(true);
      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith('pay_1', 'cancelled');
    });

    it('should return error for missing event type', async () => {
      const result = await service.processWebhookEvent({});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing event type');
    });

    it('should return error for non-order events', async () => {
      const result = await service.processWebhookEvent({ eventType: 'user.created' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported event type');
    });

    it('should return error for missing order_id', async () => {
      const result = await service.processWebhookEvent({ eventType: 'order.paid' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing order_id');
    });

    it('should return error for unhandled order event type', async () => {
      mockPaymentsRepo.findByOrderId.mockReturnValue({
        id: 'pay_1', status: 'pending', metadata: {},
      });

      const result = await service.processWebhookEvent({
        eventType: 'order.refunded',
        order_id: 'order_1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unhandled event type');
    });
  });
});
