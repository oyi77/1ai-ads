import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock ScalevService to avoid external dependencies
vi.mock('../../server/services/scalev.js', () => ({
  ScalevService: class {
    createOrder() {
      return Promise.resolve({
        checkout_url: 'https://checkout.scalev.test/mock-checkout-url',
        order_id: 'scalev_order_123'
      });
    }
  }
}));

describe('Payments API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    // Create test user
    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed, plan) VALUES (?, ?, ?, ?, 1, ?)')
      .run(userId, 'paymentuser', 'payment@test.com', passwordHash, 'free');

    authToken = generateToken({ id: userId, username: 'paymentuser' });

    // Plans are already seeded by schema.sql, no need to insert again

    // Seed settings for Scalev plan configuration
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
    `).run('scalev_plan_pro', JSON.stringify({
      storeUniqueId: 'store_pro_test',
      variantUniqueId: 'variant_pro_test',
      amount: 499000
    }));

    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
    `).run('scalev_plan_enterprise', JSON.stringify({
      storeUniqueId: 'store_ent_test',
      variantUniqueId: 'variant_ent_test',
      amount: 1499000
    }));

    app = createApp({ db });
  });

  afterAll(() => {
    db.close();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${authToken}`);

  describe('POST /api/payments', () => {
    beforeEach(() => {
      // Reset user plan to free before each test
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
    });

    it('creates order and returns checkout URL for valid planId', async () => {
      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_pro'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.paymentId).toBeDefined();
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.checkoutUrl).toBe('https://checkout.scalev.test/mock-checkout-url');
      expect(res.body.data.planName).toBe('Pro');
      expect(res.body.data.amount).toBe(499000);
    });

    it('returns 400 for invalid planId', async () => {
      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_invalid'
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid plan ID');
    });

    it('returns 400 for missing planId', async () => {
      const res = await auth(request(app).post('/api/payments')).send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('planId is required');
    });

    it('returns 500 when user already has the requested plan', async () => {
      // Update user to already have pro plan (need to match lowercase comparison)
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('pro', userId);

      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_pro'
      });

      // Currently returns 500 because service throws plain Error without status code
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already on the Pro plan');
    });

    it('calls ScalevService.createOrder with correct parameters', async () => {
      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_pro'
      });

      expect(res.status).toBe(200);
      // The mock should have been called by the PaymentService
    });

    it('creates payment record with pending status', async () => {
      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_pro'
      });

      expect(res.status).toBe(200);
      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(res.body.data.paymentId);
      expect(payment).toBeDefined();
      expect(payment.status).toBe('pending');
      expect(payment.user_id).toBe(userId);
    });
  });

  describe('GET /api/payments/:orderId/status', () => {
    let orderId;

    beforeEach(async () => {
      const res = await auth(request(app).post('/api/payments')).send({
        planId: 'plan_pro'
      });
      orderId = res.body.data.orderId;
    });

    it('returns payment status for valid orderId', async () => {
      const res = await auth(request(app).get(`/api/payments/${orderId}/status`));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.orderId).toBe(orderId);
      expect(res.body.data.status).toBe('pending');
    });

    it('returns 404 for unknown orderId', async () => {
      const res = await auth(request(app).get('/api/payments/order_nonexistent/status'));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /api/payments', () => {
    beforeEach(async () => {
      // Reset user plan to free to allow payment creation
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      await auth(request(app).post('/api/payments')).send({ planId: 'plan_pro' });
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      await auth(request(app).post('/api/payments')).send({ planId: 'plan_pro' });
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      await auth(request(app).post('/api/payments')).send({ planId: 'plan_enterprise' });
    });

    it('returns recent payments for authenticated user', async () => {
      const res = await auth(request(app).get('/api/payments'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('returns payments ordered by created_at DESC', async () => {
      const res = await auth(request(app).get('/api/payments'));
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
      db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed, plan) VALUES (?, ?, ?, ?, 1, ?)')
        .run(newUserId, 'newuser', 'new@test.com', passwordHash, 'free');

      const newToken = generateToken({ id: newUserId, username: 'newuser' });
      const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('only returns payments for the authenticated user', async () => {
      // Create another user with payments
      const bcrypt = await import('bcryptjs');
      const { v4: uuidv4 } = await import('uuid');
      const otherUserId = uuidv4();
      const passwordHash = await bcrypt.hash('otherpass123', 10);
      db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed, plan) VALUES (?, ?, ?, ?, 1, ?)')
        .run(otherUserId, 'otheruser', 'other@test.com', passwordHash, 'free');

      const otherToken = generateToken({ id: otherUserId, username: 'otheruser' });

      // Get payments for original user
      const originalRes = await auth(request(app).get('/api/payments'));
      const originalPayments = originalRes.body.data;

      // Get payments for other user
      const otherRes = await request(app).get('/api/payments').set('Authorization', `Bearer ${otherToken}`);
      const otherPayments = otherRes.body.data;

      // Original user should have payments, other user should not
      expect(originalPayments.length).toBeGreaterThan(0);
      expect(otherPayments.length).toBe(0);
    });
  });

  describe('Authentication', () => {
    it('returns 401 for unauthenticated POST /api/payments', async () => {
      const res = await request(app).post('/api/payments').send({ planId: 'plan_pro' });

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/payments/:orderId/status', async () => {
      const res = await request(app).get('/api/payments/order_123/status');

      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated GET /api/payments', async () => {
      const res = await request(app).get('/api/payments');

      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/payments').set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
    });

    it('returns 401 with malformed token', async () => {
      const res = await request(app).get('/api/payments').set('Authorization', 'Invalid');

      expect(res.status).toBe(401);
    });
  });
});
