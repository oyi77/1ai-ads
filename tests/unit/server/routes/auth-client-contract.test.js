// Regression: server MUST nest auth tokens under res.body.data
// (data.accessToken / data.refreshToken / data.user). The client
// (client/src/lib/api.ts) reads body.data.* — a top-level token shape
// is the historical bug class.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/auth.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    hashPassword: (plain) => 'hashed-' + plain,
    verifyPassword: (plain, hash) => plain === 'secret123' && !!hash,
    generateToken: () => 'access-token',
    generateRefreshToken: () => 'refresh-token',
    verifyToken: () => ({ id: 'u1', username: 'tester', tokenType: 'refresh' }),
  };
});

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { createAuthRouter } from '../../../../server/routes/auth.js';

function buildApp(usersRepo, refreshRepo) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(usersRepo, refreshRepo, null));
  return app;
}

const USER = {
  id: 'u1',
  username: 'tester',
  email: 'tester@example.com',
  password_hash: 'hashed-secret123',
  is_active: 1,
  role: 'user',
  plan: 'free',
  confirmed: 1,
  email_verification_hash: null,
};

const futureISO = new Date(Date.now() + 3600 * 1000).toISOString();

function makeRepos() {
  const usersRepo = {
    findByUsername: (u) => (u === 'tester' ? USER : null),
    findByEmail: () => null,
    findById: (id) => (id === 'u1' ? USER : null),
  };
  const refreshTokensRepo = {
    deleteByUserId: () => {},
    upsert: () => {},
    findByToken: () => ({ userId: 'u1', token: 'some-refresh' }),
    deleteByToken: () => {},
  };
  return { usersRepo, refreshTokensRepo };
}

describe('server auth client contract', () => {
  let usersRepo, refreshTokensRepo, app;

  beforeEach(() => {
    ({ usersRepo, refreshTokensRepo } = makeRepos());
    app = buildApp(usersRepo, refreshTokensRepo);
  });

  it('POST /auth/login nests tokens under res.body.data (not top-level)', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ username: 'tester', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTypeOf('object');
    expect(res.body.data.accessToken).toBe('access-token');
    expect(res.body.data.refreshToken).toBe('refresh-token');
    expect(res.body.data.user).toBeTypeOf('object');
    // Historical bug class: tokens must NOT leak to top level.
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('POST /auth/refresh-token nests new tokens under res.body.data (not top-level)', async () => {
    const res = await supertest(app)
      .post('/auth/refresh-token')
      .send({ refreshToken: 'some-refresh' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTypeOf('object');
    expect(res.body.data.accessToken).toBe('access-token');
    expect(res.body.data.refreshToken).toBe('refresh-token');
    // Historical bug class: tokens must NOT leak to top level.
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
  });
});
