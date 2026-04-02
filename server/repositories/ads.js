import { v4 as uuid } from 'uuid';

export class AdsRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ page = 1, limit = 20, platform, status } = {}) {
    let where = [];
    let params = [];

    if (platform) { where.push('platform = ?'); params.push(platform); }
    if (status) { where.push('status = ?'); params.push(status); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM ads ${whereClause}`).get(...params).count;

    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM ads ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { data, total, page, limit };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM ads WHERE id = ?').get(id) || null;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO ads (id, name, product, target, keunggulan, platform, format, content_model, hook, body, cta, design_json, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.product || null, data.target || null, data.keunggulan || null,
      data.platform || 'meta', data.format || 'single_image', data.content_model || null,
      data.hook || null, data.body || null, data.cta || null, data.design_json || null,
      typeof data.tags === 'string' ? data.tags : JSON.stringify(data.tags || []),
      data.status || 'draft'
    );
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;

    const fields = [];
    const params = [];
    const updatable = ['name', 'product', 'target', 'keunggulan', 'platform', 'format', 'content_model', 'hook', 'body', 'cta', 'design_json', 'tags', 'status'];

    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(field === 'tags' && typeof data[field] !== 'string' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (fields.length === 0) return existing;

    params.push(id);
    this.db.prepare(`UPDATE ads SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  remove(id) {
    const result = this.db.prepare('DELETE FROM ads WHERE id = ?').run(id);
    return result.changes > 0;
  }

  search(query, { page = 1, limit = 20 } = {}) {
    const pattern = `%${query}%`;
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM ads WHERE name LIKE ? OR product LIKE ? OR tags LIKE ?'
    ).get(pattern, pattern, pattern).count;

    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      'SELECT * FROM ads WHERE name LIKE ? OR product LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(pattern, pattern, pattern, limit, offset);

    return { data, total, page, limit };
  }
}
