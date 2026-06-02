import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

export class PaymentService {
  constructor(paymentsRepo, usersRepo, scalevService) {
    this.paymentsRepo = paymentsRepo;
    this.usersRepo = usersRepo;
    this.scalevService = scalevService || { createOrder: () => Promise.resolve({ checkout_url: '', order_id: '' }) };
  }

  async initiatePayment({ userId, amount, currency, provider, metadata }) {
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this.paymentsRepo.create({
      userId, orderId, amount, currency: currency || 'IDR', provider: provider || 'scalev', metadata,
    });
    log.info('Payment initiated', { paymentId: payment.id, provider, amount });

    if (provider === 'scalev' && this.scalevService) {
      return this._processScalevPayment(payment, metadata);
    }
    return payment;
  }

  async _processScalevPayment(payment, metadata) {
    try {
      const order = await this.scalevService.createOrder({
        storeUniqueId: metadata?.storeUniqueId, customerName: metadata?.customerName,
        customerPhone: metadata?.customerPhone, customerEmail: metadata?.customerEmail,
        variantUniqueId: metadata?.variantUniqueId, quantity: metadata?.quantity || 1,
      });
      const updated = this.paymentsRepo.updateStatus(payment.id, 'processing');
      return { ...updated, providerOrder: order };
    } catch (err) {
      this.paymentsRepo.updateStatus(payment.id, 'failed');
      log.error('Scalev order creation failed', { paymentId: payment.id, error: err.message });
      throw err;
    }
  }

  getPaymentStatus(orderId) {
    return this.paymentsRepo.findByOrderId(orderId);
  }

  listPayments(userId, { limit } = {}) {
    return this.paymentsRepo.findByUserId(userId, { limit });
  }

  async _validatePaymentContext(userId, planId) {
    const plan = this.paymentsRepo.findPlanById(planId);
    if (!plan) throw new Error(`Invalid plan ID: ${planId}`);

    const user = this.usersRepo.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.plan === plan.name.toLowerCase()) throw new Error(`User is already on the ${plan.name} plan`);

    const scalevConfig = this.paymentsRepo.getScalevConfig(plan.name.toLowerCase());
    if (!scalevConfig) throw new Error(`Scalev configuration not found for plan: ${plan.name}`);

