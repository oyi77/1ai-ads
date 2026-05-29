import crypto from 'crypto';

export class ScheduleRepository {
  constructor(db) {
    this.db = db;
  }

  ensureTable() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_time TEXT NOT NULL,
      platform TEXT NOT NULL,
      content TEXT,
      media_url TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  findAll() {
    return this.db.prepare('SELECT * FROM schedules ORDER BY schedule_time').all();
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  }

  create(data) {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO schedules (id, name, schedule_time, platform, content, media_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, data.name, data.schedule_time, data.platform, data.content || null, data.media_url || null);
    return this.findById(id);
  }

  delete(id) {
    return this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  }

  updateStatus(id, status) {
    this.db.prepare('UPDATE schedules SET status = ?, updated_at = datetime(?) WHERE id = ?').run(status, new Date().toISOString(), id);
  }
}
