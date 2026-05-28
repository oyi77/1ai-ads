import { Router } from 'express';
import { WebhookHandler } from '../services/webhook-handler.js';
import config from '../config/index.js';

export default function createWebhookRouter() {
  const router = Router();
  const handler = new WebhookHandler();
  const VERIFY_TOKEN = config.webhookVerifyToken || 'adforge_webhook_2026';

  // Meta verification challenge
  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (handler.handleVerification(mode, token, VERIFY_TOKEN)) {
      return res.send(challenge);
    }
    res.status(403).send('Forbidden');
  });

  // Meta event callbacks
  router.post('/', (req, res) => {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'];
    if (config.fbAppSecret && !handler.verifySignature(config.fbAppSecret, rawBody, signature)) {
      return res.status(401).send('Invalid signature');
    }
    const events = handler.processEvent(req.body);
    // TODO: emit events to event bus / store in DB
    res.status(200).send('OK');
  });

  return router;
}
