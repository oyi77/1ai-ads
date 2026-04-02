import { v4 as uuid } from 'uuid';

export class LandingRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ page = 1, limit = 20 } = {}) {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM landing_pages').get().count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      'SELECT * FROM landing_pages ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    return { data, total, page, limit };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(id) || null;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO landing_pages (id, name, template, theme, product_name, price, pain_points, benefits, cta_primary, cta_secondary, wa_link, checkout_link, html_output, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.template || 'dark', data.theme || 'dark',
      data.product_name || null, data.price || null,
      typeof data.pain_points === 'string' ? data.pain_points : JSON.stringify(data.pain_points || []),
      typeof data.benefits === 'string' ? data.benefits : JSON.stringify(data.benefits || []),
      data.cta_primary || null, data.cta_secondary || null,
      data.wa_link || null, data.checkout_link || null,
      data.html_output || null, data.status || 'draft'
    );
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;

    const fields = [];
    const params = [];
    const updatable = ['name', 'template', 'theme', 'product_name', 'price', 'pain_points', 'benefits', 'cta_primary', 'cta_secondary', 'wa_link', 'checkout_link', 'html_output', 'status'];

    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        const val = data[field];
        if ((field === 'pain_points' || field === 'benefits') && typeof val !== 'string') {
          params.push(JSON.stringify(val));
        } else {
          params.push(val);
        }
      }
    }

    if (fields.length === 0) return existing;

    params.push(id);
    this.db.prepare(`UPDATE landing_pages SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  remove(id) {
    const result = this.db.prepare('DELETE FROM landing_pages WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
