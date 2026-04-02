import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../../../server/middleware/auth.js';
import { generateToken } from '../../../server/lib/auth.js';

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

  it('returns 401 with no header', () => {
    const { req, res } = mockReqRes(null);
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with bad token', () => {
    const { req, res } = mockReqRes('Bearer garbage');
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with non-Bearer scheme', () => {
    const { req, res } = mockReqRes('Basic abc123');
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});
