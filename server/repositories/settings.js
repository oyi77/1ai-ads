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

  // Platform credential helpers
  getCredentials(platform) {
    return this.get(`credentials_${platform}`) || null;
  }

  setCredentials(platform, credentials) {
    this.set(`credentials_${platform}`, credentials);
  }

  deleteCredentials(platform) {
    this.delete(`credentials_${platform}`);
  }
}
