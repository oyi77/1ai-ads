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
}
