import { createLogger } from '../lib/logger.js';
import { safeParse } from '../lib/safe-parse.js';

const log = createLogger('rules-repo');

export class RulesRepository {
  constructor(db) {
    if (!db) throw new Error('RulesRepository requires a database instance');
    this.db = db;
    this.table = 'autonomous_rules';
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        condition TEXT NOT NULL,
        action TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        account_id TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_rules ON ${this.table}(user_id, enabled);
    `);
    log.info('Rules table created');
  }

  create(rule) {
    const now = new Date().toISOString();
    const conditionStr = typeof rule.condition === 'string' ? rule.condition : JSON.stringify(rule.condition);
    const actionStr = typeof rule.action === 'string' ? rule.action : JSON.stringify(rule.action);

    const stmt = this.db.prepare(`
      INSERT INTO ${this.table} (user_id, name, condition, action, priority, enabled, created_at, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      rule.user_id,
      rule.name,
      conditionStr,
      actionStr,
      rule.priority,
      rule.enabled ? 1 : 0,
      now,
      rule.account_id ?? null
    );
    
    log.info('Rule created', { id: result.lastInsertRowid, userId: rule.user_id });
    return result.lastInsertRowid;
  }

  update(id, updates) {
    const set = [];
    const values = [];
    
    if (updates.name) { set.push('name = ?'); values.push(updates.name); }
    if (updates.condition) { set.push('condition = ?'); values.push(updates.condition); }
    if (updates.action) { set.push('action = ?'); values.push(updates.action); }
    if (updates.priority !== undefined) { set.push('priority = ?'); values.push(updates.priority); }
    if (updates.enabled !== undefined) { set.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.account_id !== undefined) { set.push('account_id = ?'); values.push(updates.account_id ?? null); }
    
    if (set.length === 0) return false;
    
    values.push(id);
    
    const result = this.db.prepare(`
      UPDATE ${this.table} SET ${set.join(', ')}, updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
    
    log.info('Rule updated', { id, changes: set.length });
    return result.changes > 0;
  }

  getById(id) {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  getAll(userId) {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE user_id = ?`).all(userId).map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: safeParse(r.condition),
      action: safeParse(r.action),
      priority: r.priority,
      enabled: r.enabled === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
      account_id: r.account_id,
    }));
  }

  getAllEnabled(userId) {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE user_id = ? AND enabled = 1`).all(userId).map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: safeParse(r.condition),
      action: safeParse(r.action),
      priority: r.priority,
      enabled: true,
      updated_at: r.updated_at,
      account_id: r.account_id,
    }));
  }

  getAllEnabledForScope(userId, accountId) {
    return this.db.prepare(
      `SELECT * FROM ${this.table} WHERE user_id = ? AND enabled = 1 AND (account_id IS NULL OR account_id = ?)`
    ).all(userId, accountId).map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: safeParse(r.condition),
      action: safeParse(r.action),
      priority: r.priority,
      enabled: true,
      account_id: r.account_id
    }));
  }

  countEnabled(userId) {
    return this.db.prepare(`SELECT COUNT(*) as count FROM ${this.table} WHERE user_id = ? AND enabled = 1`).get(userId).count;
  }

  findAll(filters = {}) {
    let rows;
    if (filters.campaignId) {
      rows = this.db.prepare(`SELECT * FROM ${this.table} WHERE condition LIKE ? ORDER BY created_at DESC`).all(`%${filters.campaignId}%`);
    } else {
      rows = this.db.prepare(`SELECT * FROM ${this.table} ORDER BY created_at DESC`).all();
    }
    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: safeParse(r.condition),
      action: safeParse(r.action),
      priority: r.priority,
      enabled: r.enabled === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
      account_id: r.account_id,
    }));
  }

  findActive() {
    const rows = this.db.prepare(`SELECT * FROM ${this.table} WHERE enabled = 1 ORDER BY priority DESC`).all();
    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: safeParse(r.condition),
      action: safeParse(r.action),
      priority: r.priority,
      enabled: true,
      campaign_id: r.campaign_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      account_id: r.account_id,
    }));
  }

  delete(id) {
    const result = this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
    log.info('Rule deleted', { id });
    return result.changes > 0;
  }

  // Batch operations
  createMany(rules) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO ${this.table} (user_id, name, condition, action, priority, enabled, created_at, account_id)
      VALUES ${rules.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
    `);
    
    const values = rules.flatMap(r => [
      r.user_id, r.name, r.condition, r.action, r.priority, r.enabled ? 1 : 0, now, r.account_id ?? null
    ]);
    
    const result = stmt.run(...values);
    log.info('Bulk rules created', { count: rules.length });
    return result.lastInsertRowid;
  }
}
