import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../../../server/lib/errors.js';
import { clearActiveUserCache, createActiveUserGate } from '../../../server/middleware/active-user-gate.js';

function invoke(middleware, userId = 'u1') {
  const req = { user: { id: userId }, path: '/api/mcp/sse' };
  const next = vi.fn();
  middleware(req, {}, next);
  return next;
}

describe('createActiveUserGate', () => {
  beforeEach(() => clearActiveUserCache());

  it('passes active users and caches positive lookups', () => {
    const usersRepo = { findById: vi.fn(() => ({ id: 'u1', is_active: 1 })) };
    const middleware = createActiveUserGate(usersRepo);
    expect(invoke(middleware).mock.calls[0][0]).toBeUndefined();
    expect(invoke(middleware).mock.calls[0][0]).toBeUndefined();
    expect(usersRepo.findById).toHaveBeenCalledTimes(1);
  });

  it('blocks inactive users with AuthError', () => {
    const usersRepo = { findById: vi.fn(() => ({ id: 'u1', is_active: 0 })) };
    const next = invoke(createActiveUserGate(usersRepo));
    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthError);
    expect(next.mock.calls[0][0].message).toMatch(/inactive/i);
  });

  it('fails open when the user lookup throws', () => {
    const usersRepo = { findById: vi.fn(() => { throw new Error('sqlite busy'); }) };
    const next = invoke(createActiveUserGate(usersRepo));
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('requires an authenticated user', () => {
    const middleware = createActiveUserGate({ findById: vi.fn() });
    const next = vi.fn();
    middleware({ user: null }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthError);
  });

  it('expires cached positive state using the configured TTL', () => {
    vi.useFakeTimers();
    const usersRepo = { findById: vi.fn(() => ({ id: 'u1', is_active: 1 })) };
    const middleware = createActiveUserGate(usersRepo, { ttlMs: 1000 });
    invoke(middleware);
    vi.advanceTimersByTime(1001);
    invoke(middleware);
    expect(usersRepo.findById).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
