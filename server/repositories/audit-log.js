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

  findAll({ limit = 100, offset = 0 } = {}) {
    return this.db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  findByUser(userId, { limit = 50 } = {}) {
    return this.db.prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  }
}
