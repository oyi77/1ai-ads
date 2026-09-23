import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { PaymentService } from '../../../server/services/payments.js';
import { PaymentsRepository } from '../../../server/repositories/payments.js';
import { UsersRepository } from '../../../server/repositories/users.js';
import { InvoicesRepository } from '../../../server/repositories/invoices.js';

function memDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE payments (id TEXT PRIMARY KEY, user_id TEXT, order_id TEXT, amount REAL, currency TEXT, provider TEXT, provider_ref TEXT, metadata TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, role TEXT DEFAULT 'user', plan TEXT DEFAULT 'free', plan_expires_at TEXT)`);
  db.exec(`CREATE TABLE invoices (id TEXT PRIMARY KEY, user_id TEXT, amount REAL, currency TEXT, description TEXT, line_items TEXT, status TEXT DEFAULT 'draft', due_date TEXT, paid_at TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  return db;
}

describe('payment fulfill — invoice otomatis', () => {
  it('paid: plan naik + invoice paid tercatat', async () => {
    const db = memDb();
    const svc = new PaymentService(new PaymentsRepository(db), new UsersRepository(db), new InvoicesRepository(db));
    db.prepare("INSERT INTO users (id, username, plan) VALUES ('u1','t','free')").run();
    const pay = new PaymentsRepository(db).create({
      userId: 'u1', orderId: 'order_x1', amount: 99000, currency: 'IDR',
      provider: '1ai-payment', metadata: { planId: 'plan_pro', planName: 'Pro', userId: 'u1' },
    });
    const done = await svc._handleOrderPaid(pay, { planId: 'plan_pro', planName: 'Pro' });
    expect(done.success).toBe(true);
    expect(db.prepare('SELECT plan FROM users WHERE id=?').get('u1').plan).toBe('pro');
    const inv = db.prepare('SELECT description, status, amount FROM invoices WHERE user_id=?').all('u1');
    expect(inv.length).toBe(1);
    expect(inv[0].status).toBe('paid');
    expect(inv[0].amount).toBe(99000);
    expect(inv[0].description).toContain('order_x1');
    db.close();
  });

  it('tanpa invoicesRepo: fulfill tetap jalan (best-effort)', async () => {
    const db = memDb();
    const svc = new PaymentService(new PaymentsRepository(db), new UsersRepository(db), null);
    db.prepare("INSERT INTO users (id, username, plan) VALUES ('u1','t','free')").run();
    const pay = new PaymentsRepository(db).create({
      userId: 'u1', orderId: 'order_x2', amount: 99000, currency: 'IDR',
      provider: '1ai-payment', metadata: { planId: 'plan_pro', planName: 'Pro', userId: 'u1' },
    });
    const done = await svc._handleOrderPaid(pay, { planId: 'plan_pro', planName: 'Pro' });
    expect(done.success).toBe(true);
    expect(db.prepare('SELECT plan FROM users WHERE id=?').get('u1').plan).toBe('pro');
    db.close();
  });
});
