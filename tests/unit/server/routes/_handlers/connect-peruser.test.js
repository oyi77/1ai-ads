import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { handleConnectMetaToken } from '../../../../../server/routes/_handlers/auth-handlers.js';
import { handleConnectToken } from '../../../../../server/routes/_handlers/settings-handlers.js';

// In-memory settings repo with per-tenant rows
function makeRepo(seed = []) {
  const rows = seed.map(r => ({ ...r }));
  return {
    rows,
    getAccounts(platform) {
      return platform ? rows.filter(r => r.platform === platform) : rows.slice();
    },
    addAccount(acct) {
      const row = { ...acct };
      if (row.id === undefined) row.id = `gen-${rows.length + 1}`;
      rows.push(row);
      return row;
    },
    updateAccount(id, patch) {
      const r = rows.find(x => x.id === id);
      if (r) {
        if (patch.credentials) r.credentials = { ...r.credentials, ...patch.credentials };
        Object.assign(r, patch);
      }
      return r;
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

// Stub Meta Graph API
let fetchImpl;
beforeEach(() => {
  fetchImpl = vi.fn(async (url) => {
    if (url.includes('/me?') || url.includes('/me/adaccounts') === false && url.includes('/me')) {
      return { json: async () => ({ id: 'fb-123', name: 'Alice' }) };
    }
    if (url.includes('/me/adaccounts')) {
      return { json: async () => ({ data: [{ account_id: '999', name: 'Ad Acc', account_status: 1, currency: 'USD' }] }) };
    }
    return { json: async () => ({}) };
  });
  global.fetch = fetchImpl;
});
afterEach(() => { delete global.fetch; });

describe('connect flows — multi-tenant scoping', () => {
  it('handleConnectMetaToken never mutates another tenant row (dedup scoped by user)', async () => {
    const repo = makeRepo([
      { id: 'b1', user_id: 'user-b', platform: 'meta', account_name: 'Alice', credentials: { access_token: 'OLD', user_id: 'b-fb' } },
    ]);
    const handler = handleConnectMetaToken(repo);
    const req = { body: { access_token: 'TOK_A' }, user: { id: 'user-a' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // user-b's row untouched
    const bRow = repo.rows.find(r => r.id === 'b1');
    expect(bRow.credentials.access_token).toBe('OLD');
    // a new row created for user-a, NOT merged into user-b
    const aRow = repo.rows.find(r => r.user_id === 'user-a');
    expect(aRow).toBeTruthy();
    expect(aRow.credentials.access_token).toBe('TOK_A');
  });

  it('handleConnectMetaToken first account of a user is active (not global)', async () => {
    const repo = makeRepo([
      { id: 'x1', user_id: 'user-x', platform: 'meta', account_name: 'Other', credentials: {}, is_active: 1 },
    ]);
    const handler = handleConnectMetaToken(repo);
    const req = { body: { access_token: 'TOK_NEW' }, user: { id: 'user-new' } };
    const res = makeRes();

    await handler(req, res);

    const newRow = repo.rows.find(r => r.user_id === 'user-new');
    expect(newRow.is_active).toBe(1); // first for THIS user → active
  });

  it('handleConnectToken (meta) scopes writes to requesting user', async () => {
    const repo = makeRepo([
      { id: 'b1', user_id: 'user-b', platform: 'meta', account_name: 'Bob', credentials: { access_token: 'OLD' } },
    ]);
    const handler = handleConnectToken(repo, {}, null);
    const req = { body: { platform: 'meta', access_token: 'TOK_A', account_name: 'Alice' }, user: { id: 'user-a' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.rows.find(r => r.id === 'b1').credentials.access_token).toBe('OLD');
    const aRow = repo.rows.find(r => r.user_id === 'user-a');
    expect(aRow).toBeTruthy();
    expect(aRow.credentials.access_token).toBe('TOK_A');
  });

  it('handleConnectToken (non-meta) does not attach to another tenant', async () => {
    const repo = makeRepo([
      { id: 'g-b', user_id: 'user-b', platform: 'google', account_name: 'Google Account', credentials: { access_token: 'OLD' } },
    ]);
    const handler = handleConnectToken(repo, {}, null);
    const req = { body: { platform: 'google', access_token: 'TOK_G' }, user: { id: 'user-a' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(repo.rows.find(r => r.id === 'g-b').credentials.access_token).toBe('OLD');
    const aRow = repo.rows.find(r => r.user_id === 'user-a' && r.platform === 'google');
    expect(aRow).toBeTruthy();
    expect(aRow.credentials.access_token).toBe('TOK_G');
  });
});
