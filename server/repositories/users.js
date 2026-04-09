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

  findById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  }

  create({ username, email, password_hash, confirmed = 0 }) {
    const id = uuid();
    this.db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, ?)').run(id, username, email, password_hash, confirmed);
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;

    const fields = [];
    const params = [];
    const updatable = ['username', 'email', 'password_hash', 'role', 'plan', 'confirmed'];

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
}
