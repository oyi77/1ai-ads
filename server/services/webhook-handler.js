import { createLogger } from '../lib/logger.js';
import crypto from 'crypto';

const log = createLogger('webhook-handler');

export class WebhookHandler {
  constructor() {
    this.subscriptions = new Map();
  }

  verifySignature(appSecret, payload, signature) {
    if (!appSecret || !signature) return false;
    const expectedSig = crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
    const expected = Buffer.from(`sha256=${expectedSig}`);
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  }

  handleVerification(mode, token, verifyToken) {
    if (mode === 'subscribe' && token === verifyToken) {
      log.info('webhook_verified');
      return true;
    }
    log.warn('webhook_verification_failed', { mode, token });
    return false;
  }

  processEvent(body) {
    if (!body || !body.entry) return [];
    const events = [];
    for (const entry of body.entry) {
      for (const change of (entry.changes || [])) {
        events.push({
          field: change.field,
          value: change.value,
          entryId: entry.id,
          time: entry.time
        });
      }
    }
    log.info('processed_events', { count: events.length });
    return events;
  }
}
