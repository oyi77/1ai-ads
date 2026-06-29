import crypto from 'crypto';

export class AuditLogRepository {
  constructor(db) {
    this.db = db;
  }

  log({ user_id, action, resource_type, resource_id, details, ip_address }) {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, user_id || null, action, resource_type || null, resource_id || null, details || null, ip_address || null);
  }

  findAll({ page = 1, limit = 50, userId, action } = {}) {
    const where = [];
    const params = [];
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    if (action) { where.push('action = ?'); params.push(action); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(`SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  findByUser(userId, { limit = 50 } = {}) {
    return this.db.prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  }
}
