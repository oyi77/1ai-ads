import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));

import { handleListMetaAccounts } from '../../../../server/routes/_handlers/settings-handlers.js';

function auth(user) {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

function createApp(settingsRepo, user) {
  const app = express();
  app.use(express.json());
  app.use(auth(user));
  app.use('/api/meta/accounts', handleListMetaAccounts(settingsRepo));
  return app;
}

function makeSettingsRepo(rows) {
  return { getAccounts: vi.fn((platform) => (platform === 'meta' ? rows : [])) };
}

describe('GET /api/meta/accounts — handler contract', () => {
  it('returns accounts filtered by req.user.id and active flag', async () => {
    const rows = [
      { id: 'act_1', user_id: 'u1', account_name: 'Acme Ads', is_active: 1, platform: 'meta' },
      { id: 'act_2', user_id: 'u2', account_name: 'Other Co', is_active: 1, platform: 'meta' },
      { id: 'act_3', user_id: 'u1', account_name: 'Disabled', is_active: 0, platform: 'meta' },
    ];
    const app = createApp(makeSettingsRepo(rows), { id: 'u1' });
    const res = await request(app).get('/api/meta/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: [{ id: 'act_1', name: 'Acme Ads' }] });
  });

  it('returns empty array when no active account matches the user', async () => {
    const app = createApp(
      makeSettingsRepo([{ id: 'x', user_id: 'u2', account_name: 'N', is_active: 1, platform: 'meta' }]),
      { id: 'u1' }
    );
    const res = await request(app).get('/api/meta/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: [] });
  });

  it('never throws — returns empty accounts on internal error', async () => {
    const app = createApp({ getAccounts: vi.fn(() => { throw new Error('boom'); }) }, { id: 'u1' });
    const res = await request(app).get('/api/meta/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: [] });
  });
});
