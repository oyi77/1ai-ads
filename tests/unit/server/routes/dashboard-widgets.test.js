import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { createDashboardWidgetsRouter } from '../../../../server/routes/dashboard-widgets.js';

function createMockRepo() {
  return {
    getByUser: vi.fn(() => ({
      data: [{ id: 'w1', widget_type: 'roas', config: '{}', position: 0, size: 'md', enabled: 1 }],
      total: 1,
      page: 1,
      limit: 50,
    })),
    create: vi.fn(() => ({ id: 'w2', widget_type: 'spend', config: '{}', position: 1 })),
    findById: vi.fn(() => ({ id: 'w1', widget_type: 'roas', config: '{"enabled":true}' })),
    update: vi.fn(() => ({ id: 'w1' })),
    reorder: vi.fn(),
    delete: vi.fn(),
  };
}

function createApp(repo) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/reporting/widgets', createDashboardWidgetsRouter(repo));
  return app;
}

describe('dashboard-widgets router — wired repo contract', () => {
  it('GET / lists widgets scoped to the requesting user via getByUser (not undefined)', async () => {
    const repo = createMockRepo();
    const res = await request(createApp(repo)).get('/api/reporting/widgets');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(repo.getByUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ page: 1 }));
    expect(res.body.data[0].id).toBe('w1');
  });

  it('PUT /:id toggles a widget without erroring on undefined repo', async () => {
    const repo = createMockRepo();
    const res = await request(createApp(repo)).put('/api/reporting/widgets/w1').send({ enabled: false });
    expect(res.status).toBe(200);
    expect(repo.update).toHaveBeenCalled();
  });
});
