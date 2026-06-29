import { v4 as uuid } from 'uuid';

export class ABTestsRepository {
  constructor(db) {
    this.db = db;
  }

  createTest(data) {
    const id = `abt_${uuid()}`;
    this.db.prepare(`
      INSERT INTO ab_tests (id, name, campaign_id, status, metric, confidence, winner_id, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.campaignId || null,
      data.status || 'draft',
      data.metric || 'ctr',
      data.confidence ?? 0.95,
      data.winnerId || null,
      typeof data.config === 'string' ? data.config : JSON.stringify(data.config || {})
    );
    return this.getTest(id);
  }

  createVariant(data) {
    const id = `v_${uuid()}`;
    this.db.prepare(`
      INSERT INTO ab_test_variants (id, test_id, ad_id, creative_id, name, hook, body, variant_index, impressions, clicks, spend, conversions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.testId,
      data.adId || null,
      data.creativeId || null,
      data.name,
      data.hook || null,
      data.body || null,
      data.variantIndex ?? 0,
      data.impressions ?? 0,
      data.clicks ?? 0,
      data.spend ?? 0,
      data.conversions ?? 0
    );
    return id;
  }

  getTest(id) {
    const row = this.db.prepare('SELECT * FROM ab_tests WHERE id = ?').get(id);
    if (!row) return null;
    const variants = this.getVariants(id);
    return { ...row, variants };
  }

  getTests({ status, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM ab_tests ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM ab_tests ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  getVariants(testId) {
    return this.db.prepare('SELECT * FROM ab_test_variants WHERE test_id = ? ORDER BY variant_index').all(testId);
  }

  updateTest(id, updates) {
    const fields = [];
    const params = [];
    const updatable = ['name', 'campaign_id', 'status', 'metric', 'confidence', 'winner_id', 'config', 'started_at', 'stopped_at'];

    for (const field of updatable) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(field === 'config' && typeof updates[field] !== 'string'
          ? JSON.stringify(updates[field])
          : updates[field]);
      }
    }

    if (fields.length === 0) return this.getTest(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);
    this.db.prepare(`UPDATE ab_tests SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getTest(id);
  }

  updateVariant(variantId, updates) {
    const fields = [];
    const params = [];
    const updatable = ['ad_id', 'creative_id', 'name', 'hook', 'body', 'variant_index', 'impressions', 'clicks', 'spend', 'conversions'];

    for (const field of updatable) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    if (fields.length === 0) return this.db.prepare('SELECT * FROM ab_test_variants WHERE id = ?').get(variantId);

    params.push(variantId);
    this.db.prepare(`UPDATE ab_test_variants SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM ab_test_variants WHERE id = ?').get(variantId);
  }

  deleteTest(id) {
    const result = this.db.prepare('DELETE FROM ab_tests WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
