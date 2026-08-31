import { v4 as uuidv4 } from 'uuid';

export class InvoicesRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ userId, status, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    if (status) { where.push('status = ?'); params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM invoices ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM invoices ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  findById(id, userId) {
    if (userId) {
      return this.db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(id, userId) || null;
    }
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) || null;
  }

  create({ userId, amount, currency = 'IDR', description, lineItems = [], dueDate }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO invoices (id, user_id, amount, currency, description, line_items, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, amount, currency, description || null, JSON.stringify(lineItems), dueDate || null);
    return this.findById(id);
  }

  updateStatus(id, status, extra = {}, userId) {
    const existing = this.findById(id, userId);
    if (!existing) return null;
    const fields = ['status = ?', 'updated_at = datetime(\'now\')'];
    const params = [status];
    if (extra.paidAt) { fields.push('paid_at = ?'); params.push(extra.paidAt); }
    if (userId) {
      this.db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params, id, userId);
    } else {
      this.db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
    }
    return this.findById(id, userId);
  }

  remove(id) {
    const result = this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
