import { v4 as uuid } from 'uuid';
import { safeParse } from '../lib/safe-parse.js';

export class PlatformAccountsRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Single-record lookups ────────────────────────────────────

  findById(id) {
    return this.db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id) || null;
  }

  findActiveByUserAndPlatform(userId, platform) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 LIMIT 1'
    ).get(userId, platform);
    if (!row) return null;
    return { ...row, credentials: safeParse(row.credentials) };
  }

  findByUserId(userId) {
    return this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  }

  // ── System-level lookups (no userId) ─────────────────────────
  // These match the old SettingsRepository pattern where "active account"
  // means the system-wide active account for a platform, not per-user.

  getActiveAccount(platform) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE platform = ? AND is_active = 1 LIMIT 1'
    ).get(platform);
    if (!row) return null;
    return { ...row, credentials: safeParse(row.credentials) };
  }

  getAccountByPlatformId(platformId) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE id = ? LIMIT 1'
    ).get(platformId);
    if (!row) return null;
    return { ...row, credentials: safeParse(row.credentials) };
  }

  getAccounts(platform = null) {
    if (platform) {
      const rows = this.db.prepare(
        'SELECT * FROM platform_accounts WHERE platform = ? ORDER BY account_name'
      ).all(platform);
      return rows.map(r => ({ ...r, credentials: safeParse(r.credentials) }));
    }
    const rows = this.db.prepare(
      'SELECT * FROM platform_accounts ORDER BY platform, account_name'
    ).all();
    return rows.map(r => ({ ...r, credentials: safeParse(r.credentials) }));
  }

  // ── Credential helpers (system-level) ───────────────────────

  getCredentials(platform) {
    const active = this.getActiveAccount(platform);
    if (active) return active.credentials;
    return null;
  }

  setCredentials(platform, credentials) {
    const active = this.getActiveAccount(platform);
    if (active) {
      this.update(active.id, { credentials });
    }
  }

  // ── CRUD ────────────────────────────────────────────────────

  create({ user_id, platform, account_name, credentials, is_active = 1 }) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user_id, platform, account_name, JSON.stringify(credentials), is_active ? 1 : 0);
    return this.findById(id);
  }

  // Alias: addAccount for backward compatibility
  addAccount(data) {
    return this.create(data);
  }

  update(id, fields) {
    const existing = this.findById(id);
    if (!existing) return null;
    const cols = [];
    const params = [];
    for (const key of ['credentials', 'health_status', 'last_error', 'is_active', 'account_name', 'user_id', 'platform']) {
      if (fields[key] !== undefined) {
        cols.push(`${key} = ?`);
        let value = fields[key];
        if (key === 'is_active' && typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        if (key === 'credentials' && typeof value !== 'string') {
          value = JSON.stringify(value);
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

  // Alias: updateAccount for backward compatibility
  updateAccount(id, data) {
    return this.update(id, data);
  }

  remove(id) {
    this.db.prepare('UPDATE platform_accounts SET is_active = 0 WHERE id = ?').run(id);
    return true;
  }

  // Alias: deleteAccount for backward compatibility
  deleteAccount(id) {
    return this.remove(id);
  }

  setActiveAccount(platform, id) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE platform_accounts SET is_active = 0 WHERE platform = ?').run(platform);
      this.db.prepare('UPDATE platform_accounts SET is_active = 1 WHERE id = ?').run(id);
    })();
  }

  // ── Per-user methods ─────────────────────────────────────────

  getByPlatform(userId, platform) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 LIMIT 1'
    ).get(userId, platform);
    if (!row) return null;
    try {
      return { ...row, access_token: JSON.parse(row.credentials).access_token };
    } catch {
      return { ...row, access_token: row.credentials };
    }
  }

  getUsersWithAutoMode() {
    return this.db.prepare(`
      SELECT DISTINCT u.* FROM users u
      JOIN platform_accounts pa ON u.id = pa.user_id
      WHERE pa.is_active = 1
    `).all();
  }
}