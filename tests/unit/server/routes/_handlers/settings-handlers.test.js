import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { handleListAccounts, handleGetCredentials, handleUpdateAccount, handleDeleteAccount, handlePostCredentials } from '../../../../../server/routes/_handlers/settings-handlers.js';

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
    expect(repo.updateAccount).not.toHaveBeenCalled();
  });

  it('handleDeleteAccount deletes the requesting user own account', () => {
    const repo = makeSettingsRepo({ id: 'a1', user_id: 'user-1', platform: 'meta' });
    const handler = handleDeleteAccount(repo);
    const req = { params: { id: 'a1' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.updateAccount).toHaveBeenCalledWith('a1', { is_active: 0 });
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
      { id: 'a1', user_id: 'user-1', platform: 'meta', is_active: 1, credentials: { access_token: 'SECRET1' } },
      { id: 'a2', user_id: 'user-2', platform: 'meta', is_active: 1, credentials: { access_token: 'SECRET2' } },
    ]);
    const handler = handleGetCredentials(repo);
    const req = { params: { platform: 'meta' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.account_id).toBe('a1'); // never a2 (user-2)
    expect(res.body.data.access_token).toBeUndefined(); // never leak raw token
  });

  it('handleGetCredentials returns configured:false when the user only has a soft-deleted (is_active:0) account', () => {
    const repo = makeAccountsRepo([
      { id: 'a1', user_id: 'user-1', platform: 'meta', is_active: 0, credentials: { access_token: 'SECRET1' } },
    ]);
    const handler = handleGetCredentials(repo);
    const req = { params: { platform: 'meta' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.configured).toBe(false); // soft-deleted row must NOT leak configured:true
    expect(res.body.data.account_id).toBeUndefined();
    expect(res.body.data.access_token).toBeUndefined();
  });

  it('handleListAccounts excludes soft-deleted (is_active:0) rows', () => {
    const repo = makeAccountsRepo([
      { id: 'a1', user_id: 'user-1', platform: 'meta', credentials: { access_token: 'SECRET1' }, is_active: 1 },
      { id: 'a4', user_id: 'user-1', platform: 'google', credentials: { token: 'SECRET4' }, is_active: 0 },
    ]);
    const handler = handleListAccounts(repo);
    const req = { query: {}, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    const ids = res.body.data.map(a => a.id).sort();
    expect(ids).toEqual(['a1']); // a4 is soft-deleted, must not appear as connected
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

  it('handlePostCredentials excludes soft-deleted (is_active:0) accounts when resolving the existing Default', () => {
    const repo = {
      getAccounts: vi.fn(() => [
        { id: 'a1', user_id: 'user-1', platform: 'meta', account_name: 'Default', is_active: 0, credentials: { access_token: 'OLD' } },
        { id: 'a2', user_id: 'user-2', platform: 'meta', account_name: 'Default', is_active: 1, credentials: { access_token: 'OTHER' } },
      ]),
      updateAccount: vi.fn(),
      addAccount: vi.fn(() => ({ id: 'a-new' })),
    };
    const handler = handlePostCredentials(repo);
    const req = { params: { platform: 'meta' }, body: { access_token: 'NEW' }, user: { id: 'user-1' } };
    const res = makeRes();

    handler(req, res);

    expect(repo.updateAccount).not.toHaveBeenCalled(); // soft-deleted a1 is filtered out → no resurrection
    expect(repo.addAccount).toHaveBeenCalledTimes(1);   // fresh Default created for user-1 instead
    expect(res.body.success).toBe(true);
  });
});
