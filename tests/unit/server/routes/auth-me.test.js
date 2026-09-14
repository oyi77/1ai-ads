import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../../../server/routes/auth.js';
import { generateToken } from '../../../../server/lib/auth.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function createApp(usersRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(usersRepo, {}, null));
  return app;
}

/**
 * GET /api/auth/me powers the SPA shell user display on every load
 * (added 2026-09-14 after finding the shell 404d on a missing route).
 */
describe('GET /api/auth/me', () => {
  const usersRepo = {};

  it('answers 401 without a token', async () => {
    const res = await request(createApp(usersRepo)).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the JWT profile for a valid token (no DB hit)', async () => {
    const token = generateToken({ id: 'u1', username: 'alice', role: 'user', plan: 'free' });
    const res = await request(createApp(usersRepo))
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { id: 'u1', username: 'alice', role: 'user', plan: 'free' },
    });
  });
});
