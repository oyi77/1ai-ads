import config from '../config/index.js';


/**
 * Settings repository for key-value application configuration.
 *
 * Account management methods have been moved to PlatformAccountsRepository.
 * The methods below are kept as thin delegation wrappers for backward compatibility
 * during the migration — they will be removed in a future version.
 */
export class SettingsRepository {
  constructor(db, platformAccountsRepo = null) {
    this.db = db;
    this._platformAccountsRepo = platformAccountsRepo;
  }

  // ── Key-value settings ────────────────────────────────────────

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
  // ── Approval workflow flag ─────────────────────────────────
  // Resolved from DB setting, env, or default false.
  getApprovalRequired() {
    const dbVal = this.get('approval_required');
    if (dbVal === 0 || dbVal === '0' || dbVal === false) return false;
    if (dbVal === 1 || dbVal === '1' || dbVal === true) return true;
    return config.approvalRequired; // env / default false
  }

  setApprovalRequired(value) {
    this.set('approval_required', value ? 1 : 0);
  }


  // ── Deprecated: Account management ────────────────────────────
  // These delegate to PlatformAccountsRepository for backward compatibility.
  // New code should use platformAccountsRepo directly.

  get _accountsRepo() {
    if (!this._platformAccountsRepo) {
      throw new Error('SettingsRepository: account methods require PlatformAccountsRepository. Pass it in the constructor.');
    }
    return this._platformAccountsRepo;
  }

  /** @deprecated Use platformAccountsRepo.getCredentials(platform) */
  getCredentials(platform) {
    return this._accountsRepo.getCredentials(platform);
  }

  /** @deprecated Use platformAccountsRepo.setCredentials(platform, credentials) */
  setCredentials(platform, credentials) {
    return this._accountsRepo.setCredentials(platform, credentials);
  }

  /** @deprecated Use platformAccountsRepo directly */
  deleteCredentials(platform) {
    return this.delete(`credentials_${platform}`);
  }

  /** @deprecated Use platformAccountsRepo.getAccounts(platform) */
  getAccounts(platform = null) {
    return this._accountsRepo.getAccounts(platform);
  }

  /** @deprecated Use platformAccountsRepo.findById(id) */
  getAccount(id) {
    return this._accountsRepo.findById(id);
  }

  /** @deprecated Use platformAccountsRepo.addAccount(data) */
  addAccount(data) {
    return this._accountsRepo.addAccount(data);
  }

  /** @deprecated Use platformAccountsRepo.updateAccount(id, data) */
  updateAccount(id, data) {
    return this._accountsRepo.updateAccount(id, data);
  }

  /** @deprecated Use platformAccountsRepo.deleteAccount(id) */
  deleteAccount(id) {
    return this._accountsRepo.deleteAccount(id);
  }

  /** @deprecated Use platformAccountsRepo.setActiveAccount(platform, id) */
  setActiveAccount(platform, id) {
    return this._accountsRepo.setActiveAccount(platform, id);
  }
  setActiveAccountForUser(platform, id, userId) {
    return this._accountsRepo.setActiveAccountForUser(platform, id, userId);
  }


  /** @deprecated Use platformAccountsRepo.getActiveAccount(platform) */
  getActiveAccount(platform) {
    return this._accountsRepo.getActiveAccount(platform);
  }
}