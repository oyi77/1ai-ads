import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter } from '../../../../server/routes/admin.js';
import { generateToken, verifyToken } from '../../../../server/lib/auth.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/**
 * Add-ons are sold separately from the base manage-ads plan (LP, Content +
 * Social Bridge). Before this router existed the only way to grant one was a
 * raw SQL INSERT, so a manual sale could not be fulfilled from the product.
 */
function createApp({ users = {}, addons = {} } = {}) {
  const usersRepo = {
    findById: vi.fn((id) => users[id] || null),
  };
  const grants = [];
  const revokes = [];
  const userAddonsRepo = {
    listActive: vi.fn((id) => addons[id] || []),
    grant: vi.fn((id, key) => { grants.push([id, key]); return true; }),
    revoke: vi.fn((id, key) => { revokes.push([id, key]); return true; }),
  };
  const app = express();
  app.use(express.json());
  // Mirror the production mount: requireAuth runs before the admin router and
  // populates req.user, which is what requireRole('admin') reads.
  app.use((req, _res, next) => {
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      try { req.user = verifyToken(token); } catch { /* leave unauthenticated */ }
    }
    next();
  });
  app.use('/api/admin', createAdminRouter(usersRepo, {}, null, userAddonsRepo));
  return { app, usersRepo, userAddonsRepo, grants, revokes };
}

const adminToken = () => generateToken({ id: 'admin1', username: 'root', role: 'admin', plan: 'enterprise' });

describe('admin add-on management', () => {
  it('rejects a non-admin', async () => {
    const { app } = createApp({ users: { u1: { id: 'u1' } } });
    const token = generateToken({ id: 'u1', username: 'alice', role: 'user', plan: 'free' });
    const res = await request(app)
      .get('/api/admin/users/u1/addons')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lists active add-ons plus the catalog', async () => {
    const { app } = createApp({ users: { u1: { id: 'u1' } }, addons: { u1: ['lp'] } });
    const res = await request(app)
      .get('/api/admin/users/u1/addons')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.addons).toEqual(['lp']);
    expect(res.body.data.catalog.lp.name).toBe('Landing Page');
    expect(res.body.data.catalog.bridge.name).toBe('Content + Social Bridge');
  });

  it('grants a valid add-on', async () => {
    const { app, grants } = createApp({ users: { u1: { id: 'u1' } } });
    const res = await request(app)
      .post('/api/admin/users/u1/addons')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ addonKey: 'bridge' });
    expect(res.status).toBe(200);
    expect(grants).toEqual([['u1', 'bridge']]);
  });

  it('rejects an unknown add-on key with the valid options', async () => {
    const { app, grants } = createApp({ users: { u1: { id: 'u1' } } });
    const res = await request(app)
      .post('/api/admin/users/u1/addons')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ addonKey: 'nonexistent' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lp');
    expect(grants).toEqual([]);
  });

  it('404s when the target user does not exist', async () => {
    const { app, grants } = createApp({ users: {} });
    const res = await request(app)
      .post('/api/admin/users/ghost/addons')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ addonKey: 'lp' });
    expect(res.status).toBe(404);
    expect(grants).toEqual([]);
  });

  it('revokes an add-on', async () => {
    const { app, revokes } = createApp({ users: { u1: { id: 'u1' } } });
    const res = await request(app)
      .delete('/api/admin/users/u1/addons/lp')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(revokes).toEqual([['u1', 'lp']]);
  });
});
