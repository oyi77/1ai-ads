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

  // In-memory dedup: Meta retries a delivery (5xx/timeout) with the SAME
  // entry.id; without a dedup key every retry creates a duplicate row and the
  // WebhookProcessor double-processes it (double status apply / double lead
  // increment). Map keyed by `${entry.id}:${change.field}` with a bounded TTL.
  const seenEvents = new Map();
  const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

  router.post('/', async (req, res) => {
    const rawBody = req.rawBody;
    if (!rawBody) {
      log.warn('webhook rejected: missing raw body');
      return res.status(400).send('Bad request');
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!config.fbAppSecret) {
      log.error('FB_APP_SECRET unset — webhook rejected (fail-closed)');
      return res.status(500).send('Configuration error');
    }
    if (!signature) {
      log.warn('webhook rejected: missing signature');
      return res.status(401).send('Missing signature');
    }
    if (!handler.verifySignature(config.fbAppSecret, rawBody, signature)) {
      log.warn('webhook rejected: invalid signature');
      return res.status(401).send('Invalid signature');
    }
    try {
      const events = await handler.processEvent(req.body);
      if (events.length > 0) {
        try {
          const now = Date.now();
          for (const event of events) {
            // Idempotency: skip a delivery we already handled recently.
            const dedupKey = `${event.entryId || ''}:${event.field || ''}`;
            const last = seenEvents.get(dedupKey);
            if (last && now - last < DEDUP_TTL_MS) continue;
            seenEvents.set(dedupKey, now);
            if (seenEvents.size > 5000) {
              // Bound memory — drop entries older than the TTL.
              for (const [k, t] of seenEvents) if (now - t >= DEDUP_TTL_MS) seenEvents.delete(k);
            }
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
