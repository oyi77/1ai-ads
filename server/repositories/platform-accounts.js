import { v4 as uuid } from 'uuid';
import { safeParse } from '../lib/safe-parse.js';
import { encryptToken, decryptToken } from '../lib/crypto.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('platform-accounts');

/**
 * Sanitize an access token by removing common UI artifacts.
 * Removes ✅ prefix, trailing bot success messages, and extra whitespace.
 */
function sanitizeAccessToken(token) {
  if (!token || typeof token !== 'string') return token;
  let cleaned = token.trim();
  // Remove ✅ prefix (common when users copy from bot UI)
  cleaned = cleaned.replace(/^✅\s*/, '');
  // Remove trailing bot success messages
  cleaned = cleaned.replace(/\s*connected for Meta.*$/i, '');
  cleaned = cleaned.replace(/\s*You can manage this account from the web dashboard.*$/i, '');
  cleaned = cleaned.replace(/\s*Selesai.*cek \/status.*$/i, '');
  return cleaned.trim();
}

/**
 * Encrypt a credential value for storage.
 * If ENCRYPTION_KEY is not set, stores as plain JSON (backward compatible).
 */
function encryptCredentials(credentials) {
  const json = typeof credentials === 'string' ? credentials : JSON.stringify(credentials);
  if (process.env.ENCRYPTION_KEY) {
    return encryptToken(json);
  }
  return json;
}

/**
 * Decrypt a credential value from storage.
 * Handles both legacy plain-text JSON and new encrypted format.
 */
function decryptCredentials(raw) {
  if (!raw) return null;
  try {
    // Try encrypted format first (base64 that decrypts to JSON)
    const decrypted = decryptToken(raw);
    return safeParse(decrypted);
  } catch {
    // Fall back to legacy plain-text JSON
    const parsed = safeParse(raw);
    if (parsed !== null) return parsed;
    // If it's a plain string (like a raw access token), return as-is
    if (typeof raw === 'string' && raw.length > 5) return raw;
    return null;
  }
}

export class PlatformAccountsRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Single-record lookups ────────────────────────────────────

  findById(id) {
    const row = this.db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, credentials: decryptCredentials(row.credentials) };
  }

  findActiveByUserAndPlatform(userId, platform) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 LIMIT 1'
    ).get(userId, platform);
    if (!row) return null;
    return { ...row, credentials: decryptCredentials(row.credentials) };
  }

  /** Multi-tenant: find ALL active accounts for a user+platform (not just LIMIT 1). */
  findAllActiveByUserAndPlatform(userId, platform) {
    const rows = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 ORDER BY created_at DESC'
    ).all(userId, platform);
return rows.map(r => ({ ...r, credentials: decryptCredentials(r.credentials) }));
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
    return { ...row, credentials: decryptCredentials(row.credentials) };
  }

  getAccountByPlatformId(platformId) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE id = ? LIMIT 1'
    ).get(platformId);
    if (!row) return null;
    return { ...row, credentials: decryptCredentials(row.credentials) };
  }

  getAccounts(platform = null) {
    if (platform) {
      const rows = this.db.prepare(
        'SELECT * FROM platform_accounts WHERE platform = ? ORDER BY account_name'
      ).all(platform);
      return rows.map(r => ({ ...r, credentials: decryptCredentials(r.credentials) }));
    }
    const rows = this.db.prepare(
      'SELECT * FROM platform_accounts ORDER BY platform, account_name'
    ).all();
    return rows.map(r => ({ ...r, credentials: decryptCredentials(r.credentials) }));
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
    // Sanitize access_token if present in credentials
    let sanitizedCredentials = credentials;
    if (credentials && typeof credentials === 'object' && credentials.access_token) {
      const token = sanitizeAccessToken(credentials.access_token);
      if (token !== credentials.access_token) {
        log.info('Sanitized access token (removed UI artifacts)', { user_id, platform });
      }
      sanitizedCredentials = { ...credentials, access_token: token };
    }
    const encrypted = encryptCredentials(sanitizedCredentials);
    this.db.prepare(`
      INSERT INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user_id, platform, account_name, encrypted, is_active ? 1 : 0);
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
        if (key === 'credentials') {
          // Sanitize access_token if present
          if (value && typeof value === 'object' && value.access_token) {
            const token = sanitizeAccessToken(value.access_token);
            if (token !== value.access_token) {
              log.info('Sanitized access token (removed UI artifacts)', { accountId: id, platform: value.platform || 'unknown' });
            }
            value = { ...value, access_token: token };
          }
          value = encryptCredentials(value);
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
    this.db.prepare('DELETE FROM platform_accounts WHERE id = ?').run(id);
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

  setActiveAccountForUser(platform, id, userId) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE platform_accounts SET is_active = 0 WHERE platform = ? AND user_id = ?').run(platform, userId);
      this.db.prepare('UPDATE platform_accounts SET is_active = 1 WHERE id = ?').run(id);
    })();
  }

  // ── Per-user methods ─────────────────────────────────────────

  getByPlatform(userId, platform) {
    const row = this.db.prepare(
      'SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ? AND is_active = 1 LIMIT 1'
    ).get(userId, platform);
    if (!row) return null;
    const creds = decryptCredentials(row.credentials);
    return { ...row, access_token: creds?.access_token || null, credentials: creds };
  }

  getUsersWithAutoMode() {
    return this.db.prepare(`
      SELECT DISTINCT u.* FROM users u
      JOIN platform_accounts pa ON u.id = pa.user_id
      WHERE pa.is_active = 1
    `).all();
  }

  getDistinctUserPlatforms(platform) {
    return this.db.prepare(
      'SELECT user_id, platform FROM platform_accounts WHERE platform = ? AND is_active = 1 GROUP BY user_id'
    ).all(platform);
  }

  updateHealthByPlatform(userId, platform, healthStatus, lastError = null) {
    this.db.prepare(
      'UPDATE platform_accounts SET health_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND platform = ?'
    ).run(healthStatus, lastError, userId, platform);
  }
}
