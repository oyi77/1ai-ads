export class TemplatesRepository {
  constructor(db) {
    this.db = db;
  }

  getAll({ category, industry, search, userId, page = 1, limit = 50 } = {}) {
    let whereClause = '';
    const params = [];

    const conditions = [];
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (industry) {
      conditions.push('industry = ?');
      params.push(industry);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(searchTerm, searchTerm);
    }
    if (userId) {
      conditions.push('(user_id = ? OR user_id = ?)');
      params.push(userId, 'system');
    }
    if (conditions.length) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM templates ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM templates ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  }

  create(data) {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.db.prepare(`
      INSERT INTO templates (
        id, user_id, category, name, description,
        hook_template, body_template, cta_template,
        design_config, thumbnail_url, industry,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      data.userId || data.user_id || 'system',
      data.category || 'general',
      data.name || 'Untitled Template',
      data.description || '',
      data.hook_template || '',
      data.body_template || '',
      data.cta_template || '',
      JSON.stringify(data.design_config || {}),
      data.thumbnail_url || '',
      data.industry || ''
    );
    return this.getById(id);
  }

  update(id, data) {
    const updates = [];
    const values = [];

    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.hook_template !== undefined) {
      updates.push('hook_template = ?');
      values.push(data.hook_template);
    }
    if (data.body_template !== undefined) {
      updates.push('body_template = ?');
      values.push(data.body_template);
    }
    if (data.cta_template !== undefined) {
      updates.push('cta_template = ?');
      values.push(data.cta_template);
    }
    if (data.design_config !== undefined) {
      updates.push('design_config = ?');
      values.push(JSON.stringify(data.design_config));
    }
    if (data.thumbnail_url !== undefined) {
      updates.push('thumbnail_url = ?');
      values.push(data.thumbnail_url);
    }
    if (data.industry !== undefined) {
      updates.push('industry = ?');
      values.push(data.industry);
    }

    if (updates.length > 0) {
      values.push(id);
      this.db.prepare(`
        UPDATE templates
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(...values);
      return this.getById(id);
    }
    return this.getById(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return { success: true };
  }
}
