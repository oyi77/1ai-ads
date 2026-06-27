import { describe, it, expect, beforeAll } from 'vitest';
import { generateToken } from '../../../../server/lib/auth.js';
import { createPagesRouter } from '../../../../server/routes/pages.js';

// Ensure config picks up the test JWT secret
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
});

/**
 * Build mock req / res objects for the requireSession middleware.
 * @param {string|undefined} tokenCookie - value of the `token` cookie, or omit for no cookie
 */
function mockReqRes(tokenCookie) {
  const req = { cookies: tokenCookie ? { token: tokenCookie } : {} };
  const res = {
    statusCode: null,
    body: null,
    _redirect: null,
    _clearedCookie: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    redirect(url) { this._redirect = url; },
    clearCookie(name) { this._clearedCookie = name; },
    render() {},
  };
  return { req, res };
}

/**
 * Extract the requireSession middleware from the /app route in the router stack.
 * The router registers: router.get('/app', requireSession, handler) —
 * so requireSession is layer 0 handler for the /app route.
 */
function getRequireSessionMiddleware() {
  const router = createPagesRouter();
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/app'
  );
  // requireSession is the first middleware on the route stack
  return layer.route.stack[0].handle;
}

/**
 * Helper: call requireSession and resolve with { user, redirect, clearedCookie }.
 */
async function callMiddleware(tokenCookie) {
  const requireSession = getRequireSessionMiddleware();
  const { req, res } = mockReqRes(tokenCookie);
  const nextCalls = [];
  const next = () => nextCalls.push(true);

  await requireSession(req, res, next);

  return {
    user: req.user ?? null,
    redirect: res._redirect,
    clearedCookie: res._clearedCookie,
    nextCalled: nextCalls.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireSession middleware
// ─────────────────────────────────────────────────────────────────────────────

describe('requireSession middleware', () => {
  it('redirects to /login when there are no cookies', async () => {
    const result = await callMiddleware(undefined);
    expect(result.redirect).toBe('/login');
    expect(result.nextCalled).toBe(false);
  });

  it('redirects to /login when token cookie is empty string', async () => {
    const result = await callMiddleware('');
    expect(result.redirect).toBe('/login');
    expect(result.nextCalled).toBe(false);
  });

  it('clears cookie and redirects to /login for an invalid token', async () => {
    const result = await callMiddleware('not-a-valid-jwt');
    expect(result.clearedCookie).toBe('token');
    expect(result.redirect).toBe('/login');
    expect(result.nextCalled).toBe(false);
  });

  it('clears cookie and redirects to /login for an expired token', async () => {
    // Create a token that expired 1 hour ago
    const expiredPayload = { id: 'u1', email: 'test@example.com' };
    const expiredToken = generateToken(expiredPayload, '0s');
    // Wait a tick so the token is actually in the past
    await new Promise((r) => setTimeout(r, 50));

    const result = await callMiddleware(expiredToken);
    expect(result.clearedCookie).toBe('token');
    expect(result.redirect).toBe('/login');
    expect(result.nextCalled).toBe(false);
  });

  it('sets req.user and calls next() for a valid token', async () => {
    const payload = { id: 'u42', email: 'user@example.com' };
    const token = generateToken(payload);

    const result = await callMiddleware(token);
    expect(result.nextCalled).toBe(true);
    expect(result.redirect).toBeNull();
    expect(result.user).toBeTruthy();
    expect(result.user.id).toBe('u42');
    expect(result.user.email).toBe('user@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPagesRouter
// ─────────────────────────────────────────────────────────────────────────────

describe('createPagesRouter', () => {
  it('returns an Express Router', () => {
    const router = createPagesRouter();
    expect(router).toBeDefined();
    expect(typeof router.use).toBe('function');
    expect(typeof router.get).toBe('function');
  });

  it('has GET handlers for all authenticated pages', () => {
    const router = createPagesRouter();
    const protectedPaths = [
      '/app',
      '/campaigns',
      '/automation',
      '/settings',
      '/creative/library',
      '/creative/fatigue',
      '/creative/scoring',
      '/testing/ab-tests',
      '/reporting/unified',
      '/reporting/widgets',
    ];

    for (const path of protectedPaths) {
      const layer = router.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods.get
      );
      expect(layer, `Expected GET ${path} to be registered`).toBeDefined();
      // Should have at least 2 handlers (requireSession + render handler)
      expect(
        layer.route.stack.length,
        `Expected ${path} to have requireSession middleware`
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('/login does not require auth', () => {
    const router = createPagesRouter();
    const layer = router.stack.find(
      (l) => l.route && l.route.path === '/login'
    );
    expect(layer, 'Expected /login to be registered').toBeDefined();
    // Only the render handler, no requireSession middleware
    expect(layer.route.stack.length).toBe(1);
    // And the single handler should NOT be requireSession (it won't redirect)
    const { req, res } = mockReqRes(undefined);
    const next = () => {};
    // Calling the handler should not redirect
    layer.route.stack[0].handle(req, res, next);
    expect(res._redirect).toBeNull();
  });

  it('/register does not require auth', () => {
    const router = createPagesRouter();
    const layer = router.stack.find(
      (l) => l.route && l.route.path === '/register'
    );
    expect(layer, 'Expected /register to be registered').toBeDefined();
    expect(layer.route.stack.length).toBe(1);
    const { req, res } = mockReqRes(undefined);
    const next = () => {};
    layer.route.stack[0].handle(req, res, next);
    expect(res._redirect).toBeNull();
  });
});
