import { v4 as uuid } from 'uuid';

export class RefreshTokensRepository {
  constructor(db) {
    this.db = db;
  }

  create(userId, token, expiresAt) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, token, expiresAt);
    return id;
  }

  findByToken(token) {
    return this.db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token) || null;
  }

  deleteByToken(token) {
    this.db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
  }

  deleteExpired() {
    this.db.prepare('DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP').run();
  }

  deleteByUserId(userId) {
    this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
  }
}