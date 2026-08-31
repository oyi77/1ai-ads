import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createOptimizerRouter } from '../../../../server/routes/optimizer.js';

function createMockRulesRepo() {
  return {
    getAll: vi.fn(() => [
      { id: 'r1', name: 'Rule 1', enabled: true },
      { id: 'r2', name: 'Rule 2', enabled: false },
    ]),
    create: vi.fn(() => 'new-rule-id'),
    findById: vi.fn((id) => ({ id, user_id: 'user-1', name: 'Rule 1' })),
    update: vi.fn(() => true),
    delete: vi.fn(() => true),
  };
}

function createMockOptimizer() {
  return {
    lastRun: '2026-06-27T10:00:00Z',
    evaluate: vi.fn(async () => ({ rulesEvaluated: 2, actionsExecuted: 1 })),
  };
}

function createApp(rulesRepo, optimizer) {
  const app = express();
  app.use(express.json());
  // Inject a mock user for routes that use req.user
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/optimizer', createOptimizerRouter(rulesRepo, optimizer));
  return app;
}

describe('Optimizer Router', () => {
  let app, rulesRepo, optimizer;

  beforeEach(() => {
    vi.clearAllMocks();
    rulesRepo = createMockRulesRepo();
    optimizer = createMockOptimizer();
    app = createApp(rulesRepo, optimizer);
  });

  // ─── GET /status ───────────────────────────────────────────────────

  describe('GET /status', () => {
    it('returns optimizer status with rules counts', async () => {
      const res = await request(app).get('/api/optimizer/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.running).toBe(true);
      expect(res.body.data.rules_count).toBe(2);
      expect(res.body.data.active_rules).toBe(1);
      expect(res.body.data.last_run).toBe('2026-06-27T10:00:00Z');
      expect(rulesRepo.getAll).toHaveBeenCalledWith('user-1');
    });

    it('returns 0 active rules when all are disabled', async () => {
      rulesRepo.getAll.mockReturnValue([{ id: 'r1', enabled: false }]);
      const res = await request(app).get('/api/optimizer/status');
      expect(res.body.data.active_rules).toBe(0);
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.getAll.mockImplementation(() => { throw new Error('db fail'); });
      const res = await request(app).get('/api/optimizer/status');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /rules ────────────────────────────────────────────────────

  describe('GET /rules', () => {
    it('returns all rules for current user', async () => {
      const res = await request(app).get('/api/optimizer/rules');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(rulesRepo.getAll).toHaveBeenCalledWith('user-1');
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.getAll.mockImplementation(() => { throw new Error('db fail'); });
      const res = await request(app).get('/api/optimizer/rules');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /rules ───────────────────────────────────────────────────

  describe('POST /rules', () => {
    it('creates a rule and returns its id', async () => {
      const res = await request(app).post('/api/optimizer/rules').send({
        name: 'Increase budget on high CTR',
        condition: 'ctr > 5%',
        action: 'increase_budget_10',
        priority: 2,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('new-rule-id');
      expect(rulesRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-1',
        name: 'Increase budget on high CTR',
        priority: 2,
        enabled: true,
      }));
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/optimizer/rules').send({ condition: 'x', action: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name, condition, and action are required/);
    });

    it('returns 400 when condition is missing', async () => {
      const res = await request(app).post('/api/optimizer/rules').send({ name: 'Rule', action: 'y' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when action is missing', async () => {
      const res = await request(app).post('/api/optimizer/rules').send({ name: 'Rule', condition: 'x' });
      expect(res.status).toBe(400);
    });

    it('serializes object condition and action to JSON', async () => {
      const res = await request(app).post('/api/optimizer/rules').send({
        name: 'Rule',
        condition: { metric: 'ctr', op: '>', value: 5 },
        action: { type: 'increase_budget', pct: 10 },
      });
      expect(res.status).toBe(200);
      expect(rulesRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        condition: '{"metric":"ctr","op":">","value":5}',
        action: '{"type":"increase_budget","pct":10}',
      }));
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.create.mockImplementation(() => { throw new Error('constraint violation'); });
      const res = await request(app).post('/api/optimizer/rules').send({
        name: 'Rule', condition: 'x', action: 'y',
      });
      expect(res.status).toBe(500);
    });
  });

  // ─── PUT /rules/:id ────────────────────────────────────────────────

  describe('PUT /rules/:id', () => {
    it('updates a rule', async () => {
      const res = await request(app).put('/api/optimizer/rules/r1').send({ name: 'Updated Rule' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rulesRepo.update).toHaveBeenCalledWith('r1', expect.objectContaining({ name: 'Updated Rule' }));
    });

    it('returns 404 when rule not found', async () => {
      rulesRepo.update.mockReturnValue(false);
      const res = await request(app).put('/api/optimizer/rules/missing').send({ name: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.update.mockImplementation(() => { throw new Error('db error'); });
      const res = await request(app).put('/api/optimizer/rules/r1').send({ name: 'x' });
      expect(res.status).toBe(500);
    });
  });

  // ─── DELETE /rules/:id ─────────────────────────────────────────────

  describe('DELETE /rules/:id', () => {
    it('deletes a rule', async () => {
      const res = await request(app).delete('/api/optimizer/rules/r1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rulesRepo.delete).toHaveBeenCalledWith('r1');
    });

    it('returns 404 when rule not found', async () => {
      rulesRepo.delete.mockReturnValue(false);
      const res = await request(app).delete('/api/optimizer/rules/missing');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.delete.mockImplementation(() => { throw new Error('db error'); });
      const res = await request(app).delete('/api/optimizer/rules/r1');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /run ─────────────────────────────────────────────────────

  describe('POST /run', () => {
    it('triggers evaluation and returns result', async () => {
      const res = await request(app).post('/api/optimizer/run');
      expect(res.status).toBe(200);
      expect(res.body.data.rulesEvaluated).toBe(2);
      expect(optimizer.evaluate).toHaveBeenCalled();
    });

    it('returns 500 when evaluation fails', async () => {
      optimizer.evaluate.mockRejectedValue(new Error('eval failed'));
      const res = await request(app).post('/api/optimizer/run');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('eval failed');
    });
  });

  // ─── POST /evaluate ────────────────────────────────────────────────

  describe('POST /evaluate', () => {
    it('triggers evaluation and returns result', async () => {
      const res = await request(app).post('/api/optimizer/evaluate');
      expect(res.status).toBe(200);
      expect(res.body.data.rulesEvaluated).toBe(2);
      expect(optimizer.evaluate).toHaveBeenCalled();
    });

    it('returns 500 when evaluation fails', async () => {
      optimizer.evaluate.mockRejectedValue(new Error('timeout'));
      const res = await request(app).post('/api/optimizer/evaluate');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('timeout');
    });
  });
});
