import { v4 as uuid } from 'uuid';

export class CampaignWizardRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_wizards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        config TEXT NOT NULL DEFAULT '{}',
        target_audience TEXT DEFAULT '{}',
        budget TEXT DEFAULT '{}',
        creatives TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_campaign_wizards_user ON campaign_wizards(user_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_wizards_platform ON campaign_wizards(platform);
    `);
  }

  findAll(userId, { platform, status, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM campaign_wizards WHERE user_id = ?';
    const params = [userId];
    
    if (platform) { query += ' AND platform = ?'; params.push(platform); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = this.db.prepare(query).all(...params);
    return rows.map(this._parseRow);
  }

  findById(id, userId) {
    const row = this.db.prepare('SELECT * FROM campaign_wizards WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? this._parseRow(row) : null;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO campaign_wizards (id, user_id, platform, name, status, config, target_audience, budget, creatives)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.platform, data.name, data.status || 'draft',
      JSON.stringify(data.config || {}), JSON.stringify(data.targetAudience || {}),
      JSON.stringify(data.budget || {}), JSON.stringify(data.creatives || [])
    );
    return this.findById(id, data.userId);
  }

  update(id, userId, data) {
    const fields = [];
    const values = [];
    
    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.config) { fields.push('config = ?'); values.push(JSON.stringify(data.config)); }
    if (data.targetAudience) { fields.push('target_audience = ?'); values.push(JSON.stringify(data.targetAudience)); }
    if (data.budget) { fields.push('budget = ?'); values.push(JSON.stringify(data.budget)); }
    if (data.creatives) { fields.push('creatives = ?'); values.push(JSON.stringify(data.creatives)); }
    
    if (fields.length === 0) return this.findById(id, userId);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);
    
    this.db.prepare(`UPDATE campaign_wizards SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return this.findById(id, userId);
  }

  delete(id, userId) {
    return this.db.prepare('DELETE FROM campaign_wizards WHERE id = ? AND user_id = ?').run(id, userId);
  }

  _parseRow(row) {
    return {
      ...row,
      config: JSON.parse(row.config || '{}'),
      targetAudience: JSON.parse(row.target_audience || '{}'),
      budget: JSON.parse(row.budget || '{}'),
      creatives: JSON.parse(row.creatives || '[]'),
    };
  }
}
