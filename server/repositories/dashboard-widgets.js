import { v4 as uuid } from 'uuid';

export class DashboardWidgetsRepository {
  constructor(db) {
    this.db = db;
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO dashboard_widgets (id, user_id, widget_type, config, position, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId,
      data.widgetType,
      typeof data.config === 'string' ? data.config : JSON.stringify(data.config || {}),
      data.position ?? 0,
      data.size || 'medium'
    );
    return this.db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id);
  }

  getByUser(userId) {
    return this.db.prepare('SELECT * FROM dashboard_widgets WHERE user_id = ? ORDER BY position').all(userId);
  }

  update(id, data) {
    const existing = this.db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id);
    if (!existing) return null;

    const fields = [];
    const params = [];
    const updatable = ['widget_type', 'config', 'position', 'size'];

    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(field === 'config' && typeof data[field] !== 'string'
          ? JSON.stringify(data[field])
          : data[field]);
      }
    }

    if (fields.length === 0) return existing;

    params.push(id);
    this.db.prepare(`UPDATE dashboard_widgets SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id);
  }

  reorder(userId, widgetIds) {
    const stmt = this.db.prepare('UPDATE dashboard_widgets SET position = ? WHERE id = ? AND user_id = ?');
    const reorderTx = this.db.transaction((ids) => {
      for (let i = 0; i < ids.length; i++) {
        stmt.run(i, ids[i], userId);
      }
    });
    reorderTx(widgetIds);
    return this.getByUser(userId);
  }

  delete(id) {
    const result = this.db.prepare('DELETE FROM dashboard_widgets WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
