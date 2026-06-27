import { readFileSync } from 'fs';
import { createLogger } from '../lib/logger.js';

const log = createLogger('shopee-csv');

/**
 * Shopee Affiliate Commission CSV parser.
 * Handles both Indonesian (Shopee ID) and English column headers.
 * No external CSV library — manual parsing with quoted-field support.
 */
export class ShopeeCSVParser {
  /**
   * Parse a CSV file from disk.
   * @param {string} filePath
   * @returns {Array<object>} parsed orders
   */
  parseCSV(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return this.parseCSVString(raw);
    } catch (err) {
      log.error('Failed to read CSV file', { filePath, error: err.message });
      return [];
    }
  }

  /**
   * Parse a CSV from a raw string (e.g. uploaded buffer).
   * @param {string} csvString
   * @returns {Array<object>} parsed orders
   */
  parseCSVString(csvString) {
    if (!csvString || !csvString.trim()) return [];

    // Strip BOM if present
    const text = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = this._parseLine(lines[0]).map(h => h.trim());
    const orders = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this._parseLine(lines[i]);
        if (values.length === 0) continue;

        const row = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = (values[j] || '').trim();
        }

        const order = this._mapRow(row);
        if (order.orderId) {
          orders.push(order);
        }
      } catch {
        // Skip malformed rows
        continue;
      }
    }

    log.info('Parsed Shopee CSV', { rows: orders.length, totalLines: lines.length - 1 });
    return orders;
  }

  /**
   * Calculate aggregate summary from parsed orders.
   * @param {Array<object>} orders
   * @returns {object}
   */
  calculateSummary(orders) {
    const summary = {
      totalOrders: orders.length,
      totalRevenue: 0,
      totalCommission: 0,
      avgOrderValue: 0,
      byStatus: { completed: 0, pending: 0, cancelled: 0, unpaid: 0, other: 0 },
    };

    for (const order of orders) {
      summary.totalRevenue += order.orderAmount || 0;
      summary.totalCommission += order.commission || 0;

      const status = this._normalizeStatus(order.status);
      if (status in summary.byStatus) {
        summary.byStatus[status]++;
      } else {
        summary.byStatus.other++;
      }
    }

    summary.avgOrderValue = summary.totalOrders > 0
      ? Math.round(summary.totalRevenue / summary.totalOrders)
      : 0;

    return summary;
  }

  /**
   * Group orders by date string (YYYY-MM-DD).
   * @param {Array<object>} orders
   * @returns {Map<string, {orders: number, revenue: number, commission: number}>}
   */
  groupByDate(orders) {
    const groups = new Map();

    for (const order of orders) {
      const date = (order.orderDate || '').slice(0, 10);
      if (!date) continue;

      let bucket = groups.get(date);
      if (!bucket) {
        bucket = { orders: 0, revenue: 0, commission: 0 };
        groups.set(date, bucket);
      }

      bucket.orders++;
      bucket.revenue += order.orderAmount || 0;
      bucket.commission += order.commission || 0;
    }

    return groups;
  }

  /**
   * Group orders by product name, sorted descending by revenue.
   * @param {Array<object>} orders
   * @returns {Array<{productName: string, orders: number, revenue: number, commission: number}>}
   */
  groupByProduct(orders) {
    const map = new Map();

    for (const order of orders) {
      const name = order.productName || 'Unknown';
      let bucket = map.get(name);
      if (!bucket) {
        bucket = { productName: name, orders: 0, revenue: 0, commission: 0 };
        map.set(name, bucket);
      }

      bucket.orders++;
      bucket.revenue += order.orderAmount || 0;
      bucket.commission += order.commission || 0;
    }

    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Parse a single CSV line, respecting quoted fields that may contain commas.
   * @param {string} line
   * @returns {string[]}
   */
  _parseLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQuotes) {
        if (ch === '"') {
          // Check for escaped quote ""
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }

    fields.push(current);
    return fields;
  }

  /**
   * Map a raw CSV row (header→value) to a normalized order object.
   * Supports both Indonesian and English column names.
   */
  _mapRow(row) {
    // Try Indonesian headers first, then English
    const orderId = row['ID Pemesanan'] || row['Order ID'] || row['order_id'] || '';
    const status = row['Status Produk Affiliate'] || row['Status Pesanan'] || row['Status'] || row['status'] || '';
    const productName = row['Nama Barange'] || row['Product Name'] || row['product_name'] || '';
    const shopName = row['Nama Toko'] || row['Shop Name'] || '';

    // Commission: prefer Net Affiliate, fall back to Total per Order, then Commission column
    const commission = this._parseNum(
      row['Komisi Bersih Affiliate (Rp)'] ||
      row['Total Komisi per Pesanan(Rp)'] ||
      row['Commission'] || row['commission'] || '0'
    );

    // Order amount: Nilai Pembelian or Harga
    const orderAmount = this._parseNum(
      row['Nilai Pembelian(Rp)'] ||
      row['Harga(Rp)'] ||
      row['Order Amount'] || row['order_amount'] || '0'
    );

    // Commission rate
    const commissionRate = this._parseNum(
      row['Persentase Pembagian Komisi Affiliate'] ||
      row['Commission Rate'] || row['commission_rate'] || '0'
    );

    // Date: prefer order time
    const orderDate = row['Waktu Pemesanan'] || row['Order Time'] || row['date'] || row['Date'] || '';
    const completionDate = row['Waktu Terselesaikan'] || row['Completion Time'] || '';

    // Quantity
    const quantity = parseInt(row['Jumlah'] || row['Quantity'] || '1', 10) || 1;

    return {
      orderId,
      status,
      productName,
      shopName,
      commission,
      orderAmount,
      commissionRate,
      orderDate,
      completionDate,
      quantity,
    };
  }

  /**
   * Parse a number from a string, handling Indonesian/Rp formatting.
   * Strips "Rp", dots (thousands separator), and extra spaces.
   */
  _parseNum(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const str = String(value).trim();
    // Handle percentage: "150%" → 1.5
    if (str.endsWith('%')) {
      const num = parseFloat(str.slice(0, -1));
      return Number.isFinite(num) ? num / 100 : 0;
    }
    // Remove Rp prefix, dots used as thousands separator, and whitespace
    const cleaned = str.replace(/Rp\s*/gi, '').replace(/\./g, '').replace(/,/g, '.').trim();
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  /**
   * Normalize status strings to a standard set.
   */
  _normalizeStatus(status) {
    if (!status) return 'other';
    const s = status.toLowerCase();
    if (s === 'selesai' || s === 'selesai' || s === 'completed' || s === 'berhasil') return 'completed';
    if (s === 'tertunda' || s === 'pending') return 'pending';
    if (s === 'dibatalkan' || s === 'cancelled' || s === 'canceled') return 'cancelled';
    if (s === 'belum dibayar' || s === 'unpaid') return 'unpaid';
    return 'other';
  }
}
