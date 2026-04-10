import { v4 as uuid } from 'uuid';

export class AiSuggestionsRepository {
  constructor(db) {
    this.db = db;
  }

  listByUser(userId, status = null) {
    if (status) {
      return this.db.prepare(
        'SELECT * FROM ai_suggestions WHERE user_id = ? AND status = ? ORDER BY created_at DESC'
      ).all(userId, status);
    }
    return this.db.prepare(
      'SELECT * FROM ai_suggestions WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(id) || null;
  }

  create({ user_id, type, target_id = null, target_type = null, suggestion, rationale = null, status = 'pending' }) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO ai_suggestions (id, user_id, type, target_id, target_type, suggestion, rationale, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user_id, type, target_id, target_type,
      typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion),
      rationale, status);
    return id;
  }

  updateStatus(id, status, appliedAt = null) {
    this.db.prepare(
      'UPDATE ai_suggestions SET status = ?, applied_at = ? WHERE id = ?'
    ).run(status, appliedAt || (status === 'applied' ? new Date().toISOString() : null), id);
    return this.getById(id);
  }
}
