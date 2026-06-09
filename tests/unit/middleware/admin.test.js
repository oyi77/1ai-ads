import { describe, it, expect, vi } from 'vitest';
import { requireAdmin } from '../../../server/middleware/auth.js';

function mockReqRes(user) {
  const req = user ? { user } : { headers: {} };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { req, res };
}

describe('requireAdmin middleware', () => {
  it('calls next() for admin users', () => {
    const { req, res } = mockReqRes({ id: '1', role: 'admin' });
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin users', () => {
    const { req, res } = mockReqRes({ id: '2', role: 'user' });
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'Admin access required' });
  });

  it('returns 403 when no user on request', () => {
    const { req, res } = mockReqRes(null);
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'Admin access required' });
  });
});
