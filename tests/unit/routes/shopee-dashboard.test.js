import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createShopeeDashboardRouter } from '../../../server/routes/shopee-dashboard.js';

function createMockSettingsRepo(store = {}) {
  return {
    get: vi.fn((key) => store[key] ?? null),
    set: vi.fn((key, value) => { store[key] = value; }),
  };
}

function createMockShopeeAdapter(orders = []) {
  return {
    fetchOrders: vi.fn(async () => orders),
  };
}

function createApp(shopeeAdapter, settingsRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/shopee', createShopeeDashboardRouter(shopeeAdapter, settingsRepo));
  return app;
}

const sampleAccounts = [
  { id: 'acc-1', seller_id: 'seller-001', name: 'Store A', country: 'id' },
  { id: 'acc-2', seller_id: 'seller-002', name: 'Store B', country: 'my' },
];

const sampleOrders = [
  { order_id: 'ORD-001', status: 'COMPLETED', total: 150000, commission: 7500, created_at: '2026-06-01T10:00:00Z' },
  { order_id: 'ORD-002', status: 'PROCESSING', total: 200000, commission: 10000, created_at: '2026-06-02T14:30:00Z' },
  { order_id: 'ORD-003', status: 'COMPLETED', total: 50000, commission: 2500, created_at: '2026-06-03T08:00:00Z' },
];

describe('Shopee Dashboard Router', () => {
  let app, settingsRepo, shopeeAdapter, store;

  beforeEach(() => {
    store = {};
    settingsRepo = createMockSettingsRepo(store);
    shopeeAdapter = createMockShopeeAdapter(sampleOrders);
  });

  describe('GET /api/shopee/accounts', () => {
    it('returns empty array when no accounts configured', async () => {
      app = createApp(shopeeAdapter, settingsRepo);
      const res = await request(app).get('/api/shopee/accounts');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accounts).toEqual([]);
    });

    it('returns configured accounts from settings', async () => {
      store['shopee_accounts'] = JSON.stringify(sampleAccounts);
      app = createApp(shopeeAdapter, settingsRepo);
      const res = await request(app).get('/api/shopee/accounts');
      expect(res.status).toBe(200);
      expect(res.body.accounts).toHaveLength(2);
      expect(res.body.accounts[0].name).toBe('Store A');
    });
  });

  describe('GET /api/shopee/accounts/:accountId/orders', () => {
    beforeEach(() => {
      store['shopee_accounts'] = JSON.stringify(sampleAccounts);
      app = createApp(shopeeAdapter, settingsRepo);
    });

    it('returns 404 for unknown account', async () => {
      const res = await request(app).get('/api/shopee/accounts/nonexistent/orders');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Account not found');
    });

    it('fetches orders for a valid account', async () => {
      const res = await request(app).get('/api/shopee/accounts/acc-1/orders');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orders).toHaveLength(3);
      expect(res.body.accountId).toBe('acc-1');
      expect(shopeeAdapter.fetchOrders).toHaveBeenCalledWith(
        expect.objectContaining({ sellerId: 'seller-001' })
      );
    });

    it('passes page and limit params to adapter', async () => {
      await request(app).get('/api/shopee/accounts/acc-1/orders?page=2&limit=10');
      expect(shopeeAdapter.fetchOrders).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 10, sellerId: 'seller-001' })
      );
    });

    it('returns 500 when adapter throws', async () => {
      shopeeAdapter.fetchOrders.mockRejectedValueOnce(new Error('network error'));
      const res = await request(app).get('/api/shopee/accounts/acc-1/orders');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch orders');
    });
  });

  describe('GET /api/shopee/accounts/:accountId/summary', () => {
    beforeEach(() => {
      store['shopee_accounts'] = JSON.stringify(sampleAccounts);
      app = createApp(shopeeAdapter, settingsRepo);
    });

    it('returns 404 for unknown account', async () => {
      const res = await request(app).get('/api/shopee/accounts/unknown/summary');
      expect(res.status).toBe(404);
    });

    it('computes order summary correctly', async () => {
      const res = await request(app).get('/api/shopee/accounts/acc-1/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.totalOrders).toBe(3);
      expect(res.body.summary.totalRevenue).toBe(400000);
      expect(res.body.summary.totalCommission).toBe(20000);
    });

    it('returns zero summary when no orders', async () => {
      shopeeAdapter.fetchOrders.mockResolvedValueOnce([]);
      const res = await request(app).get('/api/shopee/accounts/acc-1/summary');
      expect(res.status).toBe(200);
      expect(res.body.summary.totalOrders).toBe(0);
      expect(res.body.summary.totalRevenue).toBe(0);
      expect(res.body.summary.totalCommission).toBe(0);
    });
  });

  describe('POST /api/shopee/upload', () => {
    it('rejects files larger than 10MB', async () => {
      app = createApp(shopeeAdapter, settingsRepo);
      const bigBody = 'a'.repeat(11 * 1024 * 1024);
      const res = await request(app)
        .post('/api/shopee/upload')
        .set('Content-Type', 'text/csv')
        .send(bigBody);
      expect(res.status).toBe(413);
    });

    it('accepts raw CSV body upload', async () => {
      app = createApp(shopeeAdapter, settingsRepo);
      const csv = 'order_id,amount\nORD-1,100\nORD-2,200\n';
      const res = await request(app)
        .post('/api/shopee/upload')
        .set('Content-Type', 'text/csv')
        .send(csv);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.file.filename).toBe('upload.csv');
      expect(res.body.file.rows).toBe(3); // header + 2 data rows
      expect(settingsRepo.set).toHaveBeenCalled();
    });
  });

  describe('GET /api/shopee/uploads', () => {
    it('returns empty list when no uploads', async () => {
      app = createApp(shopeeAdapter, settingsRepo);
      const res = await request(app).get('/api/shopee/uploads');
      expect(res.status).toBe(200);
      expect(res.body.uploads).toEqual([]);
    });

    it('lists uploads without embedded data', async () => {
      store['shopee_uploads'] = JSON.stringify([
        { id: 'u1', filename: 'test.csv', size: 100, rows: 5, uploadedAt: '2026-06-09T00:00:00Z', data: 'a,b\n1,2\n' },
      ]);
      app = createApp(shopeeAdapter, settingsRepo);
      const res = await request(app).get('/api/shopee/uploads');
      expect(res.status).toBe(200);
      expect(res.body.uploads).toHaveLength(1);
      expect(res.body.uploads[0].id).toBe('u1');
      expect(res.body.uploads[0]).not.toHaveProperty('data');
    });
  });

  describe('DELETE /api/shopee/uploads/:fileId', () => {
    beforeEach(() => {
      store['shopee_uploads'] = JSON.stringify([
        { id: 'u1', filename: 'test.csv', size: 100, rows: 5, data: 'a,b\n' },
        { id: 'u2', filename: 'other.csv', size: 200, rows: 10, data: 'c,d\n' },
      ]);
      app = createApp(shopeeAdapter, settingsRepo);
    });

    it('returns 404 for unknown file', async () => {
      const res = await request(app).delete('/api/shopee/uploads/unknown');
      expect(res.status).toBe(404);
    });

    it('deletes specified upload and persists', async () => {
      const res = await request(app).delete('/api/shopee/uploads/u1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Verify the set call stored only u2
      const setCall = settingsRepo.set.mock.calls.find(c => c[0] === 'shopee_uploads');
      const remaining = JSON.parse(setCall[1]);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('u2');
    });
  });
});
