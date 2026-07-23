import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const log = createLogger('wa-conversations-repo');

export class WaConversationsRepository {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO wa_conversations (id, phone_number, wa_account_id, wa_phone_number_id, contact_name, messages, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id,
      data.phoneNumber,
      data.waAccountId || null,
      data.waPhoneNumberId || null,
      data.contactName || null,
      JSON.stringify(data.messages || []),
      now,
      now
    );
    log.info('conversation_created', { id, phone: data.phoneNumber });
    return this.findById(id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM wa_conversations WHERE id = ?').get(id);
  }

  findByPhone(phoneNumber) {
    return this.db.prepare('SELECT * FROM wa_conversations WHERE phone_number = ? ORDER BY created_at DESC').all(phoneNumber);
  }

  findActive() {
    return this.db.prepare('SELECT * FROM wa_conversations WHERE status = ? ORDER BY created_at DESC').all('active');
  }

  findRecent(limit = 50) {
    return this.db.prepare('SELECT * FROM wa_conversations ORDER BY updated_at DESC LIMIT ?').all(limit);
  }

  findUnscored(limit = 10) {
    return this.db.prepare("SELECT * FROM wa_conversations WHERE intent_score IS NULL AND status = 'active' ORDER BY created_at ASC LIMIT ?").all(limit);
  }

  findUnsentCapi(limit = 10) {
    return this.db.prepare("SELECT * FROM wa_conversations WHERE capi_event_sent = 0 AND intent_score >= 7 AND status = 'active' ORDER BY intent_score DESC LIMIT ?").all(limit);
  }

  findUnpushedLeads(limit = 10) {
    return this.db.prepare("SELECT * FROM wa_conversations WHERE intent_score >= 7 AND social_lead_id IS NULL AND status = 'active' ORDER BY intent_score DESC LIMIT ?").all(limit);
  }

  findForFollowUp(daysSinceLastContact = 3, limit = 20) {
    const cutoff = new Date(Date.now() - daysSinceLastContact * 86400_000).toISOString();
    return this.db.prepare(`
      SELECT * FROM wa_conversations
      WHERE status = 'active'
        AND updated_at < ?
        AND (last_follow_up_at IS NULL OR last_follow_up_at < ?)
        AND follow_up_count < 5
      ORDER BY updated_at ASC
      LIMIT ?
    `).all(cutoff, cutoff, limit);
  }

  findNeedsLabel(limit = 20) {
    return this.db.prepare("SELECT * FROM wa_conversations WHERE labels = '[]' AND status = 'active' AND intent_score IS NOT NULL ORDER BY updated_at DESC LIMIT ?").all(limit);
  }

  findByLabel(label, limit = 50) {
    return this.db.prepare("SELECT * FROM wa_conversations WHERE labels LIKE ? ORDER BY updated_at DESC LIMIT ?").all(`%"${label}"%`, limit);
  }

  update(id, data) {
    const fields = [];
    const values = [];

    if (data.messages !== undefined) { fields.push('messages = ?'); values.push(JSON.stringify(data.messages)); }
    if (data.intentScore !== undefined) { fields.push('intent_score = ?'); values.push(data.intentScore); }
    if (data.intentLabel !== undefined) { fields.push('intent_label = ?'); values.push(data.intentLabel); }
    if (data.intentReasoning !== undefined) { fields.push('intent_reasoning = ?'); values.push(data.intentReasoning); }
    if (data.product !== undefined) { fields.push('product = ?'); values.push(data.product); }
    if (data.estimatedValue !== undefined) { fields.push('estimated_value = ?'); values.push(data.estimatedValue); }
    if (data.capiEventSent !== undefined) { fields.push('capi_event_sent = ?'); values.push(data.capiEventSent ? 1 : 0); }
    if (data.capiEventType !== undefined) { fields.push('capi_event_type = ?'); values.push(data.capiEventType); }
    if (data.capiEventId !== undefined) { fields.push('capi_event_id = ?'); values.push(data.capiEventId); }
    if (data.capiSentAt !== undefined) { fields.push('capi_sent_at = ?'); values.push(data.capiSentAt); }
    if (data.contactName !== undefined) { fields.push('contact_name = ?'); values.push(data.contactName); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.socialLeadId !== undefined) { fields.push('social_lead_id = ?'); values.push(data.socialLeadId); }
    if (data.socialPushedAt !== undefined) { fields.push('social_pushed_at = ?'); values.push(data.socialPushedAt); }
    if (data.labels !== undefined) { fields.push('labels = ?'); values.push(JSON.stringify(data.labels)); }
    if (data.followUpCount !== undefined) { fields.push('follow_up_count = ?'); values.push(data.followUpCount); }
    if (data.lastFollowUpAt !== undefined) { fields.push('last_follow_up_at = ?'); values.push(data.lastFollowUpAt); }
    if (data.lastFollowUpMessage !== undefined) { fields.push('last_follow_up_message = ?'); values.push(data.lastFollowUpMessage); }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE wa_conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  getStats(from, to) {
    const rows = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN capi_event_sent = 1 THEN 1 ELSE 0 END) AS capi_sent,
        AVG(CASE WHEN intent_score IS NOT NULL THEN intent_score ELSE NULL END) AS avg_intent,
        SUM(CASE WHEN intent_label = 'Purchase' THEN 1 ELSE 0 END) AS purchases,
        SUM(CASE WHEN intent_label = 'Lead' THEN 1 ELSE 0 END) AS leads,
        SUM(CASE WHEN intent_label = 'Support' THEN 1 ELSE 0 END) AS support,
        SUM(CASE WHEN intent_label = 'LowIntent' THEN 1 ELSE 0 END) AS low_intent
      FROM wa_conversations
      WHERE created_at >= ? AND created_at <= ?
    `).get(from || '1970-01-01', to || '9999-12-31');

    return rows || { total: 0, capi_sent: 0, avg_intent: null, purchases: 0, leads: 0, support: 0, low_intent: 0 };
  }
}
