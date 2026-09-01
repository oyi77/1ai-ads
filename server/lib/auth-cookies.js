/**
 * Auth cookie helpers — httpOnly session cookies for the SPA.
 *
 * The SPA authenticates via httpOnly cookies (adforge_access / adforge_refresh)
 * so access + refresh JWTs never live in localStorage (XSS-exfiltratable).
 * Tokens are still returned in JSON response bodies for API clients, tests,
 * and the existing Bearer flow — requireAuth accepts cookie OR Bearer.
 *
 * SameSite=Strict blocks cross-site cookie sending (CSRF mitigation for the
 * cookie-authenticated path). Secure only in production (HTTPS).
 */
import config from '../config/index.js';

export const ACCESS_COOKIE = 'adforge_access';
export const REFRESH_COOKIE = 'adforge_refresh';

const SECURE = config.nodeEnv === 'production';
const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15m — matches JWT expiry
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30d — matches JWT expiry

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: SECURE,
    path: '/api',
    maxAge: ACCESS_MAX_AGE,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: SECURE,
    path: '/api/auth',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
