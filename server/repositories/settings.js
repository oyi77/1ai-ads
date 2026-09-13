import config from '../config/index.js';
import { ConfigurationError } from '../lib/errors.js';


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


  // ── REMOVED: unscoped account management ────────────────────────
  // getCredentials / setCredentials / getActiveAccount served
  // `WHERE platform = ? LIMIT 1` with no user scope (cross-tenant leak).
  // They now throw. New code MUST use platformAccountsRepo
  // .findActiveByUserAndPlatform(userId, platform) directly.

  get _accountsRepo() {
    if (!this._platformAccountsRepo) {
      throw new Error('SettingsRepository: account methods require PlatformAccountsRepository. Pass it in the constructor.');
    }
    return this._platformAccountsRepo;
  }

  /** @removed Cross-tenant leak — use platformAccountsRepo.findActiveByUserAndPlatform(userId, platform) */
  getCredentials(platform) {
    throw new ConfigurationError(
      `getCredentials('${platform}') is removed (cross-tenant leak): resolve the caller's own token via platformAccountsRepo.findActiveByUserAndPlatform(userId, platform)`
    );
  }

  /** @removed Cross-tenant leak — use platformAccountsRepo.create/update with explicit user_id */
  setCredentials(platform, _credentials) {
    throw new ConfigurationError(
      `setCredentials('${platform}') is removed (cross-tenant leak): write via platformAccountsRepo.create/update with explicit user_id`
    );
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

  setActiveAccountForUser(platform, id, userId) {
    return this._accountsRepo.setActiveAccountForUser(platform, id, userId);
  }

  /** @removed Cross-tenant leak — use platformAccountsRepo.findActiveByUserAndPlatform(userId, platform) */
  getActiveAccount(platform) {
    throw new ConfigurationError(
      `getActiveAccount('${platform}') is removed (cross-tenant leak): resolve via platformAccountsRepo.findActiveByUserAndPlatform(userId, platform)`
    );
  }
}