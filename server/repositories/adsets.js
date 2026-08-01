import { v4 as uuidv4 } from 'uuid';

export class AdsetsRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ campaignId, status, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (campaignId) { where.push('campaign_id = ?'); params.push(campaignId); }
    if (status) { where.push('status = ?'); params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM ad_sets ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM ad_sets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM ad_sets WHERE id = ?').get(id) || null;
  }

  upsert(data) {
    const existing = data.id ? this.findById(data.id) : null;
    if (existing) {
      const fields = [];
      const params = [];
      const updatable = ['name', 'status', 'daily_budget', 'targeting_json', 'optimization_goal', 'billing_event'];
      for (const field of updatable) {
        const val = data[field];
        if (val !== undefined) { fields.push(`${field} = ?`); params.push(field === 'targeting_json' && typeof val !== 'string' ? JSON.stringify(val) : val); }
      }
      if (fields.length === 0) return existing;
      params.push(data.id);
      this.db.prepare(`UPDATE ad_sets SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
      return this.findById(data.id);
    }
    const id = data.id || uuidv4();
    this.db.prepare(`
      INSERT INTO ad_sets (id, campaign_id, platform, name, status, daily_budget, targeting_json, optimization_goal, billing_event, platform_adset_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.campaignId || data.campaign_id || '', data.platform || 'meta',
      data.name || '', data.status || 'PAUSED',
      data.dailyBudget ?? data.daily_budget ?? 0,
      typeof data.targeting === 'string' ? data.targeting : JSON.stringify(data.targeting || {}),
      data.optimizationGoal || data.optimization_goal || null,
      data.billingEvent || data.billing_event || null,
      data.platformAdsetId || data.platform_adset_id || data.id || id
    );
    return this.findById(id);
  }

  create(data) {
    return this.upsert(data);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const fields = [];
    const params = [];
    const updatable = ['name', 'status', 'daily_budget', 'targeting_json', 'optimization_goal', 'billing_event'];
    for (const field of updatable) {
      if (data[field] !== undefined) { fields.push(`${field} = ?`); params.push(data[field]); }
    }
    if (fields.length === 0) return existing;
    params.push(id);
    this.db.prepare(`UPDATE ad_sets SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  remove(id) {
    const result = this.db.prepare('DELETE FROM ad_sets WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
