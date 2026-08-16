import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { handleListAccounts, handleGetCredentials, handleUpdateAccount, handleDeleteAccount } from '../../../../../server/routes/_handlers/settings-handlers.js';

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
function makeSettingsRepo(row) {
  return {
    getAccount: vi.fn(() => row),
    setActiveAccountForUser: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  };
}

describe('settings-handlers — account mutate/delete IDOR guard', () => {
  it('handleUpdateAccount rejects a cross-user account (404, no mutation)', () => {
    const repo = makeSettingsRepo({ id: 'a2', user_id: 'user-2', platform: 'meta' });
    const handler = handleUpdateAccount(repo);
    const req = { params: { id: 'a2' }, body: { platform: 'meta', is_active: 0 }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(repo.updateAccount).not.toHaveBeenCalled();
    expect(repo.setActiveAccountForUser).not.toHaveBeenCalled();
  });

  it('handleUpdateAccount on own account with is_active=1 scopes the active flag to that user', () => {
    const repo = makeSettingsRepo({ id: 'a1', user_id: 'user-1', platform: 'meta' });
    const handler = handleUpdateAccount(repo);
    const req = { params: { id: 'a1' }, body: { platform: 'meta', is_active: 1 }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.setActiveAccountForUser).toHaveBeenCalledWith('meta', 'a1', 'user-1');
    expect(repo.updateAccount).not.toHaveBeenCalled();
  });

  it('handleUpdateAccount on own account without is_active updates the row', () => {
    const repo = makeSettingsRepo({ id: 'a1', user_id: 'user-1', platform: 'meta' });
    const handler = handleUpdateAccount(repo);
    const req = { params: { id: 'a1' }, body: { name: 'renamed' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.updateAccount).toHaveBeenCalledWith('a1', { name: 'renamed' });
    expect(repo.setActiveAccountForUser).not.toHaveBeenCalled();
  });

  it('handleDeleteAccount rejects a cross-user account (404, no deletion)', () => {
    const repo = makeSettingsRepo({ id: 'a2', user_id: 'user-2', platform: 'meta' });
    const handler = handleDeleteAccount(repo);
    const req = { params: { id: 'a2' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(repo.deleteAccount).not.toHaveBeenCalled();
  });

  it('handleDeleteAccount deletes the requesting user own account', () => {
    const repo = makeSettingsRepo({ id: 'a1', user_id: 'user-1', platform: 'meta' });
    const handler = handleDeleteAccount(repo);
    const req = { params: { id: 'a1' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.deleteAccount).toHaveBeenCalledWith('a1');
  });
});

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