    return { plan, user, scalevConfig };
  }

  async createPayment(userId, planId) {
    log.info('Creating payment', { userId, planId });
    const { plan, user, scalevConfig } = await this._validatePaymentContext(userId, planId);
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this._createPaymentRecord(userId, plan, orderId, scalevConfig.amount);
    log.info('Payment record created', { paymentId: payment.id, orderId });
    const order = await this._createScalevOrder(scalevConfig, user, orderId);
    return { paymentId: payment.id, orderId, checkoutUrl: order.checkout_url, planName: plan.name, amount: scalevConfig.amount };
  }

  _createPaymentRecord(userId, plan, orderId, amount) {
    return this.paymentsRepo.create({
      userId, orderId, amount, currency: 'IDR', provider: 'scalev',
      metadata: { planId: plan.id, planName: plan.name, userId },
    });
  }

  async _createScalevOrder(scalevConfig, user, orderId) {
    const order = await this.scalevService.createOrder({
      storeUniqueId: scalevConfig.storeUniqueId,
      customerName: user.username, customerPhone: '', customerEmail: user.email,
      variantUniqueId: scalevConfig.variantUniqueId, quantity: 1,
    });
    log.info('Scalev order created', { orderId, checkoutUrl: order.checkout_url });
    return order;
  }

  _mapScalevStatus(scalevStatus) {
    const statusMap = { paid: 'paid', failed: 'failed', cancelled: 'cancelled' };
    return statusMap[scalevStatus] || null;
  }

  async checkPaymentStatusWithProvider(orderId) {
    log.info('Checking payment status with provider', { orderId });
    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending' && payment.status !== 'processing') return payment;

    if (payment.provider === 'scalev' && this.scalevService) {
      try {
        const order = await this.scalevService.getOrder(orderId);
        const newStatus = this._mapScalevStatus(order?.status);
        if (newStatus && newStatus !== payment.status) {
          const updated = this.paymentsRepo.updateStatus(payment.id, newStatus);
          log.info('Payment status updated from Scalev', { orderId, oldStatus: payment.status, newStatus });
          return updated;
        }
      } catch (err) {
        log.error('Failed to check payment status with Scalev', { orderId, error: err.message });
      }
    }
    return payment;
  }

  _resolvePaymentFromEvent(event) {
    const eventType = event.eventType || event.type;
    if (!eventType) {
      log.warn('Webhook event missing eventType or type', { event });
      return { error: { success: false, error: 'Missing event type' } };
    }
    if (!eventType.startsWith('order.')) return { notOrder: true };
    const orderId = event.order_id || event.payload?.order_id;
    if (!orderId) return { error: { success: false, error: 'Missing order_id' } };
    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) return { error: { success: false, error: 'Payment not found' } };
    return { eventType, orderId, payment };
  }

  async processWebhookEvent(event) {
    try {
      const resolved = this._resolvePaymentFromEvent(event);
      if (resolved.error) return resolved.error;
      if (resolved.notOrder) return { success: false, error: 'Unsupported event type' };

      const { eventType, orderId, payment } = resolved;
      log.info('Processing webhook event', { eventType, event });
      log.info('Found payment for webhook', { paymentId: payment.id, orderId, currentStatus: payment.status });

      const metadata = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {};
      const handlers = {
        'order.paid': () => this._handleOrderPaid(payment, metadata),
        'order.shipped': () => this._handleOrderShipped(payment),
        'order.failed': () => this._handleOrderFailed(payment, metadata, event),
        'order.cancelled': () => this._handleOrderCancelled(payment),
      };

      const handler = handlers[eventType];
      if (!handler) {
        log.warn('Unhandled webhook event type', { eventType, orderId });
        return { success: false, error: `Unhandled event type: ${eventType}` };
      }
      return handler();
    } catch (err) {
      log.error('Error processing webhook event', { error: err.message, event });
      return { success: false, error: err.message };
    }
  }

  _handleOrderPaid(payment, metadata) {
    this.paymentsRepo.updateStatus(payment.id, 'paid');
    log.info('Payment status updated to paid', { paymentId: payment.id });

    if (metadata.planName) {
      const planName = metadata.planName.toLowerCase();
      const userUpdateData = { plan: planName };
      if (planName === 'enterprise') userUpdateData.role = 'admin';

      const updatedUser = this.usersRepo.update(payment.user_id, userUpdateData);
      if (updatedUser) {
        log.info('User plan upgraded', { userId: payment.user_id, plan: planName, role: updatedUser.role });
      } else {
        log.error('Failed to update user plan', { userId: payment.user_id });
        return { success: false, error: 'Failed to update user plan' };
      }
    }

    this.paymentsRepo.updateStatus(payment.id, 'completed');
    log.info('Payment marked as completed', { paymentId: payment.id });
    return { success: true };
  }

  _handleOrderShipped(payment) {
    this.paymentsRepo.updateStatus(payment.id, 'shipped');
    log.info('Payment status updated to shipped', { paymentId: payment.id });
    log.info('Order shipped notification', { paymentId: payment.id, userId: payment.user_id });
    return { success: true };
  }

  _handleOrderFailed(payment, metadata, event) {
    const failureReason = event.failure_reason || event.payload?.failure_reason || 'Unknown reason';
    const updatedPayment = this.paymentsRepo.updateStatus(payment.id, 'failed');
    if (updatedPayment) {
      this.paymentsRepo.updateMetadata(payment.id, { ...metadata, failureReason, failedAt: new Date().toISOString() });
    }
    log.info('Payment status updated to failed', { paymentId: payment.id, reason: failureReason });
    return { success: true };
  }

  _handleOrderCancelled(payment) {
    this.paymentsRepo.updateStatus(payment.id, 'cancelled');
    log.info('Payment status updated to cancelled', { paymentId: payment.id });
    return { success: true };
  }
}
