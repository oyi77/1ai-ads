import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('whatsapp-intelligence');

export class WhatsAppIntelligenceService {
  constructor({ waConversationsRepo, metaApi, llmClient, db, settingsRepo }) {
    this.repo = waConversationsRepo;
    this.metaApi = metaApi;
    this.llm = llmClient;
    this.db = db;
    this.settings = settingsRepo;
    this._pixelId = null;
  }

  // ── Webhook Processing ──────────────────────────────────────────

  async processWebhook(payload) {
    const entry = payload?.entry?.[0];
    if (!entry) return { processed: 0 };

    const changes = entry.changes || [];
    let processed = 0;

    for (const change of changes) {
      const value = change.value;
      if (!value?.messages?.[0]) continue;

      const msg = value.messages[0];
      const contact = value.contacts?.[0];
      const phoneNumber = msg.from || contact?.wa_id;
      if (!phoneNumber) continue;

      const existingConvs = this.repo.findByPhone(phoneNumber);
      const activeConv = existingConvs.find(c => c.status === 'active');

      const message = {
        from: phoneNumber,
        text: msg.text?.body || (msg[msg.type]?.body) || `[${msg.type}]`,
        timestamp: msg.timestamp,
        type: msg.type,
        msgId: msg.id,
        direction: 'inbound',
      };

      if (activeConv) {
        const messages = JSON.parse(activeConv.messages || '[]');
        messages.push(message);
        this.repo.update(activeConv.id, { messages });
      } else {
        this.repo.create({
          phoneNumber,
          waAccountId: entry.id,
          waPhoneNumberId: value.metadata?.phone_number_id,
          contactName: contact?.profile?.name,
          messages: [message],
        });
      }

      processed++;
    }

    if (processed > 0) {
      this._scoreRecentConversations().catch(err => {
        log.error('async_scoring_failed', { error: err.message });
      });
    }

    return { processed };
  }

  // ── Intent Scoring ──────────────────────────────────────────────

  SCORE_SYSTEM_PROMPT = `You are a WhatsApp sales intent analyzer for an Indonesian advertising platform (PixelAD). Analyze the conversation transcript and return a JSON object with these fields:
- intent_score: integer 0-10 (0=spam/no intent, 10=hot buyer ready to purchase)
- intent_label: one of ["Purchase", "Lead", "Support", "LowIntent"]
- product: what product/service they're asking about (in Indonesian, keep short)
- estimated_value: estimated transaction value in IDR (integer, 0 if unclear)
- reasoning: short 1-sentence explanation in Indonesian

Score guidance:
- 9-10: Asking for price, ready to buy, asking for payment/bank transfer
- 7-8: Asking detailed product questions, comparing options, interested
- 5-6: General inquiry about services, asking for brochure/catalog
- 3-4: Just browsing, asking basic questions
- 1-2: Wrong number, spam, or irrelevant
- 0: Empty or gibberish

Return ONLY valid JSON, no markdown, no explanation.`;

  async _scoreConversation(conversation) {
    const messages = JSON.parse(conversation.messages || '[]');
    const transcript = messages
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text}`)
      .join('\n');

    if (!transcript.trim()) return null;

    try {
      let response = await this.llm.call(this.SCORE_SYSTEM_PROMPT, transcript, {
        temperature: 0.3,
        max_tokens: 500,
      });

      // Strip markdown code fences if present
      response = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(response);

      this.repo.update(conversation.id, {
        intentScore: Math.max(0, Math.min(10, Math.round(parsed.intent_score || 0))),
        intentLabel: ['Purchase', 'Lead', 'Support', 'LowIntent'].includes(parsed.intent_label)
          ? parsed.intent_label : 'LowIntent',
        intentReasoning: parsed.reasoning || '',
        product: parsed.product || '',
        estimatedValue: Math.max(0, Math.round(parsed.estimated_value || 0)),
      });

      log.info('conversation_scored', {
        id: conversation.id, score: parsed.intent_score,
        label: parsed.intent_label, product: parsed.product,
      });

      return parsed;
    } catch (err) {
      log.error('scoring_failed', { id: conversation.id, error: err.message });
      return null;
    }
  }

  async _scoreRecentConversations() {
    const unscored = this.repo.findUnscored(5);
    for (const conv of unscored) {
      await this._scoreConversation(conv);
    }
  }

  // ── CAPI Event Sending ──────────────────────────────────────────

  async _resolvePixelId() {
    if (this._pixelId) return this._pixelId;

    const stored = this.settings?.getKey?.('meta_pixel_id');
    if (stored) {
      this._pixelId = stored;
      return stored;
    }

    try {
      const accounts = await this.metaApi.apiGet('/me/adaccounts', { fields: 'id,name' });
      const accountId = accounts?.data?.[0]?.id;
      if (accountId) {
        const info = await this.metaApi.apiGet(`/${accountId}`, { fields: 'pixel_id' });
        if (info?.pixel_id) {
          this._pixelId = info.pixel_id;
          return info.pixel_id;
        }
      }
    } catch (err) {
      log.warn('pixel_id_autodetect_failed', { error: err.message });
    }
    return null;
  }

  async sendCapiEvent(conversation) {
    const pixelId = await this._resolvePixelId();
    if (!pixelId) {
      log.warn('no_pixel_id', { conversationId: conversation.id });
      return null;
    }

    const phoneHash = crypto.createHash('sha256').update(conversation.phone_number).digest('hex');
    const eventTime = Math.floor(Date.now() / 1000);
    const eventName = conversation.intent_label === 'Purchase' ? 'Purchase' : 'Lead';

    const eventPayload = {
      event_name: eventName,
      event_time: eventTime,
      user_data: { ph: phoneHash },
      custom_data: {
        currency: conversation.currency || 'IDR',
        value: conversation.estimated_value || 0,
      },
      action_source: 'phone_call',
    };

    if (conversation.product) {
      eventPayload.custom_data.content_name = conversation.product;
    }

    try {
      const result = await this.metaApi.apiPost(`/${pixelId}/events`, { data: [eventPayload] });

      const ok = result?.events_received === 1 || result?.success;
      if (ok) {
        this.repo.update(conversation.id, {
          capiEventSent: true,
          capiEventType: eventName,
          capiEventId: `evt_${eventTime}`,
          capiSentAt: new Date().toISOString(),
        });
        log.info('capi_event_sent', {
          id: conversation.id, event: eventName, value: conversation.estimated_value,
        });
      } else {
        log.warn('capi_event_rejected', { id: conversation.id, result });
      }
      return result;
    } catch (err) {
      log.error('capi_event_failed', { id: conversation.id, error: err.message });
      return null;
    }
  }

  // ── Batch Processing ────────────────────────────────────────────

  async processUnscoredConversations(limit = 5) {
    const unscored = this.repo.findUnscored(limit);
    let scored = 0;
    for (const conv of unscored) {
      await this._scoreConversation(conv);
      scored++;
    }
    return { scored, total: unscored.length };
  }

  async processUnsentCapiEvents(limit = 5) {
    const unsent = this.repo.findUnsentCapi(limit);
    let sent = 0;
    for (const conv of unsent) {
      await this.sendCapiEvent(conv);
      sent++;
    }
    return { sent, total: unsent.length };
  }

  // ── Stats ───────────────────────────────────────────────────────

  getStats(from, to) {
    return this.repo.getStats(from, to);
  }

  getConversations(limit = 50) {
    return this.repo.findRecent(limit);
  }
}
