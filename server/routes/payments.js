import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

const AVAILABLE_PLANS = ['plan_free', 'plan_pro', 'plan_enterprise'];

/**
 * Helper function to convert payment status to user-friendly display text
 */
function getStatusDisplayText(status) {
  const statusMap = {
    pending: 'Menunggu Pembayaran',
    processing: 'Sedang Diproses',
    paid: 'Pembayaran Berhasil',
    completed: 'Selesai',
    shipped: 'Dikirim',
    failed: 'Gagal',
    cancelled: 'Dibatalkan',
  };
  return statusMap[status] || status;
}

export function createPaymentsRouter(paymentService) {
  const router = Router();

  // Plan catalog with self-serve pricing
  router.get('/plans', async (_req, res) => {
    try {
      res.json({ success: true, data: paymentService.listPlans() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get recent payments for current user
  router.get('/', async (req, res) => {
    try {
      const payments = paymentService.listPayments(req.user.id, { limit: 5 });
      // Parse metadata for each payment
      const paymentsWithMetadata = payments.map(p => ({
        ...p,
        metadata: p.metadata ? JSON.parse(p.metadata) : {},
        statusDisplayText: getStatusDisplayText(p.status),
      }));
      res.json({ success: true, data: paymentsWithMetadata });
    } catch (err) {
      log.error('Failed to fetch payments', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Create payment for plan upgrade
  router.post('/', async (req, res) => {
    try {
      const { planId } = req.body;
      if (!planId) {
        return res.status(400).json({ success: false, error: 'planId is required' });
      }

      // Validate plan ID against available plans
      if (!AVAILABLE_PLANS.includes(planId)) {
        return res.status(400).json({ success: false, error: `Invalid plan ID. Available plans: ${AVAILABLE_PLANS.join(', ')}` });
      }

      const payment = await paymentService.createPayment(req.user.id, planId);
      res.json({ success: true, data: payment });
    } catch (err) {
      log.error('Payment creation failed', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  router.get('/:orderId/status', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { checkStatus } = req.query;

      let payment;
      if (checkStatus === 'true') {
        // Check with payment provider for latest status
        payment = await paymentService.checkPaymentStatusWithProvider(orderId);
      } else {
        // Just get from database
        payment = paymentService.getPaymentStatus(orderId);
      }

      if (!payment) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }
      // Verify ownership
      if (payment.user_id && payment.user_id !== req.user?.id) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }

      // Parse metadata and add display text
      const metadata = payment.metadata ? JSON.parse(payment.metadata) : {};
      const responseData = {
        orderId: payment.order_id,
        status: payment.status,
        statusDisplayText: getStatusDisplayText(payment.status),
        planId: metadata.planId,
        planName: metadata.planName,
        checkoutUrl: metadata.checkoutUrl || payment.checkout_url,
      };

      res.json({ success: true, data: responseData });
    } catch (err) {
      log.error('Payment status lookup failed', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  router.post('/initiate', async (req, res) => {
    try {
      const { amount, currency, provider, metadata } = req.body;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ success: false, error: 'amount is required and must be a positive number' });
      }
      const payment = await paymentService.initiatePayment({
        userId: req.user.id,
        amount: amt,
        currency,
        provider,
        metadata,
      });
      res.json({ success: true, data: payment });
    } catch (err) {
      log.error('Payment initiation failed', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  router.get('/status/:orderId', async (req, res) => {
    try {
      const payment = paymentService.getPaymentStatus(req.params.orderId);
      if (!payment) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }
      // Verify ownership
      if (payment.user_id && payment.user_id !== req.user?.id) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }
      res.json({ success: true, data: payment });
    } catch (err) {
      log.error('Payment status lookup failed', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const payments = paymentService.listPayments(req.user.id);
      res.json({ success: true, data: payments });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}
