import { v4 as uuid } from 'uuid';
import { encryptToken, decryptToken, tokenHint } from '../lib/crypto.js';

/**
 * Per-user Meta App-level credentials (App Creds).
 * Stores SystemToken / AppSecret / AppId / ThreadsId / ThreadsSecret,
 * scoped to a single user. Secrets encrypted at rest (AES-256-GCM).
 *
 * Distinct from platform_accounts (per ad-account) and global env.
 * One active row per user (upsert by user_id).
 */
export class UserMetaAppsRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_meta_apps (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        app_secret TEXT NOT NULL,
        system_token TEXT NOT NULL,
        threads_id TEXT,
        threads_secret TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Get the active (decrypted) creds for a user.
   * @returns {{app_id, app_secret, system_token, threads_id, threads_secret}|null}
   */
  getActive(userId) {
    const row = this.db
      .prepare('SELECT * FROM user_meta_apps WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .get(String(userId));
    if (!row) return null;
    return this._decryptRow(row);
  }

  /**
   * Masked view for API responses (no secret material exposed).
   */
  getMasked(userId) {
    const row = this.db
      .prepare('SELECT id, user_id, app_id, threads_id, is_active, updated_at FROM user_meta_apps WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .get(String(userId));
    if (!row) return null;
    return {
      hasCreds: true,
      appId: row.app_id,
      appIdHint: tokenHint(row.app_id),
      threadsId: row.threads_id || null,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Upsert the active creds for a user. Replaces any prior active row.
   * @param {string} userId
   * @param {{appId, appSecret, systemToken, threadsId?, threadsSecret?}} fields
   */
  upsert(userId, fields) {
    const id = uuid();
    const now = new Date().toISOString();
    // Accept both snake_case (REST handler) and camelCase (model layer / tests).
    const appId = fields.appId ?? fields.app_id;
    const appSecret = fields.appSecret ?? fields.app_secret;
    const systemToken = fields.systemToken ?? fields.system_token;
    const threadsId = fields.threadsId ?? fields.threads_id ?? null;
    const threadsSecret = fields.threadsSecret ?? fields.threads_secret ?? null;
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE user_meta_apps SET is_active = 0 WHERE user_id = ?')
        .run(String(userId));
      this.db
        .prepare(`
          INSERT INTO user_meta_apps
            (id, user_id, app_id, app_secret, system_token, threads_id, threads_secret, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `)
        .run(
          id,
          String(userId),
          appId,
          encryptToken(appSecret),
          encryptToken(systemToken),
          threadsId || null,
          threadsSecret ? encryptToken(threadsSecret) : null,
          now,
          now,
        );
    });
    tx();
    return this.getActive(userId);
  }

  delete(userId) {
    const res = this.db
      .prepare('UPDATE user_meta_apps SET is_active = 0 WHERE user_id = ?')
      .run(String(userId));
    return res.changes > 0;
  }

  _decryptRow(row) {
    return {
      app_id: row.app_id,
      app_secret: decryptToken(row.app_secret),
      system_token: decryptToken(row.system_token),
      threads_id: row.threads_id || null,
      threads_secret: row.threads_secret ? decryptToken(row.threads_secret) : null,
    };
  }
}
