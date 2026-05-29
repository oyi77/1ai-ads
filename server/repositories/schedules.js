import { v4 as uuid } from 'uuid';

export class SchedulesRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ status, platform } = {}) {
    let where = [];
    let params = [];

    if (status) { where.push('status = ?'); params.push(status); }
    if (platform) { where.push('platform = ?'); params.push(platform); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM schedules ${whereClause} ORDER BY schedule_time ASC`
    ).all(...params);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) || null;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO schedules (id, name, schedule_time, platform, content, media_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.schedule_time,
      data.platform,
      data.content || null,
      data.media_url || null,
      data.status || 'scheduled'
    );
    return id;
  }

  remove(id) {
    const result = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
