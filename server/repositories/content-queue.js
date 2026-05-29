import { v4 as uuidv4 } from 'uuid';

export class ContentQueueRepository {
  constructor(db) {
    this.db = db;
    // Ensure table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS content_queue (
        id TEXT PRIMARY KEY,
        page_id TEXT,
        content TEXT,
        media_url TEXT,
        platform TEXT,
        status TEXT DEFAULT 'scheduled',
        scheduled_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  findAll() {
    return this.db.prepare(
      'SELECT * FROM content_queue ORDER BY scheduled_at ASC'
    ).all();
  }

  findScheduled() {
    return this.db.prepare(
      "SELECT * FROM content_queue WHERE status = 'scheduled' ORDER BY scheduled_at ASC"
    ).all();
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM content_queue WHERE id = ?').get(id);
  }

  create(data) {
    const id = uuidv4();
    const scheduledAt = typeof data.schedule_time === 'number'
      ? data.schedule_time
      : Math.floor(new Date(data.schedule_time).getTime() / 1000);
    this.db.prepare(`
      INSERT INTO content_queue (id, page_id, content, media_url, platform, status, scheduled_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
    `).run(id, data.name || '', data.content || '', data.media_url || '', data.platform, scheduledAt);
    return { id, status: 'scheduled', ...data };
  }

  delete(id) {
    return this.db.prepare('DELETE FROM content_queue WHERE id = ?').run(id);
  }
}
