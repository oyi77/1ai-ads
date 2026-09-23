import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createAutonomousRouter } from '../../../server/routes/autonomous.js';

function appWith({ plan = 'free', role = 'user', rules = [] } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u1', plan, role }; next(); });
  const rulesRepo = {
    getAll: vi.fn(() => rules),
    create: vi.fn((r) => ({ id: 'new-1', ...r })),
  };
  app.use('/api/autonomous', createAutonomousRouter({}, {}, {}, rulesRepo, {}));
  return { app, rulesRepo };
}

const R = (en) => ({ id: 'x', enabled: en });

describe('web quota — /api/autonomous/rules', () => {
  it('free 3 aktif → 403, create tidak dipanggil', async () => {
    const { default: request } = await import('supertest');
    const { app, rulesRepo } = appWith({ rules: [R(true), R(true), R(true)] });
    const res = await request(app).post('/api/autonomous/rules')
      .send({ name: 'x', condition: {}, action: {} });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('max 3');
    expect(rulesRepo.create).not.toHaveBeenCalled();
  });

  it('free 2 aktif → lolos', async () => {
    const { default: request } = await import('supertest');
    const { app, rulesRepo } = appWith({ rules: [R(true), R(true)] });
    const res = await request(app).post('/api/autonomous/rules')
      .send({ name: 'x', condition: {}, action: {} });
    expect(res.status).toBe(200);
    expect(rulesRepo.create).toHaveBeenCalled();
  });

  it('pro 10 aktif → lolos', async () => {
    const { default: request } = await import('supertest');
    const { app, rulesRepo } = appWith({ plan: 'pro', rules: Array.from({ length: 10 }, () => R(true)) });
    const res = await request(app).post('/api/autonomous/rules')
      .send({ name: 'x', condition: {}, action: {} });
    expect(res.status).toBe(200);
  });
});
