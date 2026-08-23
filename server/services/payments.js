import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

export class PaymentService {
  constructor(paymentsRepo, usersRepo) {
    this.paymentsRepo = paymentsRepo;
    this.usersRepo = usersRepo;
    this.paymentApiUrl = process.env['1AI_PAYMENT_URL'] || 'http://localhost:3100/api/payments';
    this.paymentApiKey = process.env['1AI_PAYMENT_API_KEY'] || '';
  }

  async initiatePayment({ userId, amount, currency, provider, metadata }) {
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this.paymentsRepo.create({
      userId, orderId, amount, currency: currency || 'IDR', provider: provider || '1ai-payment', metadata,
    });
    log.info('Payment initiated', { paymentId: payment.id, provider, amount });

    try {
      const paymentResult = await this._create1aiPayment(payment, metadata);
      return { ...payment, ...paymentResult };
    } catch (err) {
      this.paymentsRepo.updateStatus(payment.id, 'failed');
      log.error('Payment creation failed', { paymentId: payment.id, error: err.message });
      throw err;
    }
  }

  async _create1aiPayment(payment, metadata) {
    try {
      const payload = {
        order_id: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        description: metadata?.description || 'Payment',
        metadata,
      };

      const response = await fetch(`${this.paymentApiUrl}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.paymentApiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Payment API error: ${error.message || response.statusText}`);
      }

      const result = await response.json();
      this.paymentsRepo.updateStatus(payment.id, 'processing');
      log.info('Payment created via 1ai-payment API', { orderId: payment.orderId, checkoutUrl: result.checkout_url });
      return result;
    } catch (err) {
      log.error('Failed to create payment with 1ai-payment API', { orderId: payment.orderId, error: err.message });
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

    const paymentConfig = this.paymentsRepo.getPaymentConfig(plan.name.toLowerCase());
    if (!paymentConfig) throw new Error(`Payment configuration not found for plan: ${plan.name}`);

    return { plan, user, paymentConfig };
  }

  async createPayment(userId, planId) {
    log.info('Creating payment', { userId, planId });
    const { plan, user, paymentConfig } = await this._validatePaymentContext(userId, planId);
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this._createPaymentRecord(userId, plan, orderId, paymentConfig.amount);
    log.info('Payment record created', { paymentId: payment.id, orderId });
    const order = await this._create1aiOrder(paymentConfig, user, orderId);
    return { paymentId: payment.id, orderId, checkoutUrl: order.checkout_url, planName: plan.name, amount: paymentConfig.amount };
  }

  _createPaymentRecord(userId, plan, orderId, amount) {
    return this.paymentsRepo.create({
      userId, orderId, amount, currency: 'IDR', provider: '1ai-payment',
      metadata: { planId: plan.id, planName: plan.name, userId },
    });
  }

  async _create1aiOrder(paymentConfig, user, orderId) {
    try {
      const payload = {
        order_id: orderId,
        amount: paymentConfig.amount,
        currency: 'IDR',
        customer_name: user.username,
        customer_email: user.email,
        metadata: { planName: paymentConfig.planName },
      };

      const response = await fetch(`${this.paymentApiUrl}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.paymentApiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Payment API error: ${error.message || response.statusText}`);
      }

      const result = await response.json();
      log.info('Order created via 1ai-payment API', { orderId, checkoutUrl: result.checkout_url });
      return result;
    } catch (err) {
      log.error('Failed to create order with 1ai-payment API', { orderId, error: err.message });
      throw err;
    }
  }

  _mapPaymentStatus(apiStatus) {
    const statusMap = { paid: 'paid', failed: 'failed', cancelled: 'cancelled', processing: 'processing' };
    return statusMap[apiStatus] || null;
  }

  async checkPaymentStatusWithProvider(orderId) {
    log.info('Checking payment status with provider', { orderId });
    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending' && payment.status !== 'processing') return payment;

    try {
      const response = await fetch(`${this.paymentApiUrl}/status/${orderId}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.paymentApiKey,
        },
      });

      if (!response.ok) {
        log.error('Failed to check payment status', { orderId, status: response.status });
        return payment;
      }

      const result = await response.json();
      const newStatus = this._mapPaymentStatus(result.status);
      if (newStatus && newStatus !== payment.status) {
        const updated = this.paymentsRepo.updateStatus(payment.id, newStatus);
        log.info('Payment status updated from 1ai-payment API', { orderId, oldStatus: payment.status, newStatus });
        return updated;
      }
    } catch (err) {
      log.error('Failed to check payment status with 1ai-payment API', { orderId, error: err.message });
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
      // Verify webhook signature
      if (!this._verify1aiWebhookSignature(event)) {
        log.warn('Invalid webhook signature', { event });
        return { success: false, error: 'Invalid signature' };
      }

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

  _verify1aiWebhookSignature(event) {
    try {
      const signature = event.signature || event.headers?.['x-1ai-payment-signature'];
      if (!signature) {
        log.warn('Missing webhook signature');
        return false;
      }

      const orderId = event.order_id || event.payload?.order_id;
      const secret = orderId; // Using order_id as secret per contract
      const hmac = crypto.createHmac('sha256', secret);
      const payload = JSON.stringify(event.payload || event);
      hmac.update(payload);
      const computed = hmac.digest('hex');

      // Constant-time comparison to avoid timing side-channels (mirrors app.js Scalev check).
      const expectedBuf = Buffer.from(computed);
      const providedBuf = Buffer.from(signature);
      const isValid =
        expectedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf);
      if (!isValid) {
        log.warn('Webhook signature verification failed', { orderId });
      }
      return isValid;
    } catch (err) {
      log.error('Error verifying webhook signature', { error: err.message });
      return false;
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
