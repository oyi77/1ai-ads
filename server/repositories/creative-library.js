import { v4 as uuid } from 'uuid';

export class CreativeLibraryRepository {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO creative_library (id, user_id, name, type, hook, body, cta, image_url, video_url, tags, platform, performance_score, times_used, best_roas, best_ctr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId,
      data.name,
      data.type || 'copy',
      data.hook || null,
      data.body || null,
      data.cta || null,
      data.imageUrl || null,
      data.videoUrl || null,
      typeof data.tags === 'string' ? data.tags : JSON.stringify(data.tags || []),
      data.platform || null,
      data.performanceScore ?? null,
      data.timesUsed ?? 0,
      data.bestRoas ?? null,
      data.bestCtr ?? null
    );
    return this.findById(id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM creative_library WHERE id = ?').get(id) || null;
  }

  list({ userId, type, tags, platform, sortBy = 'created_at', page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];

    if (userId) { where.push('user_id = ?'); params.push(userId); }
    if (type) { where.push('type = ?'); params.push(type); }
    if (tags) {
      const tagArr = Array.isArray(tags) ? tags : [tags];
      for (const tag of tagArr) {
        where.push('tags LIKE ?');
        params.push(`%${tag}%`);
      }
    }
    if (platform) { where.push('platform = ?'); params.push(platform); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const allowedSorts = ['created_at', 'updated_at', 'performance_score', 'times_used', 'best_roas', 'best_ctr'];
    const sortColumn = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM creative_library ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM creative_library ${whereClause} ORDER BY ${sortColumn} DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { data, total, page, limit };
  }

  update(id, data, userId) {
    const existing = this.findById(id);
    if (!existing) return null;
    if (userId && existing.user_id !== userId) return null;

    const fields = [];
    const params = [];
    const updatable = ['name', 'type', 'hook', 'body', 'cta', 'image_url', 'video_url', 'tags', 'platform', 'performance_score', 'best_roas', 'best_ctr'];

    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(field === 'tags' && typeof data[field] !== 'string'
          ? JSON.stringify(data[field])
          : data[field]);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    params.push(id);
    this.db.prepare(`UPDATE creative_library SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  incrementUsage(id, userId) {
    const sql = userId
      ? "UPDATE creative_library SET times_used = times_used + 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
      : "UPDATE creative_library SET times_used = times_used + 1, updated_at = datetime('now') WHERE id = ?";
    this.db.prepare(sql).run(userId ? [id, userId] : [id]);
    return this.findById(id);
  }

  delete(id, userId) {
    if (userId) {
      const result = this.db.prepare('DELETE FROM creative_library WHERE id = ? AND user_id = ?').run(id, userId);
      return result.changes > 0;
    }
    const result = this.db.prepare('DELETE FROM creative_library WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getTopPerformers({ userId, metric = 'best_roas', limit = 10 } = {}) {
    const allowedMetrics = ['best_roas', 'best_ctr', 'performance_score', 'times_used'];
    const sortColumn = allowedMetrics.includes(metric) ? metric : 'best_roas';

    let query = `SELECT * FROM creative_library WHERE ${sortColumn} IS NOT NULL`;
    const params = [];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    query += ` ORDER BY ${sortColumn} DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }
}
