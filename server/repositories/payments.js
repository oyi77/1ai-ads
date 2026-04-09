import { v4 as uuidv4 } from 'uuid';

export class PaymentsRepository {
  constructor(db) {
    this.db = db;
  }

  create({ userId, orderId, amount, currency, provider, providerRef, metadata }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO payments (id, user_id, order_id, amount, currency, provider, provider_ref, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, orderId || null, amount, currency || 'IDR', provider || 'scalev', providerRef || null, JSON.stringify(metadata || {}));
    return this.findById(id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  }

  findByUserId(userId, { limit } = {}) {
    let query = 'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC';
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    return this.db.prepare(query).all(userId);
  }

  findByOrderId(orderId) {
    return this.db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
  }

  updateStatus(id, status) {
    this.db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status, id);
    return this.findById(id);
  }
}
