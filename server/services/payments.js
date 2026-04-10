import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

export class PaymentService {
  constructor(paymentsRepo, usersRepo, scalevService) {
    this.paymentsRepo = paymentsRepo;
    this.usersRepo = usersRepo;
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

  listPayments(userId, { limit } = {}) {
    return this.paymentsRepo.findByUserId(userId, { limit });
  }

  async createPayment(userId, planId) {
    log.info('Creating payment', { userId, planId });

    // Validate plan exists
    const plan = this.paymentsRepo.findPlanById(planId);
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    // Get user details for Scalev order
    const user = this.usersRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already on this plan
    if (user.plan === plan.name.toLowerCase()) {
      throw new Error(`User is already on the ${plan.name} plan`);
    }

    // Get Scalev configuration for plan pricing
    const scalevConfig = this.paymentsRepo.getScalevConfig(plan.name.toLowerCase());
    if (!scalevConfig) {
      throw new Error(`Scalev configuration not found for plan: ${plan.name}`);
    }

    const { storeUniqueId, variantUniqueId, amount } = scalevConfig;

    // Generate unique order ID
    const orderId = `order_${uuidv4().slice(0, 8)}`;

    // Create payment record with status 'pending'
    const payment = this.paymentsRepo.create({
      userId,
      orderId,
      amount,
      currency: 'IDR',
      provider: 'scalev',
      metadata: {
        planId: plan.id,
        planName: plan.name,
        userId,
      },
    });

    log.info('Payment record created', { paymentId: payment.id, orderId });

    // Call ScalevService.createOrder()
    const order = await this.scalevService.createOrder({
      storeUniqueId,
      customerName: user.username,
      customerPhone: '',
      customerEmail: user.email,
      variantUniqueId,
      quantity: 1,
    });

    log.info('Scalev order created', { orderId, checkoutUrl: order.checkout_url });

    // Return order info including checkoutUrl
    return {
      paymentId: payment.id,
      orderId,
      checkoutUrl: order.checkout_url,
      planName: plan.name,
      amount,
    };
  }

  async checkPaymentStatusWithProvider(orderId) {
    log.info('Checking payment status with provider', { orderId });

    const payment = this.paymentsRepo.findByOrderId(orderId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Only check with Scalev if payment is pending
    if (payment.status !== 'pending' && payment.status !== 'processing') {
      return payment;
    }

    // Call Scalev API to get latest order status
    if (payment.provider === 'scalev' && this.scalevService) {
      try {
        const order = await this.scalevService.getOrder(orderId);
        if (order && order.status) {
          // Update payment status based on Scalev response
          const scalevStatus = order.status;
          let newStatus = payment.status;

          if (scalevStatus === 'paid') {
            newStatus = 'paid';
          } else if (scalevStatus === 'failed') {
            newStatus = 'failed';
          } else if (scalevStatus === 'cancelled') {
            newStatus = 'cancelled';
          }

          if (newStatus !== payment.status) {
            const updated = this.paymentsRepo.updateStatus(payment.id, newStatus);
            log.info('Payment status updated from Scalev', { orderId, oldStatus: payment.status, newStatus });
            return updated;
          }
        }
      } catch (err) {
        log.error('Failed to check payment status with Scalev', { orderId, error: err.message });
        // Return current payment status even if check fails
      }
    }

    return payment;
  }

  async processWebhookEvent(event) {
    try {
      // Parse event type from event.eventType or event.type
      const eventType = event.eventType || event.type;
      if (!eventType) {
        log.warn('Webhook event missing eventType or type', { event });
        return { success: false, error: 'Missing event type' };
      }

      log.info('Processing webhook event', { eventType, event });

      // Handle Scalev order events
      if (eventType.startsWith('order.')) {
        const orderId = event.order_id || event.payload?.order_id;
        if (!orderId) {
          log.warn('Webhook event missing order_id', { eventType });
          return { success: false, error: 'Missing order_id' };
        }

        // Find the payment record
        const payment = this.paymentsRepo.findByOrderId(orderId);
        if (!payment) {
          log.warn('Payment not found for order_id', { orderId, eventType });
          return { success: false, error: 'Payment not found' };
        }

        log.info('Found payment for webhook', { paymentId: payment.id, orderId, currentStatus: payment.status });

        // Parse metadata to get plan information
        const metadata = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata || {};

        switch (eventType) {
          case 'order.paid': {
            // Update payment status to 'paid'
            this.paymentsRepo.updateStatus(payment.id, 'paid');
            log.info('Payment status updated to paid', { paymentId: payment.id });

            // Upgrade user's plan
            if (metadata.planName) {
              const planName = metadata.planName.toLowerCase();
              const userUpdateData = { plan: planName };

              // Update role to 'admin' if enterprise plan
              if (planName === 'enterprise') {
                userUpdateData.role = 'admin';
              }

              const updatedUser = this.usersRepo.update(payment.user_id, userUpdateData);
              if (updatedUser) {
                log.info('User plan upgraded', { userId: payment.user_id, plan: planName, role: updatedUser.role });
              } else {
                log.error('Failed to update user plan', { userId: payment.user_id });
                return { success: false, error: 'Failed to update user plan' };
              }
            }

            // Mark payment record as completed
            this.paymentsRepo.updateStatus(payment.id, 'completed');
            log.info('Payment marked as completed', { paymentId: payment.id });

            return { success: true };
          }

          case 'order.shipped': {
            // Update payment status to 'shipped' (optional)
            this.paymentsRepo.updateStatus(payment.id, 'shipped');
            log.info('Payment status updated to shipped', { paymentId: payment.id });

            // Send notification (optional, for now just log)
            log.info('Order shipped notification', { paymentId: payment.id, userId: payment.user_id });

            return { success: true };
          }

          case 'order.failed': {
            // Update payment status to 'failed'
            const failureReason = event.failure_reason || event.payload?.failure_reason || 'Unknown reason';

            // Update payment with status and failure reason
            const updatedPayment = this.paymentsRepo.updateStatus(payment.id, 'failed');
            if (updatedPayment) {
              // Update metadata with failure reason
              const updatedMetadata = {
                ...metadata,
                failureReason,
                failedAt: new Date().toISOString()
              };
              this.paymentsRepo.updateMetadata(payment.id, updatedMetadata);
            }

            log.info('Payment status updated to failed', { paymentId: payment.id, reason: failureReason });

            return { success: true };
          }

          case 'order.cancelled': {
            // Update payment status to 'cancelled'
            this.paymentsRepo.updateStatus(payment.id, 'cancelled');
            log.info('Payment status updated to cancelled', { paymentId: payment.id });

            return { success: true };
          }

          default:
            log.warn('Unhandled webhook event type', { eventType, orderId });
            return { success: false, error: `Unhandled event type: ${eventType}` };
        }
      }

      return { success: false, error: 'Unsupported event type' };
    } catch (err) {
      log.error('Error processing webhook event', { error: err.message, event });
      return { success: false, error: err.message };
    }
  }
}
