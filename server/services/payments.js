import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { ConfigurationError } from '../lib/errors.js';
import config from '../config/index.js';
const log = createLogger('payments');

// In-memory idempotency store (for single-instance). For multi-instance, use Redis.
const processedEvents = new Map(); // key: "orderId:eventType" -> timestamp
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function isEventProcessed(orderId, eventType) {
  const key = `${orderId}:${eventType}`;
  const ts = processedEvents.get(key);
  if (ts && Date.now() - ts < IDEMPOTENCY_TTL_MS) return true;
  processedEvents.set(key, Date.now());
  return false;
}

export class PaymentService {
  constructor(paymentsRepo, usersRepo) {
    this.paymentsRepo = paymentsRepo;
    this.usersRepo = usersRepo;
    // 1ai-payment merchant API base, e.g. http://172.17.0.1:3100/api/payments
    this.paymentApiUrl = process.env['1AI_PAYMENT_URL'] || 'http://localhost:3100/api/payments';
    this.paymentApiKey = process.env['1AI_PAYMENT_API_KEY'] || '';
    this.paymentGateway = config.paymentGateway || 'midtrans';
    this.webhookSecret = config.oneAiPaymentWebhookSecret || '';
    this.callbackUrl = `${config.publicBaseUrl}/api/payments/notify`;
  }

  async initiatePayment({ userId, amount, currency, provider, metadata }) {
    const orderId = `order_${uuidv4().slice(0, 8)}`;
    const payment = this.paymentsRepo.create({
      userId, orderId, amount, currency: currency || 'IDR', provider: provider || '1ai-payment', metadata,
    });
    log.info('Payment initiated', { paymentId: payment.id, provider, amount });

    try {
      const paymentResult = await this._create1aiOrder(
        { amount: payment.amount, planName: metadata?.planName || 'Payment' },
        { username: metadata?.customerName || 'customer', email: metadata?.customerEmail || '' },
        payment.orderId,
      );
      return { ...payment, ...paymentResult };
    } catch (err) {
      this.paymentsRepo.updateStatus(payment.id, 'failed');
      log.error('Payment creation failed', { paymentId: payment.id, error: err.message });
      throw err;
    }
  }

  getPaymentStatus(orderId) {
    return this.paymentsRepo.findByOrderId(orderId);
  }

  listPayments(userId, { limit } = {}) {
    return this.paymentsRepo.findByUserId(userId, { limit });
  }

