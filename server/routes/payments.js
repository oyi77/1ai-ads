import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
const log = createLogger('payments');

export function createPaymentsRouter(paymentService) {
  const router = Router();

  router.post('/initiate', async (req, res) => {
    try {
      const { amount, currency, provider, metadata } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount is required and must be positive' });
      }
      const payment = await paymentService.initiatePayment({
        userId: req.user.id,
        amount,
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
