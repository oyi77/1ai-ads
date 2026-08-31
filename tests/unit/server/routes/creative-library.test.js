import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { createCreativeLibraryRouter } from '../../../../server/routes/creative-library.js';

function createMockRepo() {
  return {
    list: vi.fn(() => ({
      data: [
        { id: 'c1', type: 'copy', hook: 'h', body: 'b', cta: 'cta', tags: '["a","b"]' },
      ],
      total: 1,
      page: 1,
      limit: 50,
    })),
    getTopPerformers: vi.fn(() => [{ id: 'c2', best_roas: 3.1 }]),
    create: vi.fn((data) => ({ id: 'new-1', ...data })),
    update: vi.fn(() => ({ id: 'c1', name: 'updated' })),
    delete: vi.fn(),
    incrementUsage: vi.fn(() => ({ id: 'c1', times_used: 2 })),
  };
}

function createApp(repo) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/creative/library', createCreativeLibraryRouter(repo));
  return app;
}

describe('creative-library router — wired repo contract', () => {
  let repo;
  beforeEach(() => { repo = createMockRepo(); });

  it('GET / lists creatives with tags parsed to an array', async () => {
    const res = await request(createApp(repo)).get('/api/creative/library');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data[0].tags)).toBe(true);
    expect(res.body.data[0].tags).toEqual(['a', 'b']);
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('GET /top calls getTopPerformers scoped to the requesting user (not findTop)', async () => {
    const res = await request(createApp(repo)).get('/api/creative/library/top');
    expect(res.status).toBe(200);
    expect(repo.getTopPerformers).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(res.body.data[0].id).toBe('c2');
  });

  it('POST / creates a creative for the requesting user', async () => {
    const res = await request(createApp(repo))
      .post('/api/creative/library')
      .send({ name: 'N', hook: 'h', tags: ['x'] });
    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', name: 'N' }));
  });

  it('POST /:id/use increments usage via incrementUsage scoped to user', async () => {
    const res = await request(createApp(repo)).post('/api/creative/library/c1/use').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(repo.incrementUsage).toHaveBeenCalledWith('c1', 'user-1');
  });

  it('POST /:id/use returns 404 when the creative is missing', async () => {
    repo.incrementUsage.mockReturnValue(null);
    const res = await request(createApp(repo)).post('/api/creative/library/missing/use').send({});
    expect(res.status).toBe(404);
  });

  it('PUT /:id updates and DELETE /:id removes scoped to user', async () => {
    const up = await request(createApp(repo)).put('/api/creative/library/c1').send({ name: 'x' });
    expect(up.status).toBe(200);
    expect(repo.update).toHaveBeenCalledWith('c1', expect.anything(), 'user-1');
    const del = await request(createApp(repo)).delete('/api/creative/library/c1');
    expect(del.status).toBe(200);
    expect(repo.delete).toHaveBeenCalledWith('c1', 'user-1');
  });
});
