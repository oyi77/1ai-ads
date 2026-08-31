import crypto from 'crypto';
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
        interval_minutes INTEGER DEFAULT 15,
        last_evaluated_at TEXT,
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
    // Reconcile legacy schemas: rename condition→condition_json, action→action_json,
    // and add any missing columns so both fresh and pre-existing tables work.
    const cols = this.db.prepare(`PRAGMA table_info(${this.table})`).all().map(c => c.name);
    const addCol = (name, ddl) => {
      if (!cols.includes(name)) this.db.exec(`ALTER TABLE ${this.table} ADD COLUMN ${ddl}`);
    };
    if (cols.includes('condition') && !cols.includes('condition_json')) {
      this.db.exec(`ALTER TABLE ${this.table} RENAME COLUMN condition TO condition_json`);
      cols.splice(cols.indexOf('condition'), 1, 'condition_json');
    }
    if (cols.includes('action') && !cols.includes('action_json')) {
      this.db.exec(`ALTER TABLE ${this.table} RENAME COLUMN action TO action_json`);
      cols.splice(cols.indexOf('action'), 1, 'action_json');
    }
    addCol('description', "description TEXT DEFAULT ''");
    addCol('interval_minutes', 'interval_minutes INTEGER DEFAULT 15');
    addCol('last_evaluated_at', 'last_evaluated_at TEXT');
    addCol('last_triggered_at', 'last_triggered_at TEXT');
    addCol('trigger_count', 'trigger_count INTEGER DEFAULT 0');
    log.debug('autonomous_rules table ready');
  }

  create(rule) {
    const id = rule.id || crypto.randomUUID();
    // Legacy tables use INTEGER PRIMARY KEY (rowid alias) — inserting a TEXT uuid
    // into that column throws "datatype mismatch". Detect once and fall back to
    // letting SQLite autoincrement the id.
    const idType = this._idColumnType();
    const useAutoincrement = idType === 'INTEGER';
    const stmt = this.db.prepare(`
      INSERT INTO ${this.table} (id, user_id, account_id, name, description, condition_json, action_json, priority, enabled, interval_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const base = [
      rule.userId || rule.user_id,
      rule.accountId || rule.account_id || null,
      rule.name,
      rule.description || '',
      JSON.stringify(rule.condition),
      JSON.stringify(rule.action),
      rule.priority || 1,
      (rule.enabled === undefined || rule.enabled) ? 1 : 0,
      rule.intervalMinutes !== undefined ? rule.intervalMinutes : (rule.interval_minutes !== undefined ? rule.interval_minutes : 15),
    ];
    const result = useAutoincrement ? stmt.run(null, ...base) : stmt.run(id, ...base);
    const rowId = useAutoincrement ? Number(result.lastInsertRowid) : id;
    return this.getById(String(rowId));
  }

  _idColumnType() {
    const cols = this.db.prepare(`PRAGMA table_info(${this.table})`).all();
    const idCol = cols.find(c => c.name === 'id');
    return idCol?.type ? String(idCol.type).toUpperCase() : 'TEXT';
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
    if (updates.intervalMinutes !== undefined || updates.interval_minutes !== undefined) {
      fields.push('interval_minutes = ?');
      params.push(updates.intervalMinutes !== undefined ? updates.intervalMinutes : updates.interval_minutes);
    }
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

  markEvaluated(id) {
    this.db.prepare(`UPDATE ${this.table} SET last_evaluated_at = datetime('now') WHERE id = ?`).run(id);
  }

  createMany(rules) {
    const results = [];
    const idType = this._idColumnType();
    const useAutoincrement = idType === 'INTEGER';
    const stmt = this.db.prepare(`INSERT INTO ${this.table} (id, user_id, account_id, name, description, condition_json, action_json, priority, enabled, interval_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
    const transaction = this.db.transaction((rules) => {
      for (const rule of rules) {
        const id = rule.id || crypto.randomUUID();
        const base = [rule.userId || rule.user_id, rule.accountId || rule.account_id || null, rule.name, rule.description || '', JSON.stringify(rule.condition), JSON.stringify(rule.action), rule.priority || 1, (rule.enabled === undefined || rule.enabled) ? 1 : 0, rule.intervalMinutes !== undefined ? rule.intervalMinutes : (rule.interval_minutes !== undefined ? rule.interval_minutes : 15)];
        const result = useAutoincrement ? stmt.run(null, ...base) : stmt.run(id, ...base);
        const rowId = useAutoincrement ? Number(result.lastInsertRowid) : id;
        results.push(this.getById(String(rowId)));
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
      intervalMinutes: row.interval_minutes !== undefined ? row.interval_minutes : 15,
      lastEvaluatedAt: row.last_evaluated_at,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
