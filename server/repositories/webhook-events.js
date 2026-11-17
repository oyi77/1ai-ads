import { v4 as uuidv4 } from 'uuid';

export class WebhookEventsRepository {
  constructor(db) {
    this.db = db;
  }

  create(event) {
    const id = uuidv4();
    // event_id is the source's dedup key (e.g., Meta's x-fb-delivery-id).
    // If the caller doesn't provide one, we generate a UUID so the unique
    // index on (source, event_type, event_id) stays satisfied.
    const eventId = event.event_id || uuidv4();
    this.db.prepare(`
      INSERT INTO webhook_events (id, source, event_type, event_id, payload, processed, retry_counter, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
    `).run(id, event.source, event.eventType, eventId, JSON.stringify(event.payload || {}));
    return { id, ...event };
  }

  findUnprocessed(limit = 100) {
    return this.db.prepare('SELECT * FROM webhook_events WHERE processed = 0 ORDER BY created_at ASC LIMIT ?').all(limit);
  }

  markProcessed(id) {
    return this.db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?').run(id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM webhook_events WHERE id = ?').get(id) || null;
  }

  incrementRetry(id) {
    this.db.prepare('UPDATE webhook_events SET retry_counter = retry_counter + 1, failed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    const row = this.db.prepare('SELECT retry_counter FROM webhook_events WHERE id = ?').get(id);
    return row?.retry_counter ?? 0;
  }

  markDeadLetter(id, _errorMessage) {
    // processed=2 marks a dead-lettered event, distinct from processed=1 (success)
    return this.db.prepare('UPDATE webhook_events SET processed = 2, failed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }
}
