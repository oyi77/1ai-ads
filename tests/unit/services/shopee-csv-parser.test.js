import { describe, it, expect, beforeEach } from 'vitest';
import { ShopeeCSVParser } from '../../../server/services/shopee-csv-parser.js';

describe('ShopeeCSVParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ShopeeCSVParser();
  });

  // ── CSV parsing ────────────────────────────────────────────────────────

  describe('parseCSVString', () => {
    const sampleCSV = [
      'ID Pemesanan,Status Pesanan,Kode Pesanan Affiliate,Waktu Pemesanan,Waktu Terselesaikan,Waktu Klik,Nama Toko,ID Shop,Tipe toko.,ID Barang,Nama Barange,ID Model,Tipe Produk,ID Promosi,L1 Kategori Global,L2 Kategori Global,L3 Kategori Global,Harga(Rp),Jumlah,Tipe Penawaran,Kampanye Partnerr,Nilai Pembelian(Rp),Jumlah Pengembalian Dana(Rp),Persentase Komisi Shopee pada Produk,Komisi Barang Shopee(Rp),Persentase Komisi XTRA pada Produk,Komisi XTRA Produk(Rp),Total Komisi per Produk(Rp),Komisi Shopee per Pesanan(Rp),Komisi XTRA per Pesanan(Rp),Total Komisi per Pesanan(Rp),Nama MCN Terhubung,ID Kontrak MCN,Persentase Biaya Manajemen MCN,Biaya Manajemen MCN(Rp),Persentase Pembagian Komisi Affiliate,Komisi Bersih Affiliate (Rp),Status Produk Affiliate,Catatan Produk Affiliate',
      'ORD001,Selesai,12345,2026-06-01 10:00:00,2026-06-03 12:00:00,2026-06-01 09:00:00,Shop A,111,Preferred(Non-CB),100,Product Alpha,200,Normal Product,,Perlengkapan Rumah,Kategori B,Kategori C,50000,1,Komisi Shopee,,50000,,1.50%,750,0.00%,0,750,750,0,750,,0,0.00%,0,100.00%,750,Selesai,Pesanan selesai.,Promoted Shop,Ada,creator1,,,,,Facebook',
      'ORD002,Tertunda,12346,2026-06-02 14:30:00,,2026-06-02 13:00:00,Shop B,222,C2C(Non-CB),200,"Product Beta, Special",300,Normal Product,,Fashion,Kategori D,,120000,2,Komisi XTRA,,240000,,2.00%,4800,1.00%,2400,7200,4800,2400,7200,,0,0.00%,0,100.00%,7200,Tertunda,Pesanan sedang diproses.,Non-Promoted Shop,Ada,creator2,,,,,Instagram',
      'ORD003,Dibatalkan,12347,2026-06-03 08:00:00,--,2026-06-03 07:00:00,Shop C,333,C2C(Non-CB),300,Product Gamma,400,Normal Product,,Makanan,Kategori E,,30000,1,Komisi Shopee,,0,30000,0.00%,0,0.00%,0,0,0,0,0,,0,0.00%,0,100.00%,0,Dibatalkan,Pembeli membatalkan pesanan.,Non-Promoted Shop,Ada,creator3,,,,,Threads',
    ].join('\n');

    it('parses valid CSV with Indonesian headers', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders).toHaveLength(3);
    });

    it('extracts correct order IDs', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].orderId).toBe('ORD001');
      expect(orders[1].orderId).toBe('ORD002');
      expect(orders[2].orderId).toBe('ORD003');
    });

    it('extracts product names including quoted fields with commas', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].productName).toBe('Product Alpha');
      expect(orders[1].productName).toBe('Product Beta, Special');
    });

    it('parses commission amounts correctly', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].commission).toBe(750);
      expect(orders[1].commission).toBe(7200);
      expect(orders[2].commission).toBe(0);
    });

    it('parses order amounts correctly', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].orderAmount).toBe(50000);
      expect(orders[1].orderAmount).toBe(240000);
      // Cancelled order has 0 purchase value
      expect(orders[2].orderAmount).toBe(0);
    });

    it('parses dates from Waktu Pemesanan', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].orderDate).toBe('2026-06-01 10:00:00');
      expect(orders[1].orderDate).toBe('2026-06-02 14:30:00');
    });

    it('parses status correctly', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].status).toBe('Selesai');
      expect(orders[1].status).toBe('Tertunda');
      expect(orders[2].status).toBe('Dibatalkan');
    });

    it('parses quantity', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].quantity).toBe(1);
      expect(orders[1].quantity).toBe(2);
    });

    it('extracts shop name', () => {
      const orders = parser.parseCSVString(sampleCSV);
      expect(orders[0].shopName).toBe('Shop A');
      expect(orders[1].shopName).toBe('Shop B');
    });
  });

  describe('parseCSVString edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(parser.parseCSVString('')).toEqual([]);
    });

    it('returns empty array for null/undefined', () => {
      expect(parser.parseCSVString(null)).toEqual([]);
      expect(parser.parseCSVString(undefined)).toEqual([]);
    });

    it('returns empty array for header-only CSV', () => {
      expect(parser.parseCSVString('ID Pemesanan,Status\n')).toEqual([]);
    });

    it('handles BOM at start of file', () => {
      const csv = '\uFEFFID Pemesanan,Status Produk Affiliate,Komisi Bersih Affiliate (Rp),Nilai Pembelian(Rp),Waktu Pemesanan,Nama Barange\nORD99,Selesai,1000,50000,2026-06-01,Test Product\n';
      const orders = parser.parseCSVString(csv);
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('ORD99');
    });

    it('skips malformed rows gracefully', () => {
      const csv = 'ID Pemesanan,Status,Komisi Bersih Affiliate (Rp)\nGOOD1,Selesai,500\n\nGOOD2,Tertunda,300\n';
      const orders = parser.parseCSVString(csv);
      expect(orders).toHaveLength(2);
    });

    it('handles Windows-style line endings (\\r\\n)', () => {
      const csv = 'ID Pemesanan,Status,Komisi Bersih Affiliate (Rp)\r\nORD1,Selesai,100\r\nORD2,Tertunda,200\r\n';
      const orders = parser.parseCSVString(csv);
      expect(orders).toHaveLength(2);
    });

    it('handles English column names', () => {
      const csv = 'Order ID,Status,Commission,Order Amount,Date,Product Name\nEN001,Completed,1500,75000,2026-06-01,Widget A\n';
      const orders = parser.parseCSVString(csv);
      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('EN001');
      expect(orders[0].commission).toBe(1500);
      expect(orders[0].productName).toBe('Widget A');
    });
  });

  // ── Summary calculation ────────────────────────────────────────────────

  describe('calculateSummary', () => {
    const sampleCSV = [
      'ID Pemesanan,Status Produk Affiliate,Komisi Bersih Affiliate (Rp),Nilai Pembelian(Rp),Waktu Pemesanan,Nama Barange',
      'O1,Selesai,1000,50000,2026-06-01,A',
      'O2,Selesai,2000,100000,2026-06-02,B',
      'O3,Tertunda,500,25000,2026-06-03,C',
      'O4,Dibatalkan,0,0,2026-06-04,D',
      'O5,Belum Dibayar,0,30000,2026-06-05,E',
    ].join('\n');

    it('calculates total orders', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const summary = parser.calculateSummary(orders);
      expect(summary.totalOrders).toBe(5);
    });

    it('calculates total revenue', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const summary = parser.calculateSummary(orders);
      expect(summary.totalRevenue).toBe(205000);
    });

    it('calculates total commission', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const summary = parser.calculateSummary(orders);
      expect(summary.totalCommission).toBe(3500);
    });

    it('calculates average order value', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const summary = parser.calculateSummary(orders);
      expect(summary.avgOrderValue).toBe(41000); // 205000 / 5
    });

    it('groups by status correctly', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const summary = parser.calculateSummary(orders);
      expect(summary.byStatus.completed).toBe(2);
      expect(summary.byStatus.pending).toBe(1);
      expect(summary.byStatus.cancelled).toBe(1);
      expect(summary.byStatus.unpaid).toBe(1);
    });

    it('handles empty orders array', () => {
      const summary = parser.calculateSummary([]);
      expect(summary.totalOrders).toBe(0);
      expect(summary.totalRevenue).toBe(0);
      expect(summary.totalCommission).toBe(0);
      expect(summary.avgOrderValue).toBe(0);
    });
  });

  // ── Group by date ──────────────────────────────────────────────────────

  describe('groupByDate', () => {
    const sampleCSV = [
      'ID Pemesanan,Status,Komisi Bersih Affiliate (Rp),Nilai Pembelian(Rp),Waktu Pemesanan,Nama Barange',
      'D1,Selesai,100,5000,2026-06-01 10:00:00,A',
      'D2,Selesai,200,10000,2026-06-01 15:00:00,B',
      'D3,Tertunda,300,15000,2026-06-02 09:00:00,C',
      'D4,Selesai,400,20000,2026-06-02 12:00:00,D',
      'D5,Dibatalkan,0,0,2026-06-03 08:00:00,E',
    ].join('\n');

    it('groups orders by date', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByDate(orders);
      expect(grouped.size).toBe(3);
    });

    it('counts orders per day', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByDate(orders);
      expect(grouped.get('2026-06-01').orders).toBe(2);
      expect(grouped.get('2026-06-02').orders).toBe(2);
      expect(grouped.get('2026-06-03').orders).toBe(1);
    });

    it('sums revenue per day', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByDate(orders);
      expect(grouped.get('2026-06-01').revenue).toBe(15000);
      expect(grouped.get('2026-06-02').revenue).toBe(35000);
      expect(grouped.get('2026-06-03').revenue).toBe(0);
    });

    it('sums commission per day', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByDate(orders);
      expect(grouped.get('2026-06-01').commission).toBe(300);
      expect(grouped.get('2026-06-02').commission).toBe(700);
      expect(grouped.get('2026-06-03').commission).toBe(0);
    });

    it('returns empty map for empty orders', () => {
      const grouped = parser.groupByDate([]);
      expect(grouped.size).toBe(0);
    });
  });

  // ── Group by product ───────────────────────────────────────────────────

  describe('groupByProduct', () => {
    const sampleCSV = [
      'ID Pemesanan,Status,Komisi Bersih Affiliate (Rp),Nilai Pembelian(Rp),Waktu Pemesanan,Nama Barange',
      'P1,Selesai,100,5000,2026-06-01,Widget A',
      'P2,Selesai,200,10000,2026-06-01,Widget B',
      'P3,Selesai,150,8000,2026-06-02,Widget A',
      'P4,Tertunda,50,3000,2026-06-02,Widget C',
      'P5,Selesai,300,15000,2026-06-03,Widget B',
    ].join('\n');

    it('groups orders by product name', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByProduct(orders);
      expect(grouped).toHaveLength(3);
    });

    it('sorts by revenue descending', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByProduct(orders);
      expect(grouped[0].productName).toBe('Widget B'); // 25000
      expect(grouped[1].productName).toBe('Widget A'); // 13000
      expect(grouped[2].productName).toBe('Widget C'); // 3000
    });

    it('counts orders per product', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByProduct(orders);
      expect(grouped.find(p => p.productName === 'Widget A').orders).toBe(2);
      expect(grouped.find(p => p.productName === 'Widget B').orders).toBe(2);
      expect(grouped.find(p => p.productName === 'Widget C').orders).toBe(1);
    });

    it('sums revenue per product', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByProduct(orders);
      expect(grouped.find(p => p.productName === 'Widget B').revenue).toBe(25000);
    });

    it('sums commission per product', () => {
      const orders = parser.parseCSVString(sampleCSV);
      const grouped = parser.groupByProduct(orders);
      expect(grouped.find(p => p.productName === 'Widget A').commission).toBe(250);
      expect(grouped.find(p => p.productName === 'Widget B').commission).toBe(500);
    });

    it('returns empty array for empty orders', () => {
      expect(parser.groupByProduct([])).toEqual([]);
    });
  });

  // ── Number parsing ─────────────────────────────────────────────────────

  describe('_parseNum', () => {
    it('parses plain numbers', () => {
      expect(parser._parseNum('1234')).toBe(1234);
    });

    it('parses numbers with Rp prefix', () => {
      expect(parser._parseNum('Rp50000')).toBe(50000);
      expect(parser._parseNum('Rp 50000')).toBe(50000);
    });

    it('parses numbers with dots as thousands separator', () => {
      expect(parser._parseNum('50.000')).toBe(50000);
      expect(parser._parseNum('1.500.000')).toBe(1500000);
    });

    it('parses percentage strings', () => {
      expect(parser._parseNum('1.50%')).toBe(0.015);
    });

    it('handles zero and empty values', () => {
      expect(parser._parseNum('0')).toBe(0);
      expect(parser._parseNum('')).toBe(0);
      expect(parser._parseNum(null)).toBe(0);
      expect(parser._parseNum(undefined)).toBe(0);
    });

    it('handles numeric input directly', () => {
      expect(parser._parseNum(42)).toBe(42);
    });
  });

  // ── Status normalization ───────────────────────────────────────────────

  describe('_normalizeStatus', () => {
    it('normalizes Indonesian completed statuses', () => {
      expect(parser._normalizeStatus('Selesai')).toBe('completed');
      expect(parser._normalizeStatus('Berhasil')).toBe('completed');
    });

    it('normalizes English completed status', () => {
      expect(parser._normalizeStatus('Completed')).toBe('completed');
    });

    it('normalizes pending statuses', () => {
      expect(parser._normalizeStatus('Tertunda')).toBe('pending');
      expect(parser._normalizeStatus('Pending')).toBe('pending');
    });

    it('normalizes cancelled statuses', () => {
      expect(parser._normalizeStatus('Dibatalkan')).toBe('cancelled');
      expect(parser._normalizeStatus('Cancelled')).toBe('cancelled');
    });

    it('normalizes unpaid status', () => {
      expect(parser._normalizeStatus('Belum Dibayar')).toBe('unpaid');
    });

    it('returns "other" for unknown statuses', () => {
      expect(parser._normalizeStatus('Processing')).toBe('other');
      expect(parser._normalizeStatus('')).toBe('other');
      expect(parser._normalizeStatus(null)).toBe('other');
    });
  });

  // ── CSV line parsing ───────────────────────────────────────────────────

  describe('_parseLine', () => {
    it('splits simple comma-separated values', () => {
      expect(parser._parseLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields with commas', () => {
      expect(parser._parseLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    it('handles escaped quotes inside quoted fields', () => {
      expect(parser._parseLine('"a""b",c')).toEqual(['a"b', 'c']);
    });

    it('handles empty fields', () => {
      expect(parser._parseLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('handles trailing comma', () => {
      expect(parser._parseLine('a,b,')).toEqual(['a', 'b', '']);
    });
  });
});
