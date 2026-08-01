import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('whatsapp-intelligence');

export class WhatsAppIntelligenceService {
  constructor({ waConversationsRepo, metaApi, whatsappApi, llmClient, db, settingsRepo, config }) {
    this.repo = waConversationsRepo;
    this.metaApi = metaApi;
    this.whatsappApi = whatsappApi;
    this.llm = llmClient;
    this.db = db;
    this.settings = settingsRepo;
    this.config = config;
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

      let convId;
      if (activeConv) {
        const messages = JSON.parse(activeConv.messages || '[]');
        messages.push(message);
        this.repo.update(activeConv.id, { messages });
        convId = activeConv.id;
      } else {
        const created = this.repo.create({
          phoneNumber,
          waAccountId: entry.id,
          waPhoneNumberId: value.metadata?.phone_number_id,
          contactName: contact?.profile?.name,
          messages: [message],
        });
        convId = created?.id;
      }

      // Fire-and-forget auto-reply
      if (convId) {
        this._autoReplyForConversation(convId).catch(err => {
          if (err) log.error('auto_reply_failed', { convId, error: err.message });
        });
      }
      processed++;
    }

    // Fire-and-forget scoring
    if (processed > 0) {
      this._scoreRecentConversations().catch(err => {
        if (err) log.error('scoring_cycle_failed', { error: err.message });
      });

      // Fire-and-forget auto-labeling
      this.processAutoLabeling(5).catch(err => {
        if (err) log.error('auto_labeling_cycle_failed', { error: err.message });
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

    let parsed;
    try {
      // Default: score via 1ai-social. Set SOCIAL_SCORING_URL=local for local LLM.
      const scoringUrl = this.config.socialScoringUrl;
      if (scoringUrl === 'local') {
        // Opt-in: score locally via this.llm
        let response = await this.llm.call(this.SCORE_SYSTEM_PROMPT, transcript, {
          temperature: 0.3,
          max_tokens: 500,
        });
        response = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(response);
      } else {
        const body = {
          contact_phone: conversation.phone_number,
          wa_number_id: conversation.wa_phone_number_id,
          contact_name: conversation.contact_name || null,
          messages: messages.map(m => ({
            direction: m.direction,
            text: m.text,
            message_type: m.type || 'text',
          })),
        };
        const resp = await fetch(scoringUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`social_scoring_http_${resp.status}: ${errText}`);
        }
        const data = await resp.json();
        if (data.status === 'error') {
          throw new Error(`social_scoring_rejected: ${data.status}`);
        }
        parsed = {
          intent_score: data.score_float,
          intent_label: data.score_label,
          reasoning: data.reasoning || '',
          product: data.product || '',
          estimated_value: data.estimated_value ? parseInt(data.estimated_value, 10) : 0,
        };
      }
    } catch (err) {
      log.error('scoring_failed', { id: conversation.id, error: err.message });
      return null;
    }

    try {
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

      // Auto-trigger CAPI for high-intent conversations (fire-and-forget)
      const highIntent = ['Purchase', 'Lead'].includes(parsed.intent_label);
      if (highIntent && (parsed.intent_score || 0) >= 7) {
        const refreshed = this.repo.findById(conversation.id);
        this.sendCapiEvent(refreshed || conversation).catch(err => {
          if (err) log.error('auto_capi_failed', { id: conversation.id, error: err.message });
        });
      }
      // Push high-intent conversation to 1ai-social lead pipeline
      if (highIntent && (parsed.intent_score || 0) >= 7 && !conversation.social_lead_id) {
        this.pushLeadToSocial(conversation.id).catch(err => {
          log.error('lead_push_failed', { id: conversation.id, error: err.message });
        });
      }

      return parsed;
    } catch (err) {
      log.error('scoring_store_failed', { id: conversation.id, error: err.message });
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

  // ── WhatsApp Sending ───────────────────────────────────────────

  async sendWhatsAppMessage(phoneNumberId, to, text) {
    if (!phoneNumberId || !to || !text) {
      log.warn('send_message_missing_params', { phoneNumberId, to });
      return null;
    }

    try {
      const result = await this.whatsappApi.sendMessage(phoneNumberId, to, { type: 'text', text: { body: text } });

      const ok = !result?.error;
      if (ok) {
        log.info('whatsapp_message_sent', { to, text: text.slice(0, 50) });
      } else {
        log.warn('whatsapp_send_rejected', { to, error: result.error?.message });
      }
      return result;
    } catch (err) {
      log.error('whatsapp_send_failed', { to, error: err.message });
      return null;
    }
  }

  AUTO_REPLY_PROMPT = `Anda adalah customer service dari PixelAD, platform iklan digital Indonesia yang membantu UMKM beriklan di Facebook, Instagram, TikTok, Google, dan WhatsApp.

Berdasarkan riwayat percakapan berikut, balas pesan terakhir customer dengan ramah, profesional, dan dalam Bahasa Indonesia.
Panduan:
- Jika customer bertanya harga/layanan: jelaskan secara singkat bahwa tim kami akan membantu, tanyakan kebutuhan mereka.
- Jika customer hanya menyapa (halo, hai, permisi): balas dengan ramah dan tawarkan bantuan.
- Jika customer sudah siap beli: minta nomor telepon/email untuk dihubungi tim sales.
- Jika customer complain: minta maaf dan tawarkan solusi.

Balasan maksimal 150 karakter, langsung ke intinya, jangan formal berlebihan.`;

  async _generateAutoReply(conversation) {
    if (!conversation) return null;

    const messages = JSON.parse(conversation.messages || '[]');
    const inbound = messages.filter(m => m.direction === 'inbound');
    if (inbound.length === 0) return null;

    const transcript = messages
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text}`)
      .join('\n');

    try {
      const reply = await this.llm.call(this.AUTO_REPLY_PROMPT,
        `Riwayat percakapan:\n${transcript}\n\nBerdasarkan percakapan di atas, balas pesan terakhir dari customer. Langsung dengan teks balasan, tanpa penjelasan.`, {
      });

      const clean = reply.replace(/^(Business|AI):\s*/i, '').replace(/^["']|["']$/g, '').trim();
      if (clean.length < 3) return null;

      // Append to conversation
      const updatedMessages = JSON.parse(conversation.messages || '[]');
      updatedMessages.push({
        from: conversation.wa_phone_number_id || 'business',
        text: clean,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        type: 'text',
        direction: 'outbound',
      });
      this.repo.update(conversation.id, { messages: updatedMessages });

      return clean;
    } catch (err) {
      log.error('auto_reply_generation_failed', { id: conversation.id, error: err.message });
      return null;
    }
  }

  async _autoReplyForConversation(convId) {
    if (!convId) return null;
    const conversation = this.repo.findById(convId);
    if (!conversation) {
      log.warn('auto_reply_conv_not_found', { convId });
      return null;
    }

    const reply = await this._generateAutoReply(conversation);
    if (!reply) return null;

    const waPhoneNumberId = conversation.wa_phone_number_id;
    const to = conversation.phone_number;
    if (!waPhoneNumberId || !to) {
      log.warn('auto_reply_missing_contact', { convId, waPhoneNumberId, to });
      return null;
    }

    const sent = await this.sendWhatsAppMessage(waPhoneNumberId, to, reply);
    if (!sent || sent?.error) {
      log.warn('auto_reply_send_failed', { convId, error: sent?.error?.message });
      return null;
    }

    log.info('auto_reply_sent', { convId, to });
    return reply;
  }

  async sendReply(convId, text) {
    if (!convId || !text) {
      log.warn('send_reply_missing_params', { convId });
      return null;
    }
    const conversation = this.repo.findById(convId);
    if (!conversation) {
      log.warn('send_reply_conv_not_found', { convId });
      return null;
    }

    const waPhoneNumberId = conversation.wa_phone_number_id;
    const to = conversation.phone_number;
    if (!waPhoneNumberId || !to) return null;

    const sent = await this.sendWhatsAppMessage(waPhoneNumberId, to, text);
    if (!sent || sent?.error) {
      log.warn('send_reply_failed', { convId, error: sent?.error?.message });
      return null;
    }

    // Append to conversation log
    const messages = JSON.parse(conversation.messages || '[]');
    messages.push({
      from: waPhoneNumberId,
      text,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      type: 'text',
      direction: 'outbound',
    });
    this.repo.update(convId, { messages });

    log.info('manual_reply_sent', { convId, to });
    return text;
  }

  // ── Auto Follow-up ──────────────────────────────────────────────

  FOLLOWUP_PROMPT = `Anda adalah customer service dari PixelAD, platform iklan digital Indonesia. Customer ini sebelumnya sudah menghubungi kami, dan sekarang Anda akan melakukan follow-up karena sudah beberapa hari tidak ada respon.

Berdasarkan riwayat percakapan berikut, buat pesan follow-up yang ramah, tidak memaksa, dan dalam Bahasa Indonesia.
Panduan:
- Jika customer sebelumnya bertanya harga/layanan: tanya apakah masih perlu bantuan, berikan info tambahan singkat.
- Jika customer hanya menyapa: tanya apakah ada yang bisa dibantu.
- Jika customer sudah siap beli tapi belum lanjut: tawarkan bantuan untuk proses pendaftaran.
- Maksimal 120 karakter, santai dan natural.

Buat pesan follow-up untuk percakapan berikut (langsung teks balasan, tanpa penjelasan):`;

  async _generateFollowUp(conversation) {
    if (!conversation) return null;
    const messages = JSON.parse(conversation.messages || '[]');
    const transcript = messages
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text}`)
      .join('\n');

    try {
      const reply = await this.llm.call(this.FOLLOWUP_PROMPT, transcript, {
        temperature: 0.7,
        max_tokens: 200,
      });
      const clean = reply.replace(/^["']|["']$/g, '').trim();
      if (clean.length < 3) return null;
      return clean;
    } catch (err) {
      log.error('followup_generation_failed', { id: conversation.id, error: err.message });
      return null;
    }
  }

  async processFollowUps(daysSinceLastContact = 3, limit = 10) {
    const candidates = this.repo.findForFollowUp(daysSinceLastContact, limit);
    let sent = 0;
    for (const conv of candidates) {
      const text = await this._generateFollowUp(conv);
      if (!text) continue;

      const waPhoneNumberId = conv.wa_phone_number_id;
      const to = conv.phone_number;
      if (!waPhoneNumberId || !to) continue;

      const result = await this.sendWhatsAppMessage(waPhoneNumberId, to, text);
      if (result && !result.error) {
        sent++;
        const messages = JSON.parse(conv.messages || '[]');
        messages.push({
          from: waPhoneNumberId,
          text,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'text',
          direction: 'outbound',
        });
        this.repo.update(conv.id, {
          messages,
          followUpCount: (conv.follow_up_count || 0) + 1,
          lastFollowUpAt: new Date().toISOString(),
          lastFollowUpMessage: text,
        });
        log.info('followup_sent', { id: conv.id, count: conv.follow_up_count + 1 });
      }
    }
    return { sent, total: candidates.length };
  }

  // ── Lead Pipeline (1ai-social) ──────────────────────────────────

  async pushLeadToSocial(convId) {
    const conv = this.repo.findById(convId);
    if (!conv) { log.warn('lead_push_no_conversation', { convId }); return null; }
    if (conv.social_lead_id) { log.debug('lead_already_pushed', { convId, leadId: conv.social_lead_id }); return conv; }

    const socialUrl = (this.config && this.config.socialBridgeUrl) || 'http://localhost:8200';
    const apiKey = (this.config && this.config.socialBridgeApiKey) || '';

    const response = await fetch(`${socialUrl}/v1/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        phone: conv.phone_number,
        source: 'whatsapp_intelligence',
        lead_score: conv.intent_score || 0,
        stage: 'discovery',
        tier: 'warm',
      }),
    });

    if (!response.ok) {
      throw new Error(`1ai-social push failed: ${response.status} ${await response.text()}`);
    }

    const lead = await response.json();
    const leadId = lead.id || lead.data?.id || String(lead);

    this.repo.update(convId, {
      socialLeadId: String(leadId),
      socialPushedAt: new Date().toISOString(),
    });

    log.info('lead_pushed', { convId, leadId });
    return lead;
  }

  async pushUnpushedLeads(limit = 10) {
    const unpushed = this.repo.findUnpushedLeads(limit);
    let pushed = 0;
    for (const conv of unpushed) {
      try {
        await this.pushLeadToSocial(conv.id);
        pushed++;
      } catch (err) {
        log.error('batch_lead_push_failed', { id: conv.id, error: err.message });
      }
    }
    return { pushed, total: unpushed.length };
  }

  // ── Auto Labeling ────────────────────────────────────────────────

  LABEL_RULES = [
    { score: 0.8, label: 'Hot Lead', matchers: ['beli', 'daftar', 'order', 'harga berapa', 'pendaftaran'] },
    { score: 0.5, label: 'Product Interest', matchers: ['info', 'produk', 'layanan', 'fitur', 'kursus'] },
    { score: 0.3, label: 'Warm Contact', matchers: ['nanti', 'saya pikir', 'saya lihat'] },
  ];

  _classifyConversation(conversation) {
    const messages = JSON.parse(conversation.messages || '[]');
    const text = messages.map(m => (m.text || '')).join(' ').toLowerCase();

    for (const rule of this.LABEL_RULES) {
      if (rule.matchers.some(m => text.includes(m))) {
        return rule.label;
      }
    }

    // Use intent score if available
    const intent = conversation.intent_score || 0;
    if (intent >= 7) return 'Hot Lead';
    if (intent >= 4) return 'Warm Lead';
    if (intent >= 1) return 'Cold Lead';

    return 'Unclassified';
  }

  async _autoLabelConversation(conversation) {
    if (!conversation) return null;
    const currentLabels = typeof conversation.labels === 'string' ? JSON.parse(conversation.labels) : conversation.labels;
    if (Array.isArray(currentLabels) && currentLabels.length > 0) return null;
    const label = this._classifyConversation(conversation);
    this.repo.update(conversation.id, { labels: [label] });
    log.info('auto_labeled', { id: conversation.id, label });
    return label;
  }

  async processAutoLabeling(limit = 20) {
    const needsLabel = this.repo.findNeedsLabel(limit);
    let labeled = 0;
    for (const conv of needsLabel) {
      await this._autoLabelConversation(conv);
      labeled++;
    }
    return { labeled, total: needsLabel.length };
  }

  // ── Batch Processing ────────────────────────────────────────────

  async processUnscoredConversations(limit = 5) {
    const unscored = this.repo.findUnscored(limit);
    let scored = 0;
    for (const conv of unscored) {
      const result = await this._scoreConversation(conv);
      if (result) scored++;
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

  // ── Single-Conversation Operations ──────────────────────────

  async scoreConversation(id) {
    const conv = this.repo.findById(id);
    if (!conv) return null;
    const result = await this._scoreConversation(conv);
    return result;
  }

  async sendCapiEventById(id) {
    const conv = this.repo.findById(id);
    if (!conv) return null;
    const eventType = conv.intent_label === 'Purchase' ? 'Purchase' : 'Lead';
    const result = await this.sendCapiEvent(conv);
    return { events_sent: result?.events_received === 1 ? 1 : 0, event_type: eventType };
  }

  async getUnscoredConversations(limit = 20) {
    return this.repo.findUnscored(limit);
  }

  async getUnsentCapiConversations(limit = 20) {
    return this.repo.findUnsentCapi(limit);
  }

  // ── Stats ───────────────────────────────────────────────────────

  getStats(from, to) {
    return this.repo.getStats(from, to);
  }

  getConversations(limit = 50) {
    return this.repo.findRecent(limit);
  }
}
