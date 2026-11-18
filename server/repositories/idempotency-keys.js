import crypto from 'crypto';

export class IdempotencyKeysRepository {
  constructor(db) {
    this.db = db;
  }

  find(key, userId, _actionHash) {
    return this.db.prepare(`
      SELECT status_code, result_json, action_hash
        FROM idempotency_keys
       WHERE key = ? AND user_id = ? AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1
    `).get(key, userId) || null;
  }

  create({ key, userId, user_id, actionHash, action_hash, statusCode, status_code, result }) {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys
        (id, key, user_id, action_hash, status_code, result_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, key, userId || user_id, actionHash || action_hash, statusCode || status_code, JSON.stringify(result), expiresAt);
    return id;
  }
}