  listPlans() {
    const plans = this.paymentsRepo.getAllPlans ? this.paymentsRepo.getAllPlans() : [];
    return plans.map(p => {
      const cfg = this.paymentsRepo.getPaymentConfig(p.name.toLowerCase());
      return {
        id: p.id,
        name: p.name,
        tier: p.tier,
        maxAds: p.max_ads,
        maxCampaigns: p.max_campaigns,
        maxPlatformAccounts: p.max_platform_accounts,
        features: (() => { try { return typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []); } catch { return []; } })(),
        amount: cfg ? cfg.amount : null,
        currency: 'IDR',
      };
    });
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
    try {
      const order = await this._create1aiOrder(paymentConfig, user, orderId);
      if (order.providerOrderId) {
        this.paymentsRepo.updateMetadata(payment.id, {
          ...(typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {}),
          providerOrderId: order.providerOrderId,
          checkoutUrl: order.checkoutUrl,
        });
      }
      return {
        paymentId: payment.id, orderId,
        checkoutUrl: order.checkoutUrl, providerOrderId: order.providerOrderId,
        planName: plan.name, amount: paymentConfig.amount,
      };
    } catch (err) {
      this.paymentsRepo.updateStatus(payment.id, 'failed');
      throw err;
    }
  }

  _createPaymentRecord(userId, plan, orderId, amount) {
    return this.paymentsRepo.create({
      userId, orderId, amount, currency: 'IDR', provider: '1ai-payment',
      metadata: { planId: plan.id, planName: plan.name, userId },
    });
  }

  /**
   * Create an order on the 1ai-payment service.
   * Contract (POST /api/payments): gateway + amount(int IDR) + callback_url required;
   * response { success, data: { id, status, payment_url, ... } }.
   */
  async _create1aiOrder(paymentConfig, user, orderId) {
    if (!this.paymentApiKey) {
      throw new ConfigurationError('1AI_PAYMENT_API_KEY not configured');
    }
    try {
      const payload = {
        gateway: this.paymentGateway,
        amount: Math.round(paymentConfig.amount),
        currency: 'IDR',
        callback_url: this.callbackUrl,
        project_order_id: orderId,
        idempotency_key: orderId,
        customer: { name: user.username, email: user.email || undefined },
        metadata: { planName: paymentConfig.planName },
      };

      const response = await fetch(this.paymentApiUrl, {
        method: 'POST',
        headers: {
          'X-API-Key': this.paymentApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Payment API error ${response.status}: ${result?.error?.message || result?.error || response.statusText}`);
      }

      const order = result.data || result;
      log.info('Order created via 1ai-payment API', { orderId, providerId: order.id, payment_url: order.payment_url });
      return { checkoutUrl: order.payment_url, providerOrderId: order.id, status: order.status };
    } catch (err) {
      log.error('Failed to create order with 1ai-payment API', { orderId, error: err.message });
      throw err;
    }
  }

  _mapPaymentStatus(apiStatus) {
    // 1ai-payment lifecycle: pending | success | failed | expired | cancelled | refunded
    const statusMap = {
      pending: 'processing',
      success: 'paid',
      paid: 'paid',
      failed: 'failed',
      expired: 'cancelled',
      cancelled: 'cancelled',
      refunded: 'refunded',
    };
    return statusMap[apiStatus] || null;
  }

  async checkPaymentStatusWithProvider(orderId) {
    log.info('Checking payment status with provider', { orderId });
    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'pending' && payment.status !== 'processing') return payment;

    const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {};
    const providerOrderId = meta.providerOrderId;
    if (!providerOrderId || !this.paymentApiKey) return payment;

    try {
      const response = await fetch(`${this.paymentApiUrl}/${providerOrderId}`, {
        method: 'GET',
        headers: { 'X-API-Key': this.paymentApiKey },
      });
      if (!response.ok) {
        log.error('Failed to check payment status', { orderId, status: response.status });
        return payment;
      }
      const result = await response.json();
      const order = result.data || result;
      const newStatus = this._mapPaymentStatus(order.status);
      if (newStatus && newStatus !== payment.status) {
        const updated = this.paymentsRepo.updateStatus(payment.id, newStatus);
        log.info('Payment status updated from 1ai-payment API', { orderId, oldStatus: payment.status, newStatus });
        if (newStatus === 'paid') {
          await this._handleOrderPaid(updated, meta);
          return this.paymentsRepo.findByOrderId(orderId);
        }
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
    const orderId = event.project_order_id || event.order_id || event.payload?.order_id;
    if (!orderId) return { error: { success: false, error: 'Missing order_id' } };
    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) return { error: { success: false, error: `Unknown order: ${orderId}` } };
    return { eventType, orderId, payment };
  }

  /**
   * Verify and process a callback forwarded by the 1ai-payment service.
   * Signature: X-Payment-Signature = HMAC-SHA256(rawBody, merchant webhook_secret).
   * Returns null when the request is not a 1ai-payment forwarded event (caller may
   * fall back to a legacy handler).
   */
  async processPaymentCallback(rawBody, signatureHeader) {
    if (!signatureHeader || !this.webhookSecret) return null;

    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const provided = String(signatureHeader).replace(/^sha256=/, '');
    const valid = expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    if (!valid) {
      return { success: false, status: 401, error: 'Invalid signature' };
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { success: false, status: 400, error: 'Invalid JSON' };
    }

    const status = String(body.status || '').toLowerCase();
    const resolved = this._resolvePaymentFromEvent({ ...body, eventType: `order.${status}` });
    if (resolved.error) return { success: false, status: 200, ...resolved.error };

    const { payment } = resolved;
    const eventType = `order.${status}`;

    // Idempotency: skip if already processed
    if (isEventProcessed(payment.order_id, eventType)) {
      log.info('Payment webhook: duplicate event ignored', { orderId: payment.order_id, eventType });
      return { success: true };
    }

    const metadata = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {};

    switch (status) {
      case 'success':
        await this._handleOrderPaid(payment, metadata);
        break;
      case 'failed':
        await this._handleOrderFailed(payment, metadata, body);
        break;
      case 'cancelled':
      case 'expired':
        await this._handleOrderCancelled(payment);
        break;
      default:
        log.info('Ignoring forwarded payment status', { status, orderId: payment.order_id });
    }
    return { success: true };
  }

  async processWebhookEvent(event) {
    try {
      const resolved = this._resolvePaymentFromEvent(event);
      if (resolved.error) return resolved.error;
      if (resolved.notOrder) return { success: false, error: 'Unsupported event type' };

      const { eventType, orderId, payment } = resolved;
      log.info('Processing webhook event', { eventType, event });

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

  async _handleOrderPaid(payment, metadata) {
    this.paymentsRepo.updateStatus(payment.id, 'paid');
    log.info('Payment status updated to paid', { paymentId: payment.id });

    if (metadata.planName) {
      const planName = metadata.planName.toLowerCase();
      // SECURITY: paying customers get plan features only — never operator
      // privileges. requireAdmin gates the approval/admin surface and must
      // stay reserved for real operators, not purchased plans.
      const userUpdateData = { plan: planName };
      // Paid plans expire; the daily subscription cron handles downgrade +
      // renewal nudge. Free has no expiry.
      if (planName !== 'free') {
        const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        userUpdateData.plan_expires_at = expires.toISOString();
      } else {
        userUpdateData.plan_expires_at = null;
      }
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
