import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { handleListAccounts, handleGetCredentials } from '../../../../../server/routes/_handlers/settings-handlers.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function makeAccountsRepo(rows) {
  return { getAccounts: vi.fn(() => rows) };
}

describe('settings-handlers — per-user account scoping', () => {
  it('handleListAccounts returns only the requesting user accounts (no cross-user leak)', () => {
    const repo = makeAccountsRepo([
      { id: 'a1', user_id: 'user-1', platform: 'meta', credentials: { access_token: 'SECRET1' } },
      { id: 'a2', user_id: 'user-2', platform: 'meta', credentials: { access_token: 'SECRET2' } },
      { id: 'a3', user_id: 'user-1', platform: 'google', credentials: { token: 'SECRET3' } },
    ]);
    const handler = handleListAccounts(repo);
    const req = { query: {}, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    const ids = res.body.data.map(a => a.id).sort();
    expect(ids).toEqual(['a1', 'a3']); // never a2 (user-2)
    expect(res.body.data.every(a => !String(JSON.stringify(a.credentials)).includes('SECRET'))).toBe(true);
  });

  it('handleGetCredentials returns only the requesting user account', () => {
    const repo = makeAccountsRepo([
      { id: 'a1', user_id: 'user-1', platform: 'meta', credentials: { access_token: 'SECRET1' }, is_active: 1 },
      { id: 'a2', user_id: 'user-2', platform: 'meta', credentials: { access_token: 'SECRET2' }, is_active: 1 },
    ]);
    const handler = handleGetCredentials(repo);
    const req = { params: { platform: 'meta' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.account_id).toBe('a1'); // never a2 (user-2)
    expect(res.body.data.configured).toBe(true);
  });

  it('handleGetCredentials returns configured:false when the user has no account', () => {
    const repo = makeAccountsRepo([
      { id: 'a2', user_id: 'user-2', platform: 'meta', credentials: {}, is_active: 1 },
    ]);
    const handler = handleGetCredentials(repo);
    const req = { params: { platform: 'meta' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.body.data.configured).toBe(false);
  });
});
