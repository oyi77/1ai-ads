import { v4 as uuid } from 'uuid';

export class PlatformAccountsRepository {
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id) || null;
  }

  findActiveByUserAndPlatform(userId, platform) {
    return this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 LIMIT 1'
    ).get(userId, platform) || null;
  }

  findByUserId(userId) {
    return this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  create({ user_id, platform, account_name, credentials, is_active = 1 }) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user_id, platform, account_name, credentials, is_active ? 1 : 0);
    return this.findById(id);
  }

  update(id, fields) {
    const existing = this.findById(id);
    if (!existing) return null;
    const cols = [];
    const params = [];
    for (const key of ['credentials', 'health_status', 'last_error', 'is_active', 'account_name']) {
      if (fields[key] !== undefined) {
        cols.push(`${key} = ?`);
        let value = fields[key];
        if (key === 'is_active' && typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        params.push(value);
      }
    }
    if (cols.length === 0) return existing;
    cols.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    this.db.prepare(`UPDATE platform_accounts SET ${cols.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  remove(id) {
    this.db.prepare('UPDATE platform_accounts SET is_active = 0 WHERE id = ?').run(id);
    return true;
  }
}
