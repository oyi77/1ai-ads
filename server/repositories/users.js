import { v4 as uuid } from 'uuid';

export class UsersRepository {
  constructor(db) {
    this.db = db;
  }

  findByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  }

  create({ username, password_hash }) {
    const id = uuid();
    this.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, password_hash);
    return id;
  }
}
