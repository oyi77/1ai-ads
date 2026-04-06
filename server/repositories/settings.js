/**
 * Settings repository for storing platform credentials and app config.
 * Credentials are stored encrypted-at-rest in SQLite (the DB file is local).
 */
export class SettingsRepository {
  constructor(db) {
    this.db = db;
  }

  get(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }

  set(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, serialized);
  }

  delete(key) {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  getAll() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    return result;
  }

  // Platform credential helpers (Updated for multi-account compatibility)
  getCredentials(platform) {
    const active = this.getActiveAccount(platform);
    if (active) return active.credentials;
    return this.get(`credentials_${platform}`) || null;
  }

  setCredentials(platform, credentials) {
    // Try to update active account if it exists
    const active = this.getActiveAccount(platform);
    if (active) {
      this.updateAccount(active.id, { credentials });
    } else {
      // Legacy fallback
      this.set(`credentials_${platform}`, credentials);
    }
  }

  deleteCredentials(platform) {
    this.delete(`credentials_${platform}`);
  }

  // --- Multi-account support ---
  getAccounts(platform = null) {
    if (platform) {
      const rows = this.db.prepare('SELECT * FROM platform_accounts WHERE platform = ? ORDER BY account_name').all(platform);
      return rows.map(r => ({ ...r, credentials: JSON.parse(r.credentials) }));
    }
    const rows = this.db.prepare('SELECT * FROM platform_accounts ORDER BY platform, account_name').all();
    return rows.map(r => ({ ...r, credentials: JSON.parse(r.credentials) }));
  }

  getAccount(id) {
    const row = this.db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, credentials: JSON.parse(row.credentials) };
  }

  addAccount({ id, user_id, platform, account_name, credentials, is_active = 1 }) {
    this.db.prepare(`
      INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user_id, platform, account_name, JSON.stringify(credentials), is_active ? 1 : 0);
  }

  updateAccount(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'credentials') {
        fields.push('credentials = ?');
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    values.push(id);
    this.db.prepare(`UPDATE platform_accounts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  }

  deleteAccount(id) {
    this.db.prepare('DELETE FROM platform_accounts WHERE id = ?').run(id);
  }

  setActiveAccount(platform, id) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE platform_accounts SET is_active = 0 WHERE platform = ?').run(platform);
      this.db.prepare('UPDATE platform_accounts SET is_active = 1 WHERE id = ?').run(id);
    })();
  }

  getActiveAccount(platform) {
    const row = this.db.prepare('SELECT * FROM platform_accounts WHERE platform = ? AND is_active = 1 LIMIT 1').get(platform);
    if (!row) return null;
    return { ...row, credentials: JSON.parse(row.credentials) };
  }
}
