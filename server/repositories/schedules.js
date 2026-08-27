import { v4 as uuid } from 'uuid';

export class SchedulesRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ status, platform, userId } = {}) {
    const where = [];
    const params = [];

    if (userId) { where.push('user_id = ?'); params.push(userId); }
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
      INSERT INTO schedules (id, user_id, name, schedule_time, platform, content, media_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.user_id || 'system',
      data.name,
      data.schedule_time,
      data.platform,
      data.content || null,
      data.media_url || null,
      data.status || 'scheduled'
    );
    return id;
  }

  remove(id, userId) {
    const params = userId ? [id, userId] : [id];
    const sql = userId
      ? 'DELETE FROM schedules WHERE id = ? AND user_id = ?'
      : 'DELETE FROM schedules WHERE id = ?';
    const result = this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  findDue() {
    const now = new Date().toISOString();
    return this.db.prepare(
      "SELECT * FROM schedules WHERE status = 'scheduled' AND schedule_time <= ? ORDER BY schedule_time ASC"
    ).all(now);
  }

  markExecuted(id) {
    this.db.prepare("UPDATE schedules SET status = 'executed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }

  markFailed(id, _error) {
    this.db.prepare("UPDATE schedules SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }
}
