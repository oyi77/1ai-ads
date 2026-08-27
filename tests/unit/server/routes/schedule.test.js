import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createScheduleRouter } from '../../../../server/routes/schedule.js';

// The real router (_automation.js) mounts schedule behind requireAuth.
// Replicate that wiring: inject req.user here so the route's req.user?.id resolves.
const withUser = (req, _res, next) => {
  req.user = { id: 'test-user', role: 'user' };
  next();
};

const repoHolder = vi.hoisted(() => ({ repo: null }));

const MockSchedulesRepository = vi.hoisted(() => {
  function SchedulesRepository() {
    return repoHolder.repo;
  }
  return SchedulesRepository;
});

vi.mock('../../../../server/repositories/schedules.js', () => ({
  SchedulesRepository: MockSchedulesRepository,
}));
function createMockSchedulesRepo() {
  const rows = [
    { id: 's1', user_id: 'test-user', name: 'Mine', platform: 'meta', status: 'scheduled' },
    { id: 's2', user_id: 'other-user', name: 'Theirs', platform: 'meta', status: 'scheduled' },
    { id: 's3', user_id: 'system', name: 'Global', platform: 'tiktok', status: 'scheduled' },
  ];
  return {
    _rows: rows,
    findAll: vi.fn(({ userId } = {}) => {
      if (userId) return rows.filter((r) => r.user_id === userId || r.user_id === 'system');
      return rows;
    }),
    create: vi.fn(() => 'new-id'),
    remove: vi.fn((id, userId) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      if (userId && r.user_id !== 'system' && r.user_id !== userId) return false;
      return true;
    }),
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/schedule', withUser, createScheduleRouter({}));
  return app;
}

describe('Schedule Router — per-user isolation', () => {
  let app, schedulesRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    schedulesRepo = createMockSchedulesRepo();
    repoHolder.repo = schedulesRepo;
    app = createApp();
  });

  it('GET / lists only the current user schedules (own + system, not others)', () => {
    return request(app)
      .get('/api/schedule')
      .expect(200)
      .then((res) => {
        const ids = res.body.data.map((s) => s.id).sort();
        expect(ids).toEqual(['s1', 's3']);
        expect(ids).not.toContain('s2');
      });
  });

  it('POST / stores the authenticated user id', () => {
    return request(app)
      .post('/api/schedule')
      .send({ name: 'N', schedule_time: new Date().toISOString(), platform: 'meta' })
      .expect(200)
      .then(() => {
        expect(schedulesRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ user_id: 'test-user' })
        );
      });
  });

  it('DELETE / does not remove another user schedule', () => {
    return request(app)
      .delete('/api/schedule/s2')
      .expect(404);
  });

  it('DELETE / removes the callers own schedule', () => {
    return request(app)
      .delete('/api/schedule/s1')
      .expect(200);
  });
});
