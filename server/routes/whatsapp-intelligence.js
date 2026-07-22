import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';

const log = createLogger('wa-intelligence-routes');

/**
 * Public webhook router — Meta WhatsApp Cloud API verification + event delivery.
 * GET  / → hub verification
 * POST / → receive messages
 */
export function createWhatsappWebhookRouter(whatsAppIntelligence) {
  const router = Router();
  const VERIFY_TOKEN = config.webhookVerifyToken || 'adforge_webhook_2026';

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      log.info('wa_webhook_verified');
      return res.send(challenge);
    }
    res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    try {
      const result = await whatsAppIntelligence.processWebhook(req.body);
      log.info('wa_webhook_processed', { processed: result.processed });
      res.status(200).send('OK');
    } catch (err) {
      log.error('wa_webhook_error', { error: err.message });
      res.status(200).send('OK'); // Always return 200 to acknowledge delivery
    }
  });

  return router;
}

/**
 * Authenticated API router — conversations, stats.
 */
export function createWhatsappApiRouter(whatsAppIntelligence) {
  const router = Router();

  // GET /conversations — list recent conversations
  router.get('/conversations', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const conversations = whatsAppIntelligence.getConversations(limit);
    res.json({ success: true, data: conversations.map(formatConversation) });
  });

  // GET /conversations/unscored — list unscored conversations for manual review
  router.get('/conversations/unscored', (req, res) => {
    const unscored = whatsAppIntelligence.repo.findUnscored(20);
    res.json({ success: true, data: unscored.map(formatConversation) });
  });

  // GET /conversations/unsent — list high-intent unsent CAPI events
  router.get('/conversations/unsent', (req, res) => {
    const unsent = whatsAppIntelligence.repo.findUnsentCapi(20);
    res.json({ success: true, data: unsent.map(formatConversation) });
  });

  // POST /conversations/score — manually trigger scoring for unscored conversations
  router.post('/conversations/score', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.body?.limit) || 5, 1), 20);
    const result = await whatsAppIntelligence.processUnscoredConversations(limit);
    res.json({ success: true, data: result });
  });

  // POST /conversations/send-capi — manually trigger CAPI send for high-intent conversations
  router.post('/conversations/send-capi', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.body?.limit) || 5, 1), 20);
    const result = await whatsAppIntelligence.processUnsentCapiEvents(limit);
    res.json({ success: true, data: result });
  });

  // GET /stats — conversation stats
  router.get('/stats', (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    const stats = whatsAppIntelligence.getStats(from, to);
    res.json({ success: true, data: stats });
  });

  return router;
}

function formatConversation(row) {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    waAccountId: row.wa_account_id,
    contactName: row.contact_name,
    messageCount: row.messages ? JSON.parse(row.messages).length : 0,
    intentScore: row.intent_score,
    intentLabel: row.intent_label,
    intentReasoning: row.intent_reasoning,
    product: row.product,
    estimatedValue: row.estimated_value,
    currency: row.currency,
    capiEventSent: !!row.capi_event_sent,
    capiEventType: row.capi_event_type,
    capiSentAt: row.capi_sent_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
