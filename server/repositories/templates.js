export class TemplatesRepository {
  constructor(db) {
    this.db = db;
  }

  getAll(filters = {}) {
    let query = 'SELECT * FROM templates';
    const params = [];

    if (filters.category) {
      query += ' WHERE category = ?';
      params.push(filters.category);
    }
    if (filters.industry) {
      query += params.length ? ' AND' : ' WHERE';
      query += ' industry = ?';
      params.push(filters.industry);
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query += params.length ? ' AND' : ' WHERE';
      query += ' (name LIKE ? OR description LIKE ?)';
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';
    return this.db.prepare(query).all(...params);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  }

  create(data) {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.db.prepare(`
      INSERT INTO templates (
        id, category, name, description,
        hook_template, body_template, cta_template,
        design_config, thumbnail_url, industry,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
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
