import { v4 as uuid } from 'uuid';

export class AutomationRulesRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ campaignId } = {}) {
    if (campaignId) {
      return this.db.prepare('SELECT * FROM automation_rules WHERE campaign_id = ? ORDER BY created_at DESC').all(campaignId);
    }
    return this.db.prepare('SELECT * FROM automation_rules ORDER BY created_at DESC').all();
  }

  findActive() {
    return this.db.prepare('SELECT * FROM automation_rules WHERE is_active = 1 ORDER BY created_at DESC').all();
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id) || null;
  }

  create(data) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO automation_rules (id, campaign_id, name, is_active, condition_metric, condition_operator, condition_value, action, action_value, check_interval)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.campaign_id, data.name, data.is_active !== false ? 1 : 0,
      data.condition_metric, data.condition_operator, data.condition_value,
      data.action, data.action_value || null, data.check_interval || 'daily');
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const fields = [];
    const params = [];
    for (const key of ['name', 'is_active', 'condition_metric', 'condition_operator', 'condition_value', 'action', 'action_value', 'check_interval']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        // Convert boolean to number for SQLite compatibility
        let value = data[key];
        if (key === 'is_active' && typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        params.push(value);
      }
    }
    if (fields.length === 0) return existing;
    params.push(id);
    this.db.prepare(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  markTriggered(id) {
    this.db.prepare('UPDATE automation_rules SET last_triggered = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  remove(id) {
    return this.db.prepare('DELETE FROM automation_rules WHERE id = ?').run(id).changes > 0;
  }
}
