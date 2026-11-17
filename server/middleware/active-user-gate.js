/**
 * Cached is_active gate for sensitive routes (DEF-11, audit 2026-11-18).
 *
 * requireAuth intentionally does NOT hit the DB on every request — a stale
 * WAL read snapshot could reject valid users. This middleware is opt-in for
 * high-value routes (payments, MCP connect, admin mutations) where a banned
 * user must be blocked even within the JWT's 15-minute lifetime.
 *
 * The negative result (banned/erased) is cached only briefly so a newly
 * banned user is blocked on the next request; positives use a longer TTL to
 * avoid a DB hit per request. A cache miss / DB error FAILS OPEN — the JWT
 * signature remains the primary gate, matching requireAuth's contract.
 */

import { AuthError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('active-user-gate');

const DEFAULT_TTL_MS = 60 * 1000;       // positive: re-check once a minute
const DEFAULT_NEG_TTL_MS = 5 * 1000;    // negative: re-check quickly

const cache = new Map(); // userId -> { active: boolean, expiresAt: number }

export function createActiveUserGate(usersRepo, options = {}) {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const negTtl = options.negativeTtlMs ?? DEFAULT_NEG_TTL_MS;

  return function requireActiveUser(req, _res, next) {
    const userId = req.user?.id;
    if (!userId) return next(new AuthError('Unauthorized'));

    const now = Date.now();
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) {
      if (!cached.active) return next(new AuthError('Account is inactive'));
      return next();
    }

    try {
      const user = usersRepo.findById(userId);
      const active = Boolean(user && user.is_active !== 0 && user.is_active !== false);
      cache.set(userId, { active, expiresAt: now + (active ? ttl : negTtl) });
      if (!active) {
        log.warn('Blocked inactive user on sensitive route', { userId, path: req.path });
        return next(new AuthError('Account is inactive'));
      }
      return next();
    } catch (err) {
      // Fail open — JWT is the primary gate; a DB hiccup must not lock out
      // every user from payments/MCP for the duration of a WAL snapshot.
      log.warn('is_active check failed; allowing via JWT', { userId, error: err.message });
      return next();
    }
  };
}

/** Test-only: clear the module-level cache between cases. */
export function clearActiveUserCache() {
  cache.clear();
}
