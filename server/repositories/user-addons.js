import { v4 as uuid } from 'uuid';

/**
 * Per-user add-on entitlements. Base manage-ads = plan. LP + Content+Social
 * Bridge = add-on terpisah, lifetime. Tanpa baris aktif = locked.
 */
export class UserAddonsRepository {
  constructor(db) {
    this.db = db;
  }

  hasActive(userId, addonKey) {
    if (!userId || !addonKey) return false;
    const row = this.db
      .prepare('SELECT id FROM user_addons WHERE user_id = ? AND addon_key = ? AND active = 1 LIMIT 1')
      .get(String(userId), String(addonKey));
    return !!row;
  }

  listActive(userId) {
    if (!userId) return [];
    return this.db
      .prepare('SELECT addon_key FROM user_addons WHERE user_id = ? AND active = 1')
      .all(String(userId))
      .map(r => r.addon_key);
  }

  grant(userId, addonKey, grantedBy = null) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO user_addons (id, user_id, addon_key, active, granted_at, granted_by)
      VALUES (?, ?, ?, 1, datetime('now'), ?)
      ON CONFLICT(user_id, addon_key) DO UPDATE SET active = 1, granted_at = datetime('now'), granted_by = excluded.granted_by
    `).run(id, String(userId), String(addonKey), grantedBy ? String(grantedBy) : null);
    return this.hasActive(userId, addonKey);
  }

  revoke(userId, addonKey) {
    this.db.prepare('UPDATE user_addons SET active = 0 WHERE user_id = ? AND addon_key = ?')
      .run(String(userId), String(addonKey));
    return true;
  }
}
