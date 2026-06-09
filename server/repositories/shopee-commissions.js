import { randomUUID } from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('shopee-commissions');

export class ShopeeCommissionsRepository {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shopee_commissions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        order_id TEXT,
        product_name TEXT,
        shop_name TEXT,
        commission_rate REAL,
        commission_amount REAL,
        order_amount REAL,
        quantity INTEGER DEFAULT 1,
        status TEXT,
        order_date TEXT,
        completion_date TEXT,
        raw_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    // Index for fast account lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shopee_commissions_account
        ON shopee_commissions(account_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shopee_commissions_date
        ON shopee_commissions(account_id, order_date)
    `);
  }

  /**
   * Insert a single commission order.
   * @param {string} accountId
   * @param {object} order — normalized order from ShopeeCSVParser
   * @returns {string} inserted row id
   */
  create(accountId, order) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO shopee_commissions
        (id, account_id, order_id, product_name, shop_name, commission_rate,
         commission_amount, order_amount, quantity, status, order_date,
         completion_date, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      accountId,
      order.orderId || null,
      order.productName || null,
      order.shopName || null,
      order.commissionRate || 0,
      order.commission || 0,
      order.orderAmount || 0,
      order.quantity || 1,
      order.status || null,
      order.orderDate || null,
      order.completionDate || null,
      JSON.stringify(order),
    );
    return id;
  }

  /**
   * Bulk insert commission orders in a transaction.
   * @param {string} accountId
   * @param {Array<object>} orders
   * @returns {number} count of inserted rows
   */
  bulkCreate(accountId, orders) {
    const insert = this.db.prepare(`
      INSERT INTO shopee_commissions
        (id, account_id, order_id, product_name, shop_name, commission_rate,
         commission_amount, order_amount, quantity, status, order_date,
         completion_date, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((rows) => {
      for (const order of rows) {
        insert.run(
          randomUUID(),
          accountId,
          order.orderId || null,
          order.productName || null,
          order.shopName || null,
          order.commissionRate || 0,
          order.commission || 0,
          order.orderAmount || 0,
          order.quantity || 1,
          order.status || null,
          order.orderDate || null,
          order.completionDate || null,
          JSON.stringify(order),
        );
      }
    });

    insertMany(orders);
    log.info('Bulk inserted commissions', { accountId, count: orders.length });
    return orders.length;
  }

  /**
   * Find commissions for an account.
   * @param {string} accountId
   * @param {number} limit
   * @returns {Array<object>}
   */
  findByAccount(accountId, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM shopee_commissions
      WHERE account_id = ?
      ORDER BY order_date DESC, created_at DESC
      LIMIT ?
    `).all(accountId, limit);
  }

  /**
   * Aggregate summary for an account.
   * @param {string} accountId
   * @returns {{ totalOrders: number, totalRevenue: number, totalCommission: number }}
   */
  getSummaryByAccount(accountId) {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as totalOrders,
        COALESCE(SUM(order_amount), 0) as totalRevenue,
        COALESCE(SUM(commission_amount), 0) as totalCommission
      FROM shopee_commissions
      WHERE account_id = ?
    `).get(accountId);

    return {
      totalOrders: row.totalOrders,
      totalRevenue: row.totalRevenue,
      totalCommission: row.totalCommission,
    };
  }

  /**
   * Daily summary for an account over the last N days.
   * @param {string} accountId
   * @param {number} days
   * @returns {Array<{date: string, orders: number, revenue: number, commission: number}>}
   */
  getDailySummary(accountId, days = 30) {
    return this.db.prepare(`
      SELECT
        SUBSTR(order_date, 1, 10) as date,
        COUNT(*) as orders,
        COALESCE(SUM(order_amount), 0) as revenue,
        COALESCE(SUM(commission_amount), 0) as commission
      FROM shopee_commissions
      WHERE account_id = ?
        AND order_date >= DATE('now', ?)
      GROUP BY SUBSTR(order_date, 1, 10)
      ORDER BY date DESC
    `).all(accountId, `-${days} days`);
  }

  /**
   * Delete all commission data for an account.
   * @param {string} accountId
   * @returns {number} deleted count
   */
  deleteByAccount(accountId) {
    const result = this.db.prepare(`
      DELETE FROM shopee_commissions WHERE account_id = ?
    `).run(accountId);
    log.info('Deleted commissions', { accountId, deleted: result.changes });
    return result.changes;
  }
}
