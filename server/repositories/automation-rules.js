import { v4 as uuid } from 'uuid';

export class AutomationRuleRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        platform TEXT,
        campaign_id TEXT,
        is_active INTEGER DEFAULT 1,
        condition_type TEXT NOT NULL,
        condition_metric TEXT,
        condition_operator TEXT,
        condition_value REAL,
        condition_timeframe TEXT DEFAULT 'lifetime',
        action_type TEXT NOT NULL,
        action_value REAL,
        action_target TEXT,
        last_evaluated DATETIME,
        last_triggered DATETIME,
        trigger_count INTEGER DEFAULT 0,
        max_triggers INTEGER DEFAULT -1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    
    // Add missing columns if table already existed (schema migration)
    const columns = this.db.prepare("PRAGMA table_info(automation_rules)").all().map(c => c.name);
    if (!columns.includes('last_evaluated')) {
      this.db.exec('ALTER TABLE automation_rules ADD COLUMN last_evaluated DATETIME');
    }
    if (!columns.includes('last_triggered')) {
      this.db.exec('ALTER TABLE automation_rules ADD COLUMN last_triggered DATETIME');
    }
    if (!columns.includes('trigger_count')) {
      this.db.exec('ALTER TABLE automation_rules ADD COLUMN trigger_count INTEGER DEFAULT 0');
    }
    if (!columns.includes('max_triggers')) {
      this.db.exec('ALTER TABLE automation_rules ADD COLUMN max_triggers INTEGER DEFAULT -1');
    }
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_rule_executions (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        campaign_id TEXT,
        platform TEXT,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        condition_met INTEGER,
        action_taken TEXT,
        action_result TEXT,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE
      );
    `);
  }

  findAll(userId, { isActive, platform, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM automation_rules WHERE user_id = ?';
    const params = [userId];
    
    if (isActive !== undefined) { query += ' AND is_active = ?'; params.push(isActive ? 1 : 0); }
    if (platform) { query += ' AND platform = ?'; params.push(platform); }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return this.db.prepare(query).all(...params);
  }

  findById(id, userId) {
    return this.db.prepare('SELECT * FROM automation_rules WHERE id = ? AND user_id = ?').get(id, userId);
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO automation_rules (id, user_id, name, description, platform, campaign_id, is_active,
        condition_type, condition_metric, condition_operator, condition_value, condition_timeframe,
        action_type, action_value, action_target, max_triggers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.name, data.description || null, data.platform || null, data.campaignId || null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
      data.conditionType, data.conditionMetric || null, data.conditionOperator || null,
      data.conditionValue || null, data.conditionTimeframe || 'lifetime',
      data.actionType, data.actionValue || null, data.actionTarget || null, data.maxTriggers || -1
    );
    return this.findById(id, data.userId);
  }

  update(id, userId, data) {
    const fields = [];
    const values = [];
    
    const mappings = {
      name: 'name', description: 'description', platform: 'platform', campaignId: 'campaign_id',
      isActive: 'is_active', conditionType: 'condition_type', conditionMetric: 'condition_metric',
      conditionOperator: 'condition_operator', conditionValue: 'condition_value',
      conditionTimeframe: 'condition_timeframe', actionType: 'action_type',
      actionValue: 'action_value', actionTarget: 'action_target', maxTriggers: 'max_triggers',
    };
    
    for (const [key, col] of Object.entries(mappings)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(key === 'isActive' ? (data[key] ? 1 : 0) : data[key]);
      }
    }
    
    if (fields.length === 0) return this.findById(id, userId);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);
    
    this.db.prepare(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return this.findById(id, userId);
  }

  delete(id, userId) {
    return this.db.prepare('DELETE FROM automation_rules WHERE id = ? AND user_id = ?').run(id, userId);
  }

  recordExecution(data) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO automation_rule_executions (id, rule_id, campaign_id, platform, condition_met, action_taken, action_result, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.ruleId, data.campaignId || null, data.platform || null,
      data.conditionMet ? 1 : 0, data.actionTaken || null, data.actionResult || null,
      JSON.stringify(data.metadata || {}));
    
    // Update rule trigger count
    this.db.prepare(`
      UPDATE automation_rules SET trigger_count = trigger_count + 1, last_triggered = CURRENT_TIMESTAMP, last_evaluated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.ruleId);
    
    return id;
  }

  updateLastEvaluated(id) {
    this.db.prepare('UPDATE automation_rules SET last_evaluated = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  getExecutions(ruleId, { limit = 50 } = {}) {
    return this.db.prepare('SELECT * FROM automation_rule_executions WHERE rule_id = ? ORDER BY triggered_at DESC LIMIT ?').all(ruleId, limit);
  }
}
