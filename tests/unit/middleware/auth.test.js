import { describe, it, expect, vi } from 'vitest';
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

  it('rejects token for a user that no longer exists (GDPR erase)', () => {
    // Production sets app.locals.usersRepo; simulate it with a findById that
    // returns null (deleted user). A stateless JWT otherwise survives deletion.
    const token = generateToken({ id: 'ghost-1', username: 'gone' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    req.app = { locals: { usersRepo: { findById: () => null } } };
    const next = vi.fn();

    expect(() => requireAuth(req, res, next)).toThrow(AuthError);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts token when usersRepo finds the user', () => {
    const token = generateToken({ id: 'alive-1', username: 'ok' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    req.app = { locals: { usersRepo: { findById: () => ({ id: 'alive-1' }) } } };
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
  it('rejects token for a disabled user (is_active = 0, admin soft-delete / ban)', () => {
    // The admin disable path (DELETE /api/admin/users/:id, PUT /api/admin/users/:id
    // { is_active: 0 }) does not remove the row, so a deleted-row existence check
    // is insufficient — an is_active=0 user must also be rejected.
    const token = generateToken({ id: 'banned-1', username: 'banned' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    req.app = { locals: { usersRepo: { findById: () => ({ id: 'banned-1', is_active: 0 }) } } };
    const next = vi.fn();

    expect(() => requireAuth(req, res, next)).toThrow(AuthError);
    expect(next).not.toHaveBeenCalled();
  });


  it('passes through when no usersRepo is available (test harness)', () => {
    const token = generateToken({ id: '2', username: 'test' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
