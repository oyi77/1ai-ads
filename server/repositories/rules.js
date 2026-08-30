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
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT DEFAULT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        condition_json TEXT NOT NULL,
        action_json TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        last_triggered_at TEXT,
        trigger_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rules_user ON ${this.table}(user_id);
      CREATE INDEX IF NOT EXISTS idx_rules_enabled ON ${this.table}(enabled);
      CREATE INDEX IF NOT EXISTS idx_rules_account ON ${this.table}(account_id);
      CREATE INDEX IF NOT EXISTS idx_rules_priority ON ${this.table}(priority);
    `);
    log.debug('autonomous_rules table ready');
  }

  create(rule) {
    const id = rule.id || crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO ${this.table} (id, user_id, account_id, name, description, condition_json, action_json, priority, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      rule.userId || rule.user_id,
      rule.accountId || rule.account_id || null,
      rule.name,
      rule.description || '',
      JSON.stringify(rule.condition),
      JSON.stringify(rule.action),
      rule.priority || 1,
      (rule.enabled === undefined || rule.enabled) ? 1 : 0
    );
    return this.getById(id);
  }

  update(id, updates) {
    const fields = [];
    const params = [];
    if (updates.name) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
    if (updates.condition) { fields.push('condition_json = ?'); params.push(JSON.stringify(updates.condition)); }
    if (updates.action) { fields.push('action_json = ?'); params.push(JSON.stringify(updates.action)); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); params.push(updates.priority); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); params.push(updates.enabled ? 1 : 0); }
    if (!fields.length) return this.getById(id);
    fields.push('updated_at = datetime(\'now\')');
    params.push(id);
    this.db.prepare(`UPDATE ${this.table} SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
    if (!row) return null;
    return this._hydrate(row);
  }

  getAll(userId) {
    const rows = this.db.prepare(`SELECT * FROM ${this.table} WHERE user_id = ? ORDER BY priority DESC, created_at DESC`).all(userId);
    return rows.map(r => this._hydrate(r));
  }

  getAllEnabled(userId) {
    const rows = this.db.prepare(`SELECT * FROM ${this.table} WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC`).all(userId);
    return rows.map(r => this._hydrate(r));
  }

  getAllEnabledForScope(userId, accountId) {
    const rows = this.db.prepare(
      `SELECT * FROM ${this.table} WHERE user_id = ? AND enabled = 1 AND (account_id = ? OR account_id IS NULL) ORDER BY priority DESC`
    ).all(userId, accountId);
    return rows.map(r => this._hydrate(r));
  }

  countEnabled(userId) {
    return this.db.prepare(`SELECT COUNT(*) as count FROM ${this.table} WHERE user_id = ? AND enabled = 1`).get(userId).count;
  }

  findAll(filters = {}) {
    const where = [];
    const params = [];
    if (filters.userId) { where.push('user_id = ?'); params.push(filters.userId); }
    if (filters.enabled !== undefined) { where.push('enabled = ?'); params.push(filters.enabled ? 1 : 0); }
    if (filters.accountId) { where.push('account_id = ?'); params.push(filters.accountId); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM ${this.table} ${whereClause} ORDER BY priority DESC`).all(...params);
    return rows.map(r => this._hydrate(r));
  }

  findActive() {
    const rows = this.db.prepare(`SELECT * FROM ${this.table} WHERE enabled = 1 ORDER BY priority DESC`).all();
    return rows.map(r => this._hydrate(r));
  }

  delete(id) {
    return this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes > 0;
  }

  trigger(id) {
    this.db.prepare(`UPDATE ${this.table} SET last_triggered_at = datetime('now'), trigger_count = trigger_count + 1 WHERE id = ?`).run(id);
  }

  createMany(rules) {
    const results = [];
    const stmt = this.db.prepare(`INSERT INTO ${this.table} (id, user_id, account_id, name, description, condition_json, action_json, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const transaction = this.db.transaction((rules) => {
      for (const rule of rules) {
        const id = rule.id || crypto.randomUUID();
        stmt.run(id, rule.userId || rule.user_id, rule.accountId || rule.account_id || null, rule.name, rule.description || '', JSON.stringify(rule.condition), JSON.stringify(rule.action), rule.priority || 1, (rule.enabled === undefined || rule.enabled) ? 1 : 0);
        results.push(this.getById(id));
      }
    });
    transaction(rules);
    return results;
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      name: row.name,
      description: row.description,
      condition: safeParse(row.condition_json, {}),
      action: safeParse(row.action_json, {}),
      priority: row.priority,
      enabled: !!row.enabled,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
