import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { createDraftRouter } from '../../../../server/routes/drafts.js';

function createMockDraftService() {
  return {
    listDrafts: vi.fn(async (status, opts) => ({
      data: [{ id: 'd1', summary: 's', type: 'pause', details_json: '{}', status, created_at: '', updated_at: '' }],
      total: 1,
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 50,
    })),
    createDraft: vi.fn(async (args) => ({ id: 'new', ...args })),
    approveDraft: vi.fn(),
    rejectDraft: vi.fn(),
  };
}

function createApp(service, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/drafts', createDraftRouter(service));
  return app;
}

describe('drafts route — multi-tenant scoping', () => {
  it('non-admin GET / lists ONLY their own drafts (userId passed to service)', async () => {
    const svc = createMockDraftService();
    const res = await request(createApp(svc, { id: 'u-1', role: 'user' })).get('/api/drafts');
    expect(res.status).toBe(200);
    expect(svc.listDrafts).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('admin GET / sees all drafts (no userId filter)', async () => {
    const svc = createMockDraftService();
    await request(createApp(svc, { id: 'admin-1', role: 'admin' })).get('/api/drafts');
    const opts = svc.listDrafts.mock.calls[0][1];
    expect(opts.userId).toBeUndefined();
  });

  it('POST / stamps the draft with the requesting user id', async () => {
    const svc = createMockDraftService();
    const res = await request(createApp(svc, { id: 'u-2', role: 'user' }))
      .post('/api/drafts')
      .send({ type: 'pause', summary: 's' });
    expect(res.status).toBe(201);
    expect(svc.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-2' })
    );
  });
});
