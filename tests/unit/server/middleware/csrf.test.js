import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from '../../../../../server/middleware/csrf.js';
import { ACCESS_COOKIE } from '../../../../../server/lib/auth-cookies.js';

vi.mock('../../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

function req({ method = 'POST', cookie = true, origin, referer } = {}) {
  return {
    method,
    cookies: cookie ? { [ACCESS_COOKIE]: 'tok' } : {},
    headers: { ...(origin ? { origin } : {}), ...(referer ? { referer } : {}) },
  };
}

describe('csrfProtection origin check', () => {
  it('lets GET through regardless of origin', () => {
    const next = vi.fn();
    csrfProtection(req({ method: 'GET', origin: 'https://evil.example.com' }), {}, next);
    expect(next).toHaveBeenCalled();
  });

  it('lets Bearer-authenticated mutations through (no cookie present)', () => {
    const next = vi.fn();
    csrfProtection(req({ cookie: false, origin: 'https://evil.example.com' }), {}, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects a cross-origin cookie-authenticated mutation', () => {
    expect(() =>
      csrfProtection(req({ origin: 'https://evil.example.com' }), {}, vi.fn()),
    ).toThrow(/Cross-origin request rejected/);
  });

  it('accepts the configured production origin', () => {
    const next = vi.fn();
    csrfProtection(req({ origin: 'https://adforge.aitradepulse.com' }), {}, next);
    expect(next).toHaveBeenCalled();
  });
});
