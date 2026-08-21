import { Router } from 'express';
import { WebhookHandler } from '../services/webhook-handler.js';
import { createLogger } from '../lib/logger.js';
import { resolveWebhookCreds } from '../lib/meta-app-creds.js';

const log = createLogger('webhooks-user');

/**
 * Per-user Meta webhook receiver.
 *
 * Mounted at /webhooks/u/:userId. Meta signs each POST with the user's own
 * App Secret (the verify token is the userId), so a tenant's webhooks are
 * verified against only that tenant's credentials — no cross-tenant leakage.
 *
 * The bot/REST subscription helper (see lib/meta-subscribe.js) points each
 * user's Meta app at https://<host>/webhooks/u/<userId>.
 */
export function createUserWebhookRouter(userMetaAppsRepo) {
  const router = Router();
  const handler = new WebhookHandler();

  router.get('/:userId', (req, res) => {
    const { userId } = req.params;
    const { appSecret, verifyToken } = resolveWebhookCreds(userId, userMetaAppsRepo);
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    // If the user has no app secret at all, fail-closed.
    if (!appSecret) {
      log.warn('webhook_user_verify_no_secret', { userId });
      return res.status(500).send('Configuration error');
    }
    if (handler.handleVerification(mode, token, verifyToken)) {
      return res.send(challenge);
    }
    res.status(403).send('Forbidden');
  });

  router.post('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { appSecret } = resolveWebhookCreds(userId, userMetaAppsRepo);
    const rawBody = req.rawBody;
    const signature = req.headers['x-hub-signature-256'];

    if (!appSecret) {
      log.error('webhook_user_no_secret — rejected (fail-closed)', { userId });
      return res.status(500).send('Configuration error');
    }
    if (!signature) {
      return res.status(401).send('Missing signature');
    }
    if (!handler.verifySignature(appSecret, rawBody, signature)) {
      return res.status(401).send('Invalid signature');
    }

    try {
      const events = handler.processEvent(req.body);
      if (events.length > 0) {
        // Persist under the user's namespace so downstream processing stays scoped.
        try {
          for (const event of events) {
            log.info('webhook_user_event', { userId, field: event.field });
          }
        } catch (err) {
          log.error('webhook_user_store_error', { userId, error: err.message });
        }
      }
      res.status(200).send('OK');
    } catch (err) {
      log.error('webhook_user_process_error', { userId, error: err.message });
      res.status(500).send('Processing error');
    }
  });

  return router;
}
