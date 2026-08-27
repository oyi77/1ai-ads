import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock requireAuth to inject a user instead of requiring a real token
vi.mock('../../../../server/middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'test-user-1', role: 'admin' };
    next();
  },
}));

import { createAutomationRouter } from '../../../../server/routes/automation.js';

function createMockRulesRepo() {
  const owned = { r1: { id: 'r1', user_id: 'test-user-1', name: 'Low CTR Alert', enabled: 1 }, r2: { id: 'r2', user_id: 'test-user-1', name: 'Budget Guard', enabled: 0 } };
  const other = { r9: { id: 'r9', user_id: 'other-user', name: 'Someone elses rule', enabled: 1 } };
  const all = { ...owned, ...other };
  return {
    getAll: vi.fn((uid) => Object.values(all).filter((r) => r.user_id === uid)),
    getById: vi.fn(async (id) => all[id] || null),
    create: vi.fn(() => 'new-rule-id'),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

function createApp(rulesRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/automation', createAutomationRouter({ rulesRepo }));
  return app;
}

describe('Automation Router', () => {
  let app, rulesRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    rulesRepo = createMockRulesRepo();
    app = createApp(rulesRepo);
  });

  // ─── GET / ─────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns only the current users rules', async () => {
      const res = await request(app).get('/api/automation/');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rules).toHaveLength(2);
      expect(res.body.rules.every((r) => r.user_id === 'test-user-1')).toBe(true);
      expect(rulesRepo.getAll).toHaveBeenCalledWith('test-user-1');
    });

    it('does not leak another users rules', async () => {
      const res = await request(app).get('/api/automation/');
      const ids = res.body.rules.map((r) => r.id);
      expect(ids).not.toContain('r9');
    });

    it('returns empty array when getAll is not available', async () => {
      rulesRepo.getAll = undefined;
      app = createApp(rulesRepo);
      const res = await request(app).get('/api/automation/');
      expect(res.status).toBe(200);
      expect(res.body.rules).toEqual([]);
    });

    it('returns 500 when getAll throws', async () => {
      rulesRepo.getAll.mockRejectedValue(new Error('db error'));
      const res = await request(app).get('/api/automation/');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db error');
    });
  });

  describe('POST /create', () => {
    it('creates a rule and returns it', async () => {
      const res = await request(app).post('/api/automation/create').send({
        name: 'Low CTR Alert',
        type: 'performance',
        condition: 'ctr < 1%',
        action: 'pause_campaign',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Low CTR Alert');
      expect(res.body.data.type).toBe('performance');
      expect(res.body.data.id).toBe('new-rule-id');
      expect(rulesRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'test-user-1',
        name: 'Low CTR Alert',
        condition: 'ctr < 1%',
        action: 'pause_campaign',
        priority: 1,
        enabled: true,
      }));
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/automation/create').send({
        condition: 'ctr < 1%', action: 'pause',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Name required');
    });

    it('defaults type to custom when not provided', async () => {
      const res = await request(app).post('/api/automation/create').send({ name: 'Test Rule' });
      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('custom');
    });

    it('uses the authenticated user id for the rule', async () => {
      const res = await request(app).post('/api/automation/create').send({ name: 'Rule' });
      expect(res.status).toBe(200);
      expect(rulesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'test-user-1' }));
    });

    it('returns 500 when repo throws', async () => {
      rulesRepo.create.mockImplementation(() => { throw new Error('constraint error'); });
      const res = await request(app).post('/api/automation/create').send({ name: 'Rule' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('constraint error');
    });
  });

  describe('POST /toggle/:id', () => {
    it('toggles active rule to inactive', async () => {
      const res = await request(app).post('/api/automation/toggle/r1');
      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);
      expect(rulesRepo.update).toHaveBeenCalledWith('r1', { enabled: 0 });
    });

    it('toggles inactive rule to active', async () => {
      const res = await request(app).post('/api/automation/toggle/r2');
      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(1);
      expect(rulesRepo.update).toHaveBeenCalledWith('r2', { enabled: 1 });
    });

    it('returns 404 when rule not found', async () => {
      const res = await request(app).post('/api/automation/toggle/missing');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Rule not found');
    });

    it('returns 404 when rule belongs to another user', async () => {
      const res = await request(app).post('/api/automation/toggle/r9');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Rule not found');
      expect(rulesRepo.update).not.toHaveBeenCalled();
    });

    it('returns 500 when getById throws', async () => {
      rulesRepo.getById.mockRejectedValue(new Error('db crash'));
      const res = await request(app).post('/api/automation/toggle/r1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db crash');
    });
  });

  // ─── POST /delete/:id ──────────────────────────────────────────────

  describe('POST /delete/:id', () => {
    it('deletes a rule', async () => {
      const res = await request(app).post('/api/automation/delete/r1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(rulesRepo.delete).toHaveBeenCalledWith('r1');
    });

    it('returns 404 when rule belongs to another user', async () => {
      const res = await request(app).post('/api/automation/delete/r9');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Rule not found');
      expect(rulesRepo.delete).not.toHaveBeenCalled();
    });

    it('returns 500 when delete throws', async () => {
      rulesRepo.delete.mockRejectedValue(new Error('foreign key constraint'));
      const res = await request(app).post('/api/automation/delete/r1');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('foreign key constraint');
    });
  });
});
