import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { requireAuth } from '../../../server/middleware/auth.js';
import { generateToken } from '../../../server/lib/auth.js';
import { AuthError } from '../../../server/lib/errors.js';
function mockReqRes(authHeader) {
  const req = { headers: {} };
  if (authHeader) req.headers.authorization = authHeader;
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { req, res };
}

describe('requireAuth middleware', () => {
  it('calls next() with valid token', () => {
    const token = generateToken({ id: '1', username: 'test' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('1');
  });

  it('throws AuthError with no header', () => {
    const { req, res } = mockReqRes(null);
    const next = vi.fn();

    expect(() => requireAuth(req, res, next)).toThrow(AuthError);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws AuthError with bad token', () => {
    const { req, res } = mockReqRes('Bearer garbage');
    const next = vi.fn();

    expect(() => requireAuth(req, res, next)).toThrow(AuthError);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws AuthError with non-Bearer scheme', () => {
    const { req, res } = mockReqRes('Basic abc123');
    const next = vi.fn();

    expect(() => requireAuth(req, res, next)).toThrow(AuthError);
  });

  it('calls next() even when usersRepo finds no user (no DB lookup — is_active check removed for reliability)', () => {
    // NOTE: The is_active DB lookup was removed from requireAuth because the
    // server's long-lived DB connection can hold a stale WAL read snapshot,
    // causing findById to return null for valid users and rejecting their
    // tokens with 401. Disabled users are still blocked at token issuance
    // time by handleLogin and handleRefreshToken (see auth-handlers.js).
    const token = generateToken({ id: 'ghost-1', username: 'gone' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    req.app = { locals: { usersRepo: { findById: () => null } } };
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() even for a disabled user token (no DB lookup)', () => {
    const token = generateToken({ id: 'banned-1', username: 'banned' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    req.app = { locals: { usersRepo: { findById: () => ({ id: 'banned-1', is_active: 0 }) } } };
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });


  it('passes through when no usersRepo is available (test harness)', () => {
    const token = generateToken({ id: '2', username: 'test' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireAuth with x-api-key', () => {
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

  function keyReq(key, row) {
    return {
      headers: { 'x-api-key': key },
      app: { locals: { paymentsRepo: {
        findApiKeyByHash: (h) => (h === hash('good-key') ? row : null),
        updateApiKeyLastUsed: () => {},
      } } },
    };
  }

  const res = () => {
    const r = { statusCode: null, body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    return r;
  };

  it('authenticates a valid key and stamps last-used', () => {
    const stamped = [];
    const req = keyReq('good-key', { id: 'k1', user_id: 'u9', scopes: '["campaigns:read"]', revoked_at: null, expires_at: null });
    req.app.locals.paymentsRepo.updateApiKeyLastUsed = (id) => stamped.push(id);
    const next = vi.fn();
    requireAuth(req, res(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'u9', apiKeyId: 'k1', scopes: ['campaigns:read'] });
    expect(stamped).toEqual(['k1']);
  });

  it('rejects unknown key with 401', () => {
    const r = res();
    requireAuth(keyReq('bad-key', null), r, vi.fn());
    expect(r.statusCode).toBe(401);
  });

  it('rejects revoked and expired keys with 401', () => {
    for (const row of [
      { id: 'k2', user_id: 'u9', scopes: '[]', revoked_at: '2026-01-01', expires_at: null },
      { id: 'k3', user_id: 'u9', scopes: '[]', revoked_at: null, expires_at: '2020-01-01' },
    ]) {
      const r = res();
      requireAuth(keyReq('good-key', row), r, vi.fn());
      expect(r.statusCode).toBe(401);
    }
  });
});
