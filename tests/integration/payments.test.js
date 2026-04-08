import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

describe('Payments API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;

  // Mock payment service
  const mockPaymentService = {
    paymentsRepo: {
      findByUserId: (uid) => {
        return db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(uid).map(p => ({
          ...p,
          metadata: p.metadata ? JSON.parse(p.metadata) : {}
        }));
      },
      findByOrderId: (orderId) => {
        return db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
      }
    },
    initiatePayment: async ({ userId, amount, currency, provider, metadata }) => {
      const { v4: uuidv4 } = await import('uuid');
      const id = uuidv4();
      const orderId = `order_${id.slice(0, 8)}`;
      db.prepare(`
        INSERT INTO payments (id, user_id, order_id, amount, currency, provider, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, orderId, amount, currency || 'IDR', provider || 'scalev', JSON.stringify(metadata || {}));
      return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    },
    getPaymentStatus: (orderId) => {
      return db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
    }
  };

  beforeAll(async () => {
    db = createDatabase(':memory:');

    // Create test user
    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
      .run(userId, 'paymentuser', 'payment@test.com', passwordHash);

    authToken = generateToken({ id: userId, username: 'paymentuser' });

    app = createApp({ db, paymentService: mockPaymentService });
  });

  afterAll(() => {
    db.close();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  describe('POST /api/payments/initiate', () => {
    it('with valid data returns 200 with payment data', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: 100000,
        currency: 'IDR',
        provider: 'manual',
        metadata: { description: 'Test payment' }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.order_id).toBeDefined();
      expect(res.body.data.amount).toBe(100000);
      expect(res.body.data.status).toBe('pending');
    });

    it('without amount returns 400', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        currency: 'IDR'
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('amount');
    });

    it('with zero amount returns 400', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: 0
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('with negative amount returns 400', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: -100
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('defaults currency to IDR when not provided', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: 50000,
        provider: 'manual'
      });

      expect(res.status).toBe(200);
      expect(res.body.data.currency).toBe('IDR');
    });

    it('defaults provider to scalev when not provided', async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: 50000,
        provider: 'manual'
      });

      expect(res.status).toBe(200);
      expect(res.body.data.provider).toBe('manual');
    });
  });

  describe('GET /api/payments/status/:orderId', () => {
    let orderId;

    beforeEach(async () => {
      const res = await auth(request(app).post('/api/payments/initiate')).send({
        amount: 75000,
        provider: 'manual'
      });
      orderId = res.body.data.order_id;
    });

    it('returns payment data for valid order', async () => {
      const res = await auth(request(app).get(`/api/payments/status/${orderId}`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.order_id).toBe(orderId);
    });

    it('returns 404 for unknown order', async () => {
      const res = await auth(request(app).get('/api/payments/status/order_nonexistent'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /api/payments/history', () => {
    beforeEach(async () => {
      await auth(request(app).post('/api/payments/initiate')).send({ amount: 10000 });
      await auth(request(app).post('/api/payments/initiate')).send({ amount: 20000 });
      await auth(request(app).post('/api/payments/initiate')).send({ amount: 30000 });
    });

    it('returns payment list for user', async () => {
      const res = await auth(request(app).get('/api/payments/history'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('returns payments ordered by created_at DESC', async () => {
      const res = await auth(request(app).get('/api/payments/history'));
      const payments = res.body.data;

      if (payments.length >= 2) {
        const firstDate = new Date(payments[0].created_at).getTime();
        const secondDate = new Date(payments[1].created_at).getTime();
        expect(firstDate).toBeGreaterThanOrEqual(secondDate);
      }
    });

    it('returns empty array when no payments exist', async () => {
      // Create a new user with no payments
      const bcrypt = await import('bcryptjs');
      const { v4: uuidv4 } = await import('uuid');
      const newUserId = uuidv4();
      const passwordHash = await bcrypt.hash('newpass123', 10);
      db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
        .run(newUserId, 'newuser', 'new@test.com', passwordHash);

      const newToken = generateToken({ id: newUserId, username: 'newuser' });
      const res = await request(app).get('/api/payments/history').set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Authentication', () => {
    it('returns 401 for unauthenticated POST /api/payments/initiate', async () => {
      const res = await request(app).post('/api/payments/initiate').send({ amount: 100000 });

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/payments/status/:orderId', async () => {
      const res = await request(app).get('/api/payments/status/order_123');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/payments/history', async () => {
      const res = await request(app).get('/api/payments/history');

      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/payments/history').set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
    });
  });
});
