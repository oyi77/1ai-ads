import { Router } from 'express';
import { WebhookHandler } from '../services/webhook-handler.js';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';

const log = createLogger('webhooks');

export function createWebhookRouter(webhookEventsRepo) {
  const router = Router();
  const handler = new WebhookHandler();
  const VERIFY_TOKEN = config.webhookVerifyToken;

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (handler.handleVerification(mode, token, VERIFY_TOKEN)) {
      return res.send(challenge);
    }
    res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    const rawBody = req.rawBody;
    const signature = req.headers['x-hub-signature-256'];
    if (!config.fbAppSecret) {
      log.error('FB_APP_SECRET unset — webhook rejected (fail-closed)');
      return res.status(500).send('Configuration error');
    }
    if (!signature) {
      return res.status(401).send('Missing signature');
    }
    if (!handler.verifySignature(config.fbAppSecret, rawBody, signature)) {
      return res.status(401).send('Invalid signature');
    }
    try {
      const events = await handler.processEvent(req.body);
      if (events.length > 0) {
        try {
          for (const event of events) {
            webhookEventsRepo.create({
              source: event.field || 'meta',
              eventType: event.entryId || '',
              payload: event.value || {},
            });
          }
        } catch (err) {
          log.error('Failed to store webhook events', { error: err.message });
        }
      }
      res.status(200).send('OK');
    } catch (err) {
      log.error('webhook_process_error', { error: err.message });
      res.status(500).send('Processing error');
    }
  });

  return router;
}
