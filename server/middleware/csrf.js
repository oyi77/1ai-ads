/**
 * CSRF protection for httpOnly-cookie-authenticated requests.
 *
 * SameSite=Strict cookies already block cross-site cookie sending, but
 * defense-in-depth: for mutating requests that authenticated via the httpOnly
 * access cookie, verify the Origin header matches the configured CORS origin
 * (or falls back to Referer). Requests authenticated via Bearer (API clients,
 * service-to-service, tests) skip this check — they can't be CSRF'd since the
 * browser doesn't attach Bearer automatically.
 */
import config from '../config/index.js';
import { AuthError } from '../lib/errors.js';
import { ACCESS_COOKIE } from '../lib/auth-cookies.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_ORIGINS = () => {
  const origins = new Set();
  if (config.corsOrigin) origins.add(config.corsOrigin);
  if (config.publicBaseUrl) origins.add(config.publicBaseUrl);
  if (config.webAppUrl) origins.add(config.webAppUrl);
  // Same-origin requests from these hosts
  for (const host of ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5000', 'http://127.0.0.1:5000']) {
    origins.add(host);
  }
  return origins;
};

export function csrfProtection(req, _res, next) {
  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) return next();

  // Only cookie-authenticated requests need the Origin check.
  if (!req.cookies?.[ACCESS_COOKIE]) return next();

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // No Origin/Referer (curl, same-origin fetch without explicit Origin) —
    // allow; SameSite=Strict cookie is the primary defense.
    return next();
  }

  const normalized = origin.replace(/\/+$/, '');
  const allowed = ALLOWED_ORIGINS();
  let ok = allowed.has(normalized);
  if (!ok) {
    // Accept any origin whose hostname matches our own hostnames (port-agnostic
    // localhost/dev variants) — e.g. http://localhost:5173 vs :5174.
    for (const a of allowed) {
      try {
        const aHost = new URL(a).hostname;
        const oHost = new URL(normalized).hostname;
        if (aHost === oHost) { ok = true; break; }
      } catch { /* malformed URL — skip */ }
    }
  }
  if (!ok) {
    throw new AuthError('Cross-origin request rejected');
  }
  return next();
}
