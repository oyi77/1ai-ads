import { describe, it, expect, vi } from 'vitest';
import { hashPassword, generateToken, generateRefreshToken } from '../../../../../server/lib/auth.js';
import { handleLogin, handleRefreshToken } from '../../../../../server/routes/_handlers/auth-handlers.js';
import { requireAuth } from '../../../../../server/middleware/auth.js';

vi.mock('../../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

// Users keyed by id, with proper username/email lookups. Includes a disabled user.
function makeUsers() {
  const list = [
    { id: 'active-u', username: 'active', email: 'active@x.io', password_hash: hashPassword('pw123456'), is_active: 1, role: 'user', plan: 'free' },
    { id: 'banned-u', username: 'banned', email: 'banned@x.io', password_hash: hashPassword('pw123456'), is_active: 0, role: 'user', plan: 'free' },
  ];
  const byId = {};
  for (const u of list) byId[u.id] = u;
  return {
    findByUsername: (un) => list.find((u) => u.username === un) || null,
    findByEmail: (e) => list.find((u) => u.email === e) || null,
    findById: (id) => byId[id] || null,
  };
}

function makeRefreshRepo() {
  const refreshRows = [];
  return {
    refreshRows,
    repo: {
      upsert: (id, token, exp) => refreshRows.push({ user_id: id, token, expires_at: exp }),
      deleteByUserId: () => {},
      deleteByToken: (t) => { const i = refreshRows.findIndex((r) => r.token === t); if (i >= 0) refreshRows.splice(i, 1); },
      findByToken: (t) => refreshRows.find((r) => r.token === t) || null,
    },
  };
}

describe('disabled user (is_active=0) auth guards', () => {
  it('handleLogin rejects a disabled user even with correct password', () => {
    const usersRepo = makeUsers();
    const { repo: refreshTokensRepo } = makeRefreshRepo();
    const handler = handleLogin(usersRepo, refreshTokensRepo);
    const res = makeRes();
    handler({ body: { username: 'banned', password: 'pw123456' } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('handleLogin accepts an active user', () => {
    const usersRepo = makeUsers();
    const { repo: refreshTokensRepo } = makeRefreshRepo();
    const handler = handleLogin(usersRepo, refreshTokensRepo);
    const res = makeRes();
    handler({ body: { username: 'active', password: 'pw123456' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('handleRefreshToken rejects a disabled user and revokes the refresh token', () => {
    const usersRepo = makeUsers();
    const { repo: refreshTokensRepo, refreshRows } = makeRefreshRepo();
    // Seed a real signed refresh token for the banned user.
    const rt = generateRefreshToken({ id: 'banned-u', username: 'banned' });
    refreshRows.push({ user_id: 'banned-u', token: rt, expires_at: '2999-01-01T00:00:00Z' });
    const handler = handleRefreshToken(usersRepo, refreshTokensRepo);
    const res = makeRes();
    handler({ body: { refreshToken: rt } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/disabled/i);
    expect(refreshTokensRepo.findByToken(rt)).toBeNull();
  });

  it('requireAuth accepts a disabled user token (no DB lookup — is_active check removed for reliability)', () => {
    // NOTE: The is_active DB lookup was removed from requireAuth because the
    // server's long-lived DB connection can hold a stale WAL read snapshot,
    // causing findById to return null for valid users and rejecting their
    // tokens with 401. Disabled users are still blocked at token issuance
    // time by handleLogin and handleRefreshToken (see auth-handlers.js).
    const usersRepo = makeUsers();
    const token = generateToken({ id: 'banned-u', username: 'banned' });
    const req = { headers: { authorization: `Bearer ${token}` }, app: { locals: { usersRepo } } };
    const res = makeRes();
    const next = vi.fn();
    expect(() => requireAuth(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
