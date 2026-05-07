import { createLogger } from '../lib/logger.js';
import { createDatabase } from '../db/index.js';

const log = createLogger('rules-repo');

export class RulesRepository {
  constructor(dbPath = './db/adforge.db') {
    this.db = createDatabase(dbPath);
    this.table = 'automation_rules';
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
        updated_at TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_rules ON ${this.table}(user_id, enabled);
    `);
    log.info('Rules table created');
  }

  create(rule) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO ${this.table} (user_id, name, condition, action, priority, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      rule.user_id,
      rule.name,
      rule.condition,
      rule.action,
      rule.priority,
      rule.enabled ? 1 : 0,
      now
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
      condition: JSON.parse(r.condition),
      action: JSON.parse(r.action),
      priority: r.priority,
      enabled: r.enabled === 1,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }

  getAllEnabled(userId) {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE user_id = ? AND enabled = 1`).all(userId).map(r => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      condition: JSON.parse(r.condition),
      action: JSON.parse(r.action),
      priority: r.priority,
      enabled: true
    }));
  }

  countEnabled(userId) {
    return this.db.prepare(`SELECT COUNT(*) as count FROM ${this.table} WHERE user_id = ? AND enabled = 1`).get(userId).count;
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
      INSERT INTO ${this.table} (user_id, name, condition, action, priority, enabled, created_at)
      VALUES ${rules.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}
    `);
    
    const values = rules.flatMap(r => [
      r.user_id, r.name, r.condition, r.action, r.priority, r.enabled ? 1 : 0, now
    ]);
    
    const result = stmt.run(...values);
    log.info('Bulk rules created', { count: rules.length });
    return result.lastInsertRowid;
  }
}
