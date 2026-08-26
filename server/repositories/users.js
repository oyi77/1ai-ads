import { v4 as uuid } from 'uuid';

export class UsersRepository {
  constructor(db) {
    this.db = db;
  }

  findByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
  }
  findByEmail(email) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
  }

  findByTelegramId(telegramId) {
    return this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) || null;
  }
  findById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  }
  getTelegramIdByUserId(userId) {
    return this.db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(userId)?.telegram_id ?? null;
  }

  findAll() {
    return this.db.prepare('SELECT id, username, email, role, is_active, created_at, last_login FROM users').all();
  }

  create({ username, email, password_hash, confirmed = 0, telegram_id = null }) {
    const id = uuid();
    this.db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed, telegram_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, username, email, password_hash, confirmed, telegram_id);
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;

    const fields = [];
    const params = [];
    const updatable = ['username', 'email', 'password_hash', 'role', 'plan', 'confirmed', 'is_active', 'last_login', 'telegram_id', 'plan_expires_at'];

    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (fields.length === 0) return existing;

    params.push(id);
    this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  setEmailVerificationToken(id, { hash, expiresAt }) {
    this.db.prepare('UPDATE users SET email_verification_hash = ?, email_verification_expires = ? WHERE id = ?')
      .run(hash, expiresAt, id);
  }

  findByVerificationTokenHash(hash) {
    return this.db.prepare('SELECT * FROM users WHERE email_verification_hash = ?').get(hash) || null;
  }

  markEmailVerified(id) {
    this.db.prepare("UPDATE users SET confirmed = 1, email_verification_hash = NULL, email_verification_expires = NULL WHERE id = ?")
      .run(id);
    return this.findById(id);
  }

  setPasswordResetToken(id, { hash, expiresAt }) {
    this.db.prepare('UPDATE users SET password_reset_hash = ?, password_reset_expires = ? WHERE id = ?')
      .run(hash, expiresAt, id);
  }

  findByPasswordResetTokenHash(hash) {
    return this.db.prepare('SELECT * FROM users WHERE password_reset_hash = ?').get(hash) || null;
  }

  clearPasswordResetToken(id) {
    this.db.prepare('UPDATE users SET password_reset_hash = NULL, password_reset_expires = NULL WHERE id = ?')
      .run(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  findExpiredPaidPlans() {
    return this.db.prepare(
      "SELECT id, username, plan, telegram_id FROM users WHERE plan != 'free' AND plan_expires_at IS NOT NULL AND plan_expires_at < datetime('now')"
    ).all();
  }
}
