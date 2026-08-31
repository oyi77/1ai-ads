import { v4 as uuidv4 } from 'uuid';

export class SavedAudiencesRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ userId, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM saved_audiences ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM saved_audiences ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM saved_audiences WHERE id = ?').get(id) || null;
  }

  create({ userId, name, platform = 'meta', description, targeting = {} }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO saved_audiences (id, user_id, name, platform, description, targeting_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, platform, description || null, JSON.stringify(targeting));
    return this.findById(id);
  }

  update(id, data, userId) {
    const existing = this.findById(id);
    if (!existing) return null;
    if (userId && existing.user_id !== userId) return null;
    const fields = [];
    const params = [];
    const updatable = ['name', 'platform', 'description'];
    for (const field of updatable) {
      if (data[field] !== undefined) { fields.push(`${field} = ?`); params.push(field === 'description' ? (data[field] || null) : data[field]); }
    }
    if (fields.length === 0) return existing;
    params.push(id);
    this.db.prepare(`UPDATE saved_audiences SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  remove(id, userId) {
    if (userId) {
      const result = this.db.prepare('DELETE FROM saved_audiences WHERE id = ? AND user_id = ?').run(id, userId);
      return result.changes > 0;
    }
    const result = this.db.prepare('DELETE FROM saved_audiences WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
