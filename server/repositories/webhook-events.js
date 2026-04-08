import { v4 as uuidv4 } from 'uuid';

export class WebhookEventsRepository {
  constructor(db) {
    this.db = db;
  }

  create(event) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO webhook_events (id, source, event_type, payload, processed, created_at)
      VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, event.source, event.eventType, JSON.stringify(event.payload || {}));
    return { id, ...event };
  }

  findBySource(source) {
    return this.db.prepare('SELECT * FROM webhook_events WHERE source = ? ORDER BY created_at DESC').all(source);
  }

  markProcessed(id) {
    return this.db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?').run(id);
  }
}
