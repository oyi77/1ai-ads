import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

export class PaymentService {
  constructor(paymentsRepo, scalevService) {
    this.paymentsRepo = paymentsRepo;
    this.scalevService = scalevService;
  }

  async initiatePayment({ userId, amount, currency, provider, metadata }) {
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this.paymentsRepo.create({
      userId,
      orderId,
      amount,
      currency: currency || 'IDR',
      provider: provider || 'scalev',
      metadata,
    });

    log.info('Payment initiated', { paymentId: payment.id, provider, amount });

    // For Scalev provider, create a checkout order
    if (provider === 'scalev' && this.scalevService) {
      try {
        const order = await this.scalevService.createOrder({
          storeUniqueId: metadata?.storeUniqueId,
          customerName: metadata?.customerName,
          customerPhone: metadata?.customerPhone,
          customerEmail: metadata?.customerEmail,
          variantUniqueId: metadata?.variantUniqueId,
          quantity: metadata?.quantity || 1,
        });

        // Update payment with provider reference
        const updated = this.paymentsRepo.updateStatus(payment.id, 'processing');
        return { ...updated, providerOrder: order };
      } catch (err) {
        this.paymentsRepo.updateStatus(payment.id, 'failed');
        log.error('Scalev order creation failed', { paymentId: payment.id, error: err.message });
        throw err;
      }
    }

    return payment;
  }

  getPaymentStatus(orderId) {
    return this.paymentsRepo.findByOrderId(orderId);
  }

  listPayments(userId) {
    return this.paymentsRepo.findByUserId(userId);
  }

  processWebhookEvent({ source, eventType, payload }) {
    log.info('Processing webhook event', { source, eventType });

    if (source === 'scalev' && payload?.order_id) {
      const payment = this.paymentsRepo.findByOrderId(payload.order_id);
      if (payment) {
        const newStatus = eventType === 'paid' ? 'completed' : eventType === 'failed' ? 'failed' : eventType === 'refunded' ? 'refunded' : payment.status;
        this.paymentsRepo.updateStatus(payment.id, newStatus);
        return { updated: true, paymentId: payment.id, newStatus };
      }
    }

    return { updated: false };
  }
}
