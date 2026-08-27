import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('webhooks:payments');

/**
 * Payment webhook handler for 1ai-payment service callbacks.
 * Expects:
 * - Raw body captured by express.json({ verify: ... })
 * - X-Payment-Signature header with HMAC-SHA256 of raw body using webhookSecret
 */
export function createPaymentsWebhookRouter(paymentService) {
  const router = Router();

  router.post('/', async (req, res) => {
    const rawBody = req.rawBody;
    const signature = req.headers['x-payment-signature'];

    if (!rawBody) {
      log.warn('Payment webhook: missing rawBody');
      return res.status(400).send('Missing raw body');
    }
    if (!signature) {
      log.warn('Payment webhook: missing signature');
      return res.status(401).send('Missing signature');
    }

    try {
      const result = await paymentService.processPaymentCallback(rawBody, signature);
      if (result === null) {
        // Not a 1ai-payment event (legacy or different format)
        log.debug('Payment webhook: not a 1ai-payment event, ignoring');
        return res.status(200).send('OK');
      }
      if (!result.success) {
        log.warn('Payment webhook: processing failed', { error: result.error, status: result.status });
        return res.status(result.status || 400).send(result.error || 'Failed');
      }
      res.status(200).send('OK');
    } catch (err) {
      log.error('Payment webhook error', { error: err.message });
      res.status(500).send('Processing error');
    }
  });

  return router;
}