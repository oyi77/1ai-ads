import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));

// requireAuth is exercised by every boost route; bypass it for unit scope.
vi.mock('../../../../server/middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = req.user || { id: 'u1' };
    next();
  },
}));

import { createBoostRouter } from '../../../../server/routes/boost.js';

function createApp(services) {
  const app = express();
  app.use(express.json());
  app.use('/api/boost', createBoostRouter({ services }));
  return app;
}

describe('Boost targeting routes — frontend contract', () => {
  it('GET /api/boost/targeting returns shaped payload', async () => {
    const services = {
      boostApproval: { list: vi.fn(() => []), getById: vi.fn(), recommend: vi.fn() },
      targeting: { listAll: vi.fn(() => []), suggest: vi.fn(), getOrSuggest: vi.fn(), analyzeEngagementPatterns: vi.fn() },
    };
    const res = await request(createApp(services)).get('/api/boost/targeting');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [], count: 0 });
  });

  it('POST /api/boost/targeting/suggest 400s without post_id/page_id', async () => {
    const services = {
      boostApproval: { list: vi.fn(() => []), getById: vi.fn(), recommend: vi.fn() },
      targeting: { listAll: vi.fn(() => []), suggest: vi.fn(), getOrSuggest: vi.fn(), analyzeEngagementPatterns: vi.fn() },
    };
    const res = await request(createApp(services)).post('/api/boost/targeting/suggest').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'post_id and page_id are required' });
  });

  it('POST /api/boost/targeting/suggest returns suggestion', async () => {
    const services = {
      boostApproval: { list: vi.fn(() => []), getById: vi.fn(), recommend: vi.fn() },
      targeting: { listAll: vi.fn(() => []), suggest: vi.fn(() => ({ interests: ['fitness'] })), getOrSuggest: vi.fn(), analyzeEngagementPatterns: vi.fn() },
    };
    const res = await request(createApp(services))
      .post('/api/boost/targeting/suggest')
      .send({ post_id: 'p1', page_id: 'pg1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { interests: ['fitness'] } });
  });
});
