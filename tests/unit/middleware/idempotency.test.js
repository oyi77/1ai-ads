import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase } from '../../../db/index.js';
import { IdempotencyKeysRepository } from '../../../server/repositories/idempotency-keys.js';
import { createIdempotencyMiddleware } from '../../../server/middleware/idempotency.js';

function makeApp() {
  const db = createDatabase(':memory:');

  const repo = new IdempotencyKeysRepository(db);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u-1' }; next(); });
  app.use(createIdempotencyMiddleware({ idempotencyKeysRepo: repo }));

  let calls = 0;
  app.post('/create', (req, res) => {
    calls++;
    res.json({ ok: true, call: calls, product: req.body.product });
  });
  return { app, getCalls: () => calls, repo };
}

describe('Idempotency middleware', () => {
  it('replays the stored response when the same key is reused', async () => {
    const { app, getCalls } = makeApp();
    const first = await request(app).post('/create').set('Idempotency-Key', 'key-1').send({ product: 'Widget' });
    const second = await request(app).post('/create').set('Idempotency-Key', 'key-1').send({ product: 'Widget' });

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(getCalls()).toBe(1);
  });

  it('treats different keys as distinct requests', async () => {
    const { app, getCalls } = makeApp();
    await request(app).post('/create').set('Idempotency-Key', 'a').send({ product: 'Widget' });
    await request(app).post('/create').set('Idempotency-Key', 'b').send({ product: 'Widget' });

    expect(getCalls()).toBe(2);
  });

  it('passes through when no key header is present', async () => {
    const { app, getCalls } = makeApp();
    await request(app).post('/create').send({ product: 'Widget' });
    await request(app).post('/create').send({ product: 'Widget' });
    expect(getCalls()).toBe(2);
  });

  it('does not cache error responses', async () => {
    const db = createDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'u-1' }; next(); });
    app.use(createIdempotencyMiddleware({ idempotencyKeysRepo: new IdempotencyKeysRepository(db) }));
    let calls = 0;
    app.post('/create', (_req, res) => { calls++; res.status(400).json({ ok: false, call: calls }); });

    await request(app).post('/create').set('Idempotency-Key', 'err').send({});
    await request(app).post('/create').set('Idempotency-Key', 'err').send({});
    expect(calls).toBe(2);
  });
});
